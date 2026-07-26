import { askAI } from '@zaowu-labs/ai';
import {
  applyDevAiCommitSuggestion,
  buildDevAiCommitPrompt,
  buildDevAiReviewPrompt,
  getDevStatus,
  parseDevAiReviewFindings,
  previewDevCommit,
  reviewDevChanges,
  syncDevRepo,
  type DevReviewMode,
} from '@zaowu-labs/dev';
import {
  assertOperationPlanFingerprint,
  createContentOperationSubjects,
  createOperationPlan,
  formatConfirmCommand,
  formatCounts,
  formatFinding,
  formatList,
  formatOperationPlan,
  getValue,
  hasFlag,
  resolveAiProvider,
  result,
  withOperationPlan,
  ZaoWuError,
  type DomainActionHandler,
  type DomainHandlerContext,
  type OperationPlan,
  type ResolvedAiProvider,
} from '../handler-utils.js';

const getGitDiffText = (context: DomainHandlerContext, gitArgs: string[]): string => {
  try {
    return context.commandRunner('git', gitArgs, { cwd: context.cwd });
  } catch {
    // ignore — diff may be empty
    return '';
  }
};

/**
 * Operation plan for an AI-assisted dev command. The exact prompt (instructions
 * plus the truncated diff) is folded into the plan subjects, so the preview
 * fingerprint only authorizes a confirmed run that sends identical content —
 * a diff staged between preview and confirm invalidates the plan.
 */
const buildAiOperationPlan = (
  ai: ResolvedAiProvider,
  prompt: string,
  context: DomainHandlerContext,
  options: { isReview: boolean; reviewUsesWorktree: boolean }
): OperationPlan => {
  const actionName = options.isReview ? 'review' : 'suggestion';

  return createOperationPlan({
    risk: ai.provider.network ? 'medium' : 'low',
    confirmationRequired: ai.provider.network && !context.yes,
    subjects: [
      `ai:${ai.providerId}`,
      `model:${ai.resolvedModel}`,
      ...createContentOperationSubjects(prompt),
    ],
    reads: options.isReview
      ? options.reviewUsesWorktree
        ? ['working-tree git diff', 'untracked git file list']
        : ['staged git diff']
      : ['staged git diff', 'staged git diff hunks'],
    executes: options.isReview
      ? options.reviewUsesWorktree
        ? ['git diff', 'git ls-files --others --exclude-standard']
        : ['git diff --cached']
      : ['git diff --cached'],
    network: ai.networkTarget ? [ai.networkTarget] : [],
    secrets: ai.provider.requiredEnv,
    notes: [
      ai.provider.network
        ? `AI ${actionName} sends the diff context to the ${ai.providerId} provider and requires --yes.`
        : `AI ${actionName} was generated using the ${ai.providerId} provider.`,
    ],
  });
};

const buildAiConfirmCommand = (
  commandParts: readonly string[],
  ai: ResolvedAiProvider,
  operationPlan: OperationPlan
): string =>
  formatConfirmCommand([
    ...commandParts,
    '--ai',
    '--provider',
    ai.providerId,
    ...(ai.requestedModel ? ['--model', ai.requestedModel] : []),
    '--yes',
    '--plan-fingerprint',
    operationPlan.fingerprint,
  ]);

const formatAiPreviewHuman = (
  title: string,
  ai: ResolvedAiProvider,
  operationPlan: OperationPlan,
  confirmCommand: string
): string =>
  [
    title,
    '',
    'Status: preview',
    `Provider: ${ai.providerId} (${ai.provider.name})`,
    `Model: ${ai.resolvedModel}`,
    `Endpoint: ${ai.networkTarget ?? 'local'}`,
    '',
    formatOperationPlan(operationPlan),
    '',
    'No provider request was sent.',
    '',
    'To send exactly this AI request, run:',
    `  ${confirmCommand}`,
  ].join('\n');

