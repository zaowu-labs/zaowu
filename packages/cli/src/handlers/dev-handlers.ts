import {
  askAI,
  resolveAIModel,
  resolveAIProviderNetworkTarget,
  validateAIProviderConfig,
} from '@zaowu-labs/ai';
import { loadResolvedConfig } from '@zaowu-labs/config';
import {
  getDevStatus,
  isDevFindingCategory,
  isDevFindingPriority,
  isDevFindingSeverity,
  previewDevCommit,
  reviewDevChanges,
  syncDevRepo,
  type DevReviewMode,
} from '@zaowu-labs/dev';
import {
  assertOperationPlanFingerprint,
  createOperationPlan,
  formatCounts,
  formatFinding,
  formatList,
  formatOperationPlan,
  getValue,
  hasFlag,
  result,
  withOperationPlan,
  ZaoWuError,
  type DomainActionHandler,
  type DomainHandlerContext,
  type OperationPlan,
} from '../handler-utils.js';

const getAiReviewOrCommit = async (
  context: DomainHandlerContext,
  prompt: string
): Promise<{ output: string; providerId: string; modelName: string }> => {
  let providerId = getValue(context.parsed, '--provider');
  if (!providerId) {
    try {
      const config = await loadResolvedConfig(context.cwd);
      providerId = config.config.ai.provider ?? undefined;
    } catch {
      // ignore — fall back to default provider
    }
  }
  const requestedModel = getValue(context.parsed, '--model');
  const providerValidation = validateAIProviderConfig(providerId);
  const provider = providerValidation.provider;
  const resolvedModel = resolveAIModel(provider, { model: requestedModel });

  if (provider.network && !context.yes) {
    throw new ZaoWuError({
      code: 'AI_NETWORK_CONFIRMATION_REQUIRED',
      message: 'Network AI request requires confirmation.',
      why: `The AI-assisted dev command sends diff context to the network provider \`${provider.id}\`.`,
      fix: 'Run the command with the `--yes` flag to confirm sending the diff context.',
    });
  }

  const response = await askAI({
    prompt,
    provider: providerId,
    model: requestedModel,
    allowNetwork: context.yes,
  });

  return {
    output: response.output,
    providerId: provider.id,
    modelName: resolvedModel,
  };
};

const getGitDiffText = (
  commandRunner: (command: string, args: readonly string[], options?: { cwd?: string }) => string,
  cwd: string,
  gitArgs: string[]
): string => {
  let diffText = '';
  try {
    diffText = commandRunner('git', gitArgs, { cwd });
  } catch {
    // ignore — diff may be empty
  }
  if (diffText.length > 100000) {
    diffText = diffText.slice(0, 100000) + '\n... [truncated] ...';
  }
  return diffText;
};

const buildAiOperationPlan = (
  providerId: string,
  reviewUsesWorktree: boolean,
  isReview: boolean
): OperationPlan => {
  const provider = validateAIProviderConfig(providerId).provider;
  const networkTarget = provider.network ? resolveAIProviderNetworkTarget(providerId) : undefined;
  const actionName = isReview ? 'review' : 'suggestion';
  return createOperationPlan({
    risk: provider.network ? 'medium' : 'low',
    reads: isReview
      ? reviewUsesWorktree
        ? ['working-tree git diff', 'untracked git file list']
        : ['staged git diff']
      : ['staged git diff', 'staged git diff hunks'],
    executes: isReview
      ? reviewUsesWorktree
        ? ['git diff', 'git ls-files --others --exclude-standard']
        : ['git diff --cached']
      : ['git diff --cached'],
    network: networkTarget ? [networkTarget] : [],
    secrets: provider.requiredEnv,
    notes: [`AI ${actionName} was generated using the ${providerId} provider.`],
  });
};

export const handleDevCommit: DomainActionHandler = async (_args, context) => {
  const preview = previewDevCommit(context.commandRunner, { cwd: context.cwd });
  let operationPlan = createOperationPlan({
    risk: 'low',
    reads: ['staged git diff', 'staged git diff hunks'],
    executes: ['git diff --cached'],
    notes: ['No Git state is modified.'],
  });

  if (context.parsed.flags.has('--ai')) {
    const diffText = getGitDiffText(context.commandRunner, context.cwd, ['diff', '--cached']);
    const prompt = [
      'Generate a Conventional Commit message for the following staged changes.',
      'Follow the Conventional Commits specification (e.g. feat(scope): message).',
      'Respond ONLY with the commit message, including a title and an optional body/footer.',
      '',
      'Changes:',
      diffText,
    ].join('\n');

    const aiResponse = await getAiReviewOrCommit(context, prompt);
    const lines = aiResponse.output
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const title = lines[0] || preview.suggestion.title;
    const body = lines.slice(1);

    const match = /^([a-z0-9]+)(?:\(([^)]+)\))?:\s*(.+)$/i.exec(title);
    const type = match?.[1] || preview.suggestion.type;
    const scope = match?.[2] || preview.suggestion.scope;
    const subject = match?.[3] || preview.suggestion.subject;

    preview.suggestion = {
      type,
      scope,
      subject,
      title,
      body: body.length > 0 ? body : preview.suggestion.body,
    };
    preview.message = title;

    operationPlan = buildAiOperationPlan(aiResponse.providerId, false, false);
  }

  assertOperationPlanFingerprint(context, operationPlan);

  const human = [
    'ZaoWu Dev Commit',
    '',
    'No Git state was modified.',
    '',
    `Files: ${preview.summary.files.length}`,
    `Changes: +${preview.summary.additions}/-${preview.summary.deletions}`,
    '',
    'Categories:',
    formatCounts(preview.summary.categories),
    '',
    'Suggested commit:',
    preview.message,
    '',
    'Suggested body:',
    formatList(preview.suggestion.body),
    '',
    'Findings:',
    ...(preview.findings.length > 0
      ? preview.findings.map((finding) => formatFinding(finding))
      : ['- none']),
    '',
    'Recommended checks:',
    formatList(preview.recommendedChecks),
    '',
    formatOperationPlan(operationPlan),
  ].join('\n');

  return result(context, withOperationPlan(preview, operationPlan), human);
};