export const handleDevCommit: DomainActionHandler = async (_args, context) => {
  const preview = previewDevCommit(context.commandRunner, { cwd: context.cwd });
  let payload = preview;
  let operationPlan = createOperationPlan({
    risk: 'low',
    reads: ['staged git diff', 'staged git diff hunks'],
    executes: ['git diff --cached'],
    notes: ['No Git state is modified.'],
  });

  if (hasFlag(context.parsed, '--ai')) {
    const diffText = getGitDiffText(context, ['diff', '--cached']);
    const prompt = buildDevAiCommitPrompt(diffText);
    const ai = await resolveAiProvider(context);

    operationPlan = buildAiOperationPlan(ai, prompt, context, {
      isReview: false,
      reviewUsesWorktree: false,
    });

    if (ai.provider.network && !context.yes) {
      const confirmCommand = buildAiConfirmCommand(['zw', 'dev', 'commit'], ai, operationPlan);
      const human = formatAiPreviewHuman('ZaoWu Dev Commit', ai, operationPlan, confirmCommand);

      return result(
        context,
        withOperationPlan({ ...preview, status: 'preview' as const }, operationPlan),
        human
      );
    }

    // The fingerprint must be verified before any provider request is sent.
    assertOperationPlanFingerprint(context, operationPlan);

    const response = await askAI({
      prompt,
      provider: ai.providerId,
      model: ai.requestedModel,
      allowNetwork: context.yes,
    });

    payload = applyDevAiCommitSuggestion(preview, response.output);
  } else {
    assertOperationPlanFingerprint(context, operationPlan);
  }

  const human = [
    'ZaoWu Dev Commit',
    '',
    'No Git state was modified.',
    '',
    `Files: ${payload.summary.files.length}`,
    `Changes: +${payload.summary.additions}/-${payload.summary.deletions}`,
    '',
    'Categories:',
    formatCounts(payload.summary.categories),
    '',
    'Suggested commit:',
    payload.message,
    '',
    'Suggested body:',
    formatList(payload.suggestion.body),
    '',
    'Findings:',
    ...(payload.findings.length > 0
      ? payload.findings.map((finding) => formatFinding(finding))
      : ['- none']),
    '',
    'Recommended checks:',
    formatList(payload.recommendedChecks),
    '',
    formatOperationPlan(operationPlan),
  ].join('\n');

  return result(context, withOperationPlan(payload, operationPlan), human);
};

const resolveReviewMode = (
  context: DomainHandlerContext
): { mode: DevReviewMode; modeFlags: string[] } => {
  if (hasFlag(context.parsed, '--staged')) {
    return { mode: 'staged', modeFlags: ['--staged'] };
  }

  if (hasFlag(context.parsed, '--worktree')) {
    return { mode: 'worktree', modeFlags: ['--worktree'] };
  }

  return { mode: 'auto', modeFlags: [] };
};

export const handleDevReview: DomainActionHandler = async (_args, context) => {
  const { mode, modeFlags } = resolveReviewMode(context);
  const review = reviewDevChanges(context.commandRunner, { cwd: context.cwd, mode });
  const reviewUsesWorktree = review.source === 'working-tree';
  let payload = review;
  let operationPlan = createOperationPlan({
    risk: 'low',
    reads: reviewUsesWorktree
      ? ['working-tree git diff', 'untracked git file list']
      : ['staged git diff'],
    executes: reviewUsesWorktree
      ? ['git diff', 'git ls-files --others --exclude-standard']
      : ['git diff --cached'],
    notes: ['No Git state is modified.'],
  });

  if (hasFlag(context.parsed, '--ai')) {
    const gitArgs = reviewUsesWorktree ? ['diff'] : ['diff', '--cached'];
    const diffText = getGitDiffText(context, gitArgs);
    const prompt = buildDevAiReviewPrompt(diffText);
    const ai = await resolveAiProvider(context);

    operationPlan = buildAiOperationPlan(ai, prompt, context, {
      isReview: true,
      reviewUsesWorktree,
    });

    if (ai.provider.network && !context.yes) {
      const confirmCommand = buildAiConfirmCommand(
        ['zw', 'dev', 'review', ...modeFlags],
        ai,
        operationPlan
      );
      const human = formatAiPreviewHuman('ZaoWu Dev Review', ai, operationPlan, confirmCommand);

      return result(
        context,
        withOperationPlan({ ...review, status: 'preview' as const }, operationPlan),
        human
      );
    }

    // The fingerprint must be verified before any provider request is sent.
    assertOperationPlanFingerprint(context, operationPlan);

    const response = await askAI({
      prompt,
      provider: ai.providerId,
      model: ai.requestedModel,
      allowNetwork: context.yes,
    });

    payload = {
      ...review,
      findings: [...review.findings, ...parseDevAiReviewFindings(response.output)],
    };
  } else {
    assertOperationPlanFingerprint(context, operationPlan);
  }

  const human = [
    'ZaoWu Dev Review',
    '',
    `Source: ${payload.source}`,
    `Files: ${payload.summary.files.length}`,
    `Changes: +${payload.summary.additions}/-${payload.summary.deletions}`,
    '',
    'Categories:',
    formatCounts(payload.summary.categories),
    '',
    'Findings:',
    ...payload.findings.map((finding) => formatFinding(finding)),
    '',
    'Diff hunks:',
    ...(payload.diffHunks.length > 0
      ? payload.diffHunks.map(
          (hunk) => `- ${hunk.filePath} ${hunk.header}: +${hunk.addedLines}/-${hunk.removedLines}`
        )
      : ['- none']),
    '',
    'Recommended checks:',
    formatList(payload.recommendedChecks),
    '',
    formatOperationPlan(operationPlan),
  ].join('\n');

  return result(context, withOperationPlan(payload, operationPlan), human);
};