export const handleDevReview: DomainActionHandler = async (_args, context) => {
  const mode: DevReviewMode = context.parsed.flags.has('--staged')
    ? 'staged'
    : context.parsed.flags.has('--worktree')
      ? 'worktree'
      : 'auto';
  const review = reviewDevChanges(context.commandRunner, { cwd: context.cwd, mode });
  const reviewUsesWorktree = review.source === 'working-tree';
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

  if (context.parsed.flags.has('--ai')) {
    const gitArgs = reviewUsesWorktree ? ['diff'] : ['diff', '--cached'];
    const diffText = getGitDiffText(context.commandRunner, context.cwd, gitArgs);
    const prompt = [
      'Perform a code review of the following Git changes.',
      'Find potential security vulnerabilities, performance issues, architectural flaws, bugs, or test gaps.',
      'Format your review as a JSON array of finding objects, like this:',
      '[',
      '  {',
      '    "severity": "info" | "warning",',
      '    "priority": "low" | "medium" | "high",',
      '    "category": "security" | "performance" | "quality" | "test" | "filesystem" | "network" | "git",',
      '    "title": "Short title",',
      '    "detail": "Detailed explanation of the issue and fix.",',
      '    "filePath": "relative/path/to/file",',
      '    "line": 123,',
      '    "hunkHeader": "@@ ... @@"',
      '  }',
      ']',
      'Respond ONLY with the JSON array. Do not wrap in markdown code blocks.',
      '',
      'Changes:',
      diffText,
    ].join('\n');

    const aiResponse = await getAiReviewOrCommit(context, prompt);
    let cleanOutput = aiResponse.output.trim();
    if (cleanOutput.startsWith('```')) {
      cleanOutput = cleanOutput.replace(/^```[a-z]*\r?\n/, '').replace(/\r?\n```$/, '');
    }
    let aiFindings: unknown[] = [];
    let isParsedArray = false;
    try {
      const parsed = JSON.parse(cleanOutput);
      if (Array.isArray(parsed)) {
        aiFindings = parsed;
        isParsedArray = true;
      }
    } catch {
      // Fall back to wrapping the raw AI output as a plain-text summary finding.
    }

    if (!isParsedArray) {
      aiFindings = [
        {
          severity: 'info',
          priority: 'medium',
          category: 'quality',
          title: 'AI Code Review Summary',
          detail: aiResponse.output.trim(),
        },
      ];
    }

    for (const item of aiFindings) {
      const finding = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      review.findings.push({
        severity: isDevFindingSeverity(finding.severity) ? finding.severity : 'info',
        priority: isDevFindingPriority(finding.priority) ? finding.priority : 'medium',
        category: isDevFindingCategory(finding.category) ? finding.category : 'quality',
        title: typeof finding.title === 'string' ? finding.title : 'AI Review',
        detail: typeof finding.detail === 'string' ? finding.detail : '',
        filePath: typeof finding.filePath === 'string' ? finding.filePath : undefined,
        line:
          Number.isInteger(finding.line) && Number(finding.line) > 0
            ? Number(finding.line)
            : undefined,
        hunkHeader: typeof finding.hunkHeader === 'string' ? finding.hunkHeader : undefined,
      });
    }

    operationPlan = buildAiOperationPlan(aiResponse.providerId, reviewUsesWorktree, true);
  }

  assertOperationPlanFingerprint(context, operationPlan);

  const human = [
    'ZaoWu Dev Review',
    '',
    `Source: ${review.source}`,
    `Files: ${review.summary.files.length}`,
    `Changes: +${review.summary.additions}/-${review.summary.deletions}`,
    '',
    'Categories:',
    formatCounts(review.summary.categories),
    '',
    'Findings:',
    ...review.findings.map((finding) => formatFinding(finding)),
    '',
    'Diff hunks:',
    ...(review.diffHunks.length > 0
      ? review.diffHunks.map(
          (hunk) => `- ${hunk.filePath} ${hunk.header}: +${hunk.addedLines}/-${hunk.removedLines}`
        )
      : ['- none']),
    '',
    'Recommended checks:',
    formatList(review.recommendedChecks),
    '',
    formatOperationPlan(operationPlan),
  ].join('\n');

  return result(context, withOperationPlan(review, operationPlan), human);
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
  const confirmCommand = [
    'zw dev sync',
    '--yes',
    ...(requiresDiscardLocal ? ['--discard-local'] : []),
    '--plan-fingerprint',
    operationPlan.fingerprint,
  ].join(' ');

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