export const handleDevStatus: DomainActionHandler = async (_args, context) => {
  const status = getDevStatus(context.commandRunner, { cwd: context.cwd });
  const operationPlan = createOperationPlan({
    risk: 'low',
    reads: ['git status'],
    executes: ['git status --short --branch'],
    notes: ['No Git state is modified.'],
  });
  const human = [
    'ZaoWu Dev Status',
    '',
    `Branch: ${status.branch}`,
    `Clean: ${status.clean ? 'yes' : 'no'}`,
    '',
    `Staged: ${status.staged.length}`,
    ...status.staged.map((file) => `- ${file}`),
    '',
    `Unstaged: ${status.unstaged.length}`,
    ...status.unstaged.map((file) => `- ${file}`),
    '',
    `Untracked: ${status.untracked.length}`,
    ...status.untracked.map((file) => `- ${file}`),
    '',
    formatOperationPlan(operationPlan),
  ].join('\n');

  return result(context, withOperationPlan(status, operationPlan), human);
};

export const handleDevSync: DomainActionHandler = async (_args, context) => {
  const preview = syncDevRepo(context.commandRunner, { cwd: context.cwd });
  const discardLocal = hasFlag(context.parsed, '--discard-local');

  if (!preview.operationPlan) {
    throw new ZaoWuError({
      code: 'INTERNAL_ERROR',
      message: 'Operation plan is required for synchronization preview.',
      why: 'ZaoWu could not generate an operation plan for the Git synchronization.',
      fix: 'Verify your Git repository is configured correctly.',
    });
  }

  assertOperationPlanFingerprint(context, preview.operationPlan);

  const syncResult = context.yes
    ? syncDevRepo(context.commandRunner, { cwd: context.cwd, yes: true, discardLocal })
    : preview;
  const operationPlan = syncResult.operationPlan ?? preview.operationPlan;
  const requiresDiscardLocal = operationPlan.notes.some((note) =>
    note.includes('Confirmed sync requires both --yes and --discard-local')
  );
  const confirmCommand = formatConfirmCommand([
    'zw',
    'dev',
    'sync',
    '--yes',
    ...(requiresDiscardLocal ? ['--discard-local'] : []),
    '--plan-fingerprint',
    operationPlan.fingerprint,
  ]);

  const human = [
    'ZaoWu Dev Sync',
    '',
    `Status: ${syncResult.status}`,
    `Branch: ${syncResult.branch}`,
    `Previous commit: ${syncResult.previousCommit}`,
    `Current commit: ${syncResult.currentCommit}`,
    '',
    formatOperationPlan(operationPlan),
    ...(context.yes ? [] : ['', 'To execute exactly this plan, run:', `  ${confirmCommand}`]),
    '',
    syncResult.output,
  ].join('\n');

  return result(context, withOperationPlan(syncResult, operationPlan), human);
};
