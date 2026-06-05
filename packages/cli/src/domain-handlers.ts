import { askAI, listAIProviders, previewAIRequest, validateAIProviderConfig } from '@zaowu/ai';
import { planWorkflowFile, runWorkflowFile, validateWorkflowFile } from '@zaowu/auto';
import {
  findConfigPathOrThrow,
  getResolvedConfigValue,
  loadResolvedConfig,
  migrateResolvedConfig,
  setResolvedConfigValue,
  validateResolvedConfig,
} from '@zaowu/config';
import { createOperationPlan, ZaoWuError, type OperationPlan } from '@zaowu/core';
import { analyzeData, cleanData, inferDataSchema, inspectData, sampleData } from '@zaowu/data';
import { getDevStatus, previewDevCommit, reviewDevChanges, type DevReviewMode } from '@zaowu/dev';
import {
  convertDocument,
  extractDocument,
  outlineDocument,
  searchDocument,
  summarizeDocument,
} from '@zaowu/doc';
import { installPlugin, listPlugins, removePlugin, validatePluginSource } from '@zaowu/plugin';
import { createTeachingPlan, createTeachingQuiz } from '@zaowu/teach';
import { fetchWebTarget, inspectWebTarget } from '@zaowu/web';
import { getValue, type ParsedArgs } from './args.js';
import { createResult, stringifyJSON } from './output.js';
import type { CliResult, CommandRunner } from './types.js';

export interface DomainHandlerContext {
  cwd: string;
  json: boolean;
  dryRun: boolean;
  yes: boolean;
  parsed: ParsedArgs;
  commandRunner: CommandRunner;
}

type DomainActionHandler = (
  args: readonly string[],
  context: DomainHandlerContext
) => Promise<CliResult>;

const requireTarget = (args: readonly string[], command: string): string => {
  const target = args[0];

  if (!target) {
    throw new ZaoWuError({
      code: 'TARGET_REQUIRED',
      message: 'Target is required.',
      why: `\`${command}\` needs a target argument.`,
      fix: `Run \`${command} --help\` to see the expected usage.`,
    });
  }

  return target;
};

const requireSecondTarget = (args: readonly string[], command: string, name: string): string => {
  const target = args[1];

  if (!target) {
    throw new ZaoWuError({
      code: 'TARGET_REQUIRED',
      message: `${name} is required.`,
      why: `\`${command}\` needs ${name} as its second argument.`,
      fix: `Run \`${command} --help\` to see the expected usage.`,
    });
  }

  return target;
};

const result = (context: DomainHandlerContext, payload: unknown, human: string): CliResult =>
  createResult(0, context.json ? stringifyJSON(payload) : human);

const formatObject = (value: unknown): string => JSON.stringify(value, null, 2);

const withOperationPlan = <T extends object>(
  payload: T,
  operationPlan: OperationPlan
): T & { operationPlan: OperationPlan } => ({
  ...payload,
  operationPlan,
});

const formatList = (items: readonly string[]): string =>
  items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- none';

const formatCounts = (items: Record<string, number>): string => {
  const lines = Object.entries(items)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => `- ${name}: ${count}`);

  return lines.length > 0 ? lines.join('\n') : '- none';
};

const formatPolicy = (policy: { shell: string; fileWrites: string; network: string }): string =>
  [
    `- shell: ${policy.shell}`,
    `- fileWrites: ${policy.fileWrites}`,
    `- network: ${policy.network}`,
  ].join('\n');

const formatSandbox = (sandbox: {
  root: string;
  shellCommands: string;
  fileWrites: string;
  network: string;
}): string =>
  [
    `- root: ${sandbox.root}`,
    `- shellCommands: ${sandbox.shellCommands}`,
    `- fileWrites: ${sandbox.fileWrites}`,
    `- network: ${sandbox.network}`,
  ].join('\n');

const formatFinding = (finding: {
  severity: string;
  title: string;
  detail: string;
  filePath?: string;
  hunkHeader?: string;
}): string => {
  const location = [finding.filePath, finding.hunkHeader].filter(Boolean).join(' ');

  return `- ${finding.severity}: ${finding.title}${location ? ` (${location})` : ''} - ${finding.detail}`;
};

const formatOperationPlan = (plan: OperationPlan): string =>
  [
    'Operation plan:',
    `Risk: ${plan.risk}`,
    `Confirmation required: ${plan.confirmationRequired ? 'yes' : 'no'}`,
    '',
    'Read:',
    formatList(plan.reads),
    '',
    'Write:',
    formatList(plan.writes),
    '',
    'Delete:',
    formatList(plan.deletes),
    '',
    'Execute:',
    formatList(plan.executes),
    '',
    'Network:',
    formatList(plan.network),
    '',
    'Secrets:',
    formatList(plan.secrets),
    '',
    'Notes:',
    formatList(plan.notes),
  ].join('\n');

const parsePositiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const handleConfigPath: DomainActionHandler = async (_args, context) => {
  const filePath = await findConfigPathOrThrow(context.cwd);
  const payload = {
    status: 'ok',
    path: filePath,
  };

  return result(context, payload, `ZaoWu Config Path\n\n${filePath}`);
};

const handleConfigShow: DomainActionHandler = async (_args, context) => {
  const resolved = await loadResolvedConfig(context.cwd);
  const payload = {
    status: 'ok',
    filePath: resolved.filePath,
    config: resolved.config,
  };
  const human = [
    'ZaoWu Config',
    '',
    `File: ${resolved.filePath}`,
    `Project: ${resolved.config.project.name}`,
    `AI provider: ${resolved.config.ai.provider ?? 'none'}`,
    `Default output: ${resolved.config.defaults.output}`,
    `Workspace: ${resolved.config.paths.workspace}`,
    `Cache: ${resolved.config.paths.cache}`,
  ].join('\n');

  return result(context, payload, human);
};

const handleConfigValidate: DomainActionHandler = async (_args, context) => {
  const validation = await validateResolvedConfig(context.cwd);
  const human = [
    'ZaoWu Config Validate',
    '',
    `Status: ${validation.status}`,
    `File: ${validation.filePath}`,
    '',
    validation.warnings.length > 0
      ? ['Warnings:', ...validation.warnings.map((warning) => `- ${warning}`)].join('\n')
      : 'Warnings: none',
  ].join('\n');

  return result(context, validation, human);
};

const handleConfigGet: DomainActionHandler = async (args, context) => {
  const key = requireTarget(args, 'zw config get');
  const value = await getResolvedConfigValue(key, context.cwd);
  const human = [
    'ZaoWu Config Get',
    '',
    `File: ${value.filePath}`,
    `${value.key}: ${value.value ?? 'null'}`,
  ].join('\n');

  return result(context, value, human);
};

const handleConfigSet: DomainActionHandler = async (args, context) => {
  const key = requireTarget(args, 'zw config set');
  const value = requireSecondTarget(args, 'zw config set', 'value');
  const updated = await setResolvedConfigValue(key, value, {
    cwd: context.cwd,
    yes: context.yes,
  });
  const operationPlan = createOperationPlan({
    risk: 'medium',
    confirmationRequired: !context.yes,
    reads: [updated.filePath],
    writes: [updated.filePath],
    notes: ['Config writes are previewed unless --yes is provided.'],
  });
  const human = [
    'ZaoWu Config Set',
    '',
    `Status: ${updated.status}`,
    `File: ${updated.filePath}`,
    `Key: ${updated.key}`,
    `Old: ${updated.oldValue ?? 'null'}`,
    `New: ${updated.newValue ?? 'null'}`,
    `Wrote file: ${updated.wroteFile ? 'yes' : 'no'}`,
    '',
    formatOperationPlan(operationPlan),
    '',
    updated.wroteFile ? 'Config updated.' : updated.content,
  ].join('\n');

  return result(context, withOperationPlan(updated, operationPlan), human);
};

const handleConfigMigrate: DomainActionHandler = async (_args, context) => {
  const migrated = await migrateResolvedConfig({
    cwd: context.cwd,
    yes: context.yes,
  });
  const operationPlan = createOperationPlan({
    risk: 'medium',
    confirmationRequired: migrated.changed && !context.yes,
    reads: [migrated.filePath],
    writes: migrated.changed ? [migrated.filePath] : [],
    notes: ['Config migrations are previewed unless --yes is provided.'],
  });
  const human = [
    'ZaoWu Config Migrate',
    '',
    `Status: ${migrated.status}`,
    `File: ${migrated.filePath}`,
    `From: ${migrated.fromVersion ?? 'legacy'}`,
    `To: ${migrated.toVersion}`,
    `Changed: ${migrated.changed ? 'yes' : 'no'}`,
    `Wrote file: ${migrated.wroteFile ? 'yes' : 'no'}`,
    '',
    formatOperationPlan(operationPlan),
    '',
    migrated.wroteFile || !migrated.changed ? 'Migration complete.' : migrated.content,
  ].join('\n');

  return result(context, withOperationPlan(migrated, operationPlan), human);
};

const handleAiAsk: DomainActionHandler = async (args, context) => {
  const prompt = args.join(' ').trim();
  const filePath = getValue(context.parsed, '--file');
  const requestedProvider = getValue(context.parsed, '--provider');
  const requestedModel = getValue(context.parsed, '--model');
  const providerValidation = validateAIProviderConfig(requestedProvider);
  const provider = providerValidation.provider;
  const operationPlan = createOperationPlan({
    risk: provider.network ? 'medium' : 'low',
    confirmationRequired: provider.network && !context.yes,
    reads: filePath ? [filePath] : [],
    network: provider.network ? [provider.id] : [],
    secrets: provider.requiredEnv,
    notes: [
      provider.network
        ? 'Network AI providers preview by default and require --yes to send a request.'
        : 'The local echo provider does not call external services.',
    ],
  });

  if (provider.network && !context.yes) {
    const preview = await previewAIRequest({
      prompt,
      filePath,
      provider: requestedProvider,
      model: requestedModel,
    });
    const payload = {
      status: 'preview',
      provider,
      model: preview.model,
      input: preview.input,
      output: null,
      validation: preview.validation,
    };
    const human = [
      'ZaoWu AI Ask',
      '',
      'Status: preview',
      `Provider: ${provider.id} (${provider.name})`,
      `Model: ${preview.model}`,
      '',
      formatOperationPlan(operationPlan),
      '',
      'No provider request was sent. Re-run with --yes to send it.',
    ].join('\n');

    return result(context, withOperationPlan(payload, operationPlan), human);
  }

  const response = await askAI({
    prompt,
    filePath,
    provider: requestedProvider,
    model: requestedModel,
    allowNetwork: context.yes,
  });
  const payload = {
    status: 'ok',
    ...response,
  };
  const human = [
    'ZaoWu AI Ask',
    '',
    `Provider: ${response.provider.id} (${response.provider.name})`,
    `Model: ${response.model}`,
    '',
    formatOperationPlan(operationPlan),
    '',
    'Output:',
    response.output,
  ].join('\n');

  return result(context, withOperationPlan(payload, operationPlan), human);
};

const handleAiProviders: DomainActionHandler = async (_args, context) => {
  const providers = listAIProviders();
  const activeProvider = getValue(context.parsed, '--provider');
  const validation = activeProvider ? validateAIProviderConfig(activeProvider) : undefined;
  const payload = {
    status: validation?.status ?? 'ok',
    providers,
    validation,
  };
  const human = [
    'ZaoWu AI Providers',
    '',
    ...providers.map((provider) => {
      const flags = [
        provider.network ? 'network' : 'local',
        provider.configured ? 'configured' : 'missing config',
      ];

      return `- ${provider.id}: ${provider.name} (${flags.join(', ')})`;
    }),
    '',
    validation?.warnings.length
      ? ['Warnings:', ...validation.warnings.map((warning) => `- ${warning}`)].join('\n')
      : 'Warnings: none',
  ].join('\n');

  return result(context, payload, human);
};

const handleDevCommit: DomainActionHandler = async (_args, context) => {
  const preview = previewDevCommit(context.commandRunner, { cwd: context.cwd });
  const operationPlan = createOperationPlan({
    risk: 'low',
    reads: ['staged git diff'],
    notes: ['No Git state is modified.'],
  });
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
    'Recommended checks:',
    formatList(preview.recommendedChecks),
    '',
    formatOperationPlan(operationPlan),
    '',
    'Suggested message:',
    preview.message,
  ].join('\n');

  return result(context, withOperationPlan(preview, operationPlan), human);
};

const handleDevReview: DomainActionHandler = async (_args, context) => {
  const mode: DevReviewMode = context.parsed.flags.has('--staged')
    ? 'staged'
    : context.parsed.flags.has('--worktree')
      ? 'worktree'
      : 'auto';
  const review = reviewDevChanges(context.commandRunner, { cwd: context.cwd, mode });
  const reviewUsesWorktree = review.source === 'working-tree';
  const operationPlan = createOperationPlan({
    risk: 'low',
    reads: reviewUsesWorktree
      ? ['working-tree git diff', 'untracked git file list']
      : ['staged git diff'],
    executes: reviewUsesWorktree
      ? ['git diff', 'git ls-files --others --exclude-standard']
      : ['git diff --cached'],
    notes: ['No Git state is modified.'],
  });
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

const handleDevStatus: DomainActionHandler = async (_args, context) => {
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

const handleDocSummary: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw doc summary');
  const summary = await summarizeDocument(target);
  const human = [
    'ZaoWu Doc Summary',
    '',
    `File: ${summary.filePath}`,
    `Title: ${summary.title}`,
    `Lines: ${summary.lineCount}`,
    `Words: ${summary.wordCount}`,
    '',
    summary.summary,
  ].join('\n');

  return result(context, summary, human);
};

const handleDocExtract: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw doc extract');
  const extracted = await extractDocument(target);
  const human = [
    'ZaoWu Doc Extract',
    '',
    `File: ${extracted.filePath}`,
    `Headings: ${extracted.headings.length}`,
    `Links: ${extracted.links.length}`,
    `Code blocks: ${extracted.codeBlockCount}`,
    '',
    formatObject({
      headings: extracted.headings,
      links: extracted.links,
    }),
  ].join('\n');

  return result(context, extracted, human);
};

const handleDocOutline: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw doc outline');
  const outline = await outlineDocument(target);
  const human = [
    'ZaoWu Doc Outline',
    '',
    `File: ${outline.filePath}`,
    '',
    ...(outline.outline.length > 0
      ? outline.outline.map(
          (item) => `${'  '.repeat(item.level - 1)}- L${item.level} ${item.title}`
        )
      : ['No headings found.']),
  ].join('\n');

  return result(context, outline, human);
};

const handleDocSearch: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw doc search');
  const keyword = requireSecondTarget(args, 'zw doc search', 'keyword');
  const searched = await searchDocument(target, keyword);
  const human = [
    'ZaoWu Doc Search',
    '',
    `File: ${searched.filePath}`,
    `Keyword: ${searched.keyword}`,
    `Matches: ${searched.matches.length}`,
    '',
    ...searched.matches.map((match) => `${match.line}: ${match.text}`),
  ].join('\n');

  return result(context, searched, human);
};

const handleDocConvert: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw doc convert');
  const outputPath = getValue(context.parsed, '--output');
  const format = getValue(context.parsed, '--format');
  const converted = await convertDocument(target, {
    outputPath,
    format: format === 'text' ? 'text' : format === 'markdown' ? 'markdown' : undefined,
    yes: context.yes,
  });
  const operationPlan = createOperationPlan({
    risk: converted.outputPath ? 'medium' : 'low',
    confirmationRequired: Boolean(converted.outputPath && !context.yes),
    reads: [converted.inputPath],
    writes: converted.outputPath ? [converted.outputPath] : [],
    notes: ['Document conversion writes require --yes when --output is used.'],
  });
  const human = [
    'ZaoWu Doc Convert',
    '',
    `Status: ${converted.status}`,
    `Input: ${converted.inputPath}`,
    `Output: ${converted.outputPath ?? 'stdout'}`,
    `Wrote file: ${converted.wroteFile ? 'yes' : 'no'}`,
    '',
    formatOperationPlan(operationPlan),
    '',
    converted.wroteFile ? 'Conversion complete.' : converted.content,
  ].join('\n');

  return result(context, withOperationPlan(converted, operationPlan), human);
};

const handleDataInspect: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw data inspect');
  const inspected = await inspectData(target, {
    sheet: getValue(context.parsed, '--sheet'),
  });
  const human = [
    'ZaoWu Data Inspect',
    '',
    `File: ${inspected.filePath}`,
    `Rows: ${inspected.rowCount}`,
    `Columns: ${inspected.columnCount}`,
    '',
    `Columns: ${inspected.columns.join(', ')}`,
  ].join('\n');

  return result(context, inspected, human);
};

const handleDataAnalyze: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw data analyze');
  const analysis = await analyzeData(target, {
    sheet: getValue(context.parsed, '--sheet'),
  });
  const human = [
    'ZaoWu Data Analyze',
    '',
    `File: ${analysis.filePath}`,
    `Numeric columns: ${analysis.numericColumns.length}`,
    '',
    ...analysis.numericColumns.map(
      (column) =>
        `- ${column.column}: count ${column.count}, min ${column.min}, max ${column.max}, avg ${column.average}`
    ),
  ].join('\n');

  return result(context, analysis, human);
};

const handleDataClean: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw data clean');
  const cleaned = await cleanData(target, {
    outputPath: getValue(context.parsed, '--output'),
    sheet: getValue(context.parsed, '--sheet'),
    yes: context.yes,
  });
  const operationPlan = createOperationPlan({
    risk: cleaned.outputPath ? 'medium' : 'low',
    confirmationRequired: Boolean(cleaned.outputPath && !context.yes),
    reads: [cleaned.inputPath],
    writes: cleaned.outputPath ? [cleaned.outputPath] : [],
    notes: ['Data cleaning writes require --yes when --output is used.'],
  });
  const human = [
    'ZaoWu Data Clean',
    '',
    `Status: ${cleaned.status}`,
    `Input: ${cleaned.inputPath}`,
    `Output: ${cleaned.outputPath ?? 'stdout'}`,
    `Wrote file: ${cleaned.wroteFile ? 'yes' : 'no'}`,
    '',
    formatOperationPlan(operationPlan),
    '',
    cleaned.wroteFile ? 'Clean complete.' : cleaned.content,
  ].join('\n');

  return result(context, withOperationPlan(cleaned, operationPlan), human);
};

const handleDataSchema: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw data schema');
  const schema = await inferDataSchema(target, {
    sheet: getValue(context.parsed, '--sheet'),
  });
  const human = [
    'ZaoWu Data Schema',
    '',
    `File: ${schema.filePath}`,
    '',
    ...schema.columns.map(
      (column) => `- ${column.column}: ${column.type}${column.nullable ? ', nullable' : ''}`
    ),
  ].join('\n');

  return result(context, schema, human);
};

const handleDataSample: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw data sample');
  const sampled = await sampleData(target, {
    rows: parsePositiveInteger(getValue(context.parsed, '--rows'), 5),
    sheet: getValue(context.parsed, '--sheet'),
  });
  const human = [
    'ZaoWu Data Sample',
    '',
    `File: ${sampled.filePath}`,
    `Rows: ${sampled.rowCount}`,
    '',
    formatObject(sampled.rows),
  ].join('\n');

  return result(context, sampled, human);
};

const handleAutoValidate: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw auto validate');
  const validation = await validateWorkflowFile(target);
  const human = [
    'ZaoWu Auto Validate',
    '',
    `File: ${validation.filePath}`,
    `Workflow: ${validation.workflow.name}`,
    `Version: ${validation.workflow.version}`,
    `Steps: ${validation.workflow.steps.length}`,
    '',
    'Policy:',
    formatPolicy(validation.policy),
    '',
    'Sandbox:',
    formatSandbox(validation.sandbox),
    '',
    validation.warnings.length > 0
      ? ['Warnings:', ...validation.warnings.map((warning) => `- ${warning}`)].join('\n')
      : 'Warnings: none',
  ].join('\n');

  return result(context, validation, human);
};

const handleAutoRun: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw auto run');
  const plan = await planWorkflowFile(target);
  const run = await runWorkflowFile(target, { yes: context.yes });
  const readyMessageSteps = plan.steps
    .filter((step) => step.action === 'message' && !step.blocked)
    .map((step) => step.name);
  const blockedSteps = plan.steps
    .filter((step) => step.blocked)
    .map((step) => `${step.name}: ${step.reason ?? 'blocked'}`);
  const operationPlan = createOperationPlan({
    risk: 'medium',
    confirmationRequired: !context.yes,
    reads: [run.filePath],
    notes: [
      'Workflow runs preview by default.',
      `Policy shell: ${plan.policy.shell}.`,
      `Sandbox shellCommands: ${plan.sandbox.shellCommands}.`,
      `Ready message steps: ${readyMessageSteps.length > 0 ? readyMessageSteps.join(', ') : 'none'}.`,
      `Blocked steps: ${blockedSteps.length > 0 ? blockedSteps.join('; ') : 'none'}.`,
      'Shell steps are not executed in this foundation version.',
    ],
  });
  const human = [
    'ZaoWu Auto Run',
    '',
    `Status: ${run.status}`,
    `Workflow: ${run.workflow.name}`,
    `Version: ${run.workflow.version}`,
    '',
    'Sandbox:',
    formatSandbox(run.sandbox),
    '',
    formatOperationPlan(operationPlan),
    '',
    'Executed:',
    ...(run.executed.length > 0 ? run.executed.map((item) => `- ${item}`) : ['- none']),
    '',
    'Skipped:',
    ...(run.skipped.length > 0 ? run.skipped.map((item) => `- ${item}`) : ['- none']),
  ].join('\n');

  return result(context, withOperationPlan(run, operationPlan), human);
};

const handleAutoPlan: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw auto plan');
  const plan = await planWorkflowFile(target);
  const human = [
    'ZaoWu Auto Plan',
    '',
    `File: ${plan.filePath}`,
    `Workflow: ${plan.workflow.name}`,
    `Version: ${plan.workflow.version}`,
    '',
    'Policy:',
    formatPolicy(plan.policy),
    '',
    'Sandbox:',
    formatSandbox(plan.sandbox),
    '',
    ...plan.steps.map(
      (step) =>
        `${step.index}. ${step.name} [${step.action}] ${step.blocked ? 'blocked' : 'ready'} (${step.policyDecision}) - ${step.preview}`
    ),
    '',
    plan.warnings.length > 0
      ? ['Warnings:', ...plan.warnings.map((warning) => `- ${warning}`)].join('\n')
      : 'Warnings: none',
  ].join('\n');

  return result(context, plan, human);
};

const handlePluginList: DomainActionHandler = async (_args, context) => {
  const listed = await listPlugins({ cwd: context.cwd });
  const human = [
    'ZaoWu Plugin List',
    '',
    `Directory: ${listed.pluginDir}`,
    '',
    listed.plugins.length > 0
      ? listed.plugins.map((plugin) => `- ${plugin.id} (${plugin.source})`).join('\n')
      : 'No plugins installed.',
  ].join('\n');

  return result(context, listed, human);
};

const handlePluginInstall: DomainActionHandler = async (args, context) => {
  const id = requireTarget(args, 'zw plugin install');
  const installed = await installPlugin(id, {
    cwd: context.cwd,
    source: getValue(context.parsed, '--source'),
    yes: context.yes,
  });
  const operationPlan = createOperationPlan({
    risk: 'medium',
    confirmationRequired: !context.yes,
    reads: installed.plugin.source === installed.plugin.id ? [] : [installed.plugin.source],
    writes: [`${installed.pluginDir}/${installed.plugin.id}.json`],
    notes: ['Plugin installation writes a local manifest only when --yes is provided.'],
  });
  const human = [
    'ZaoWu Plugin Install',
    '',
    `Status: ${installed.status}`,
    `Plugin: ${installed.plugin.id}`,
    `Source: ${installed.plugin.source}`,
    `Wrote file: ${installed.wroteFile ? 'yes' : 'no'}`,
    '',
    formatOperationPlan(operationPlan),
  ].join('\n');

  return result(context, withOperationPlan(installed, operationPlan), human);
};

const handlePluginRemove: DomainActionHandler = async (args, context) => {
  const id = requireTarget(args, 'zw plugin remove');
  const removed = await removePlugin(id, {
    cwd: context.cwd,
    yes: context.yes,
  });
  const operationPlan = createOperationPlan({
    risk: 'medium',
    confirmationRequired: !context.yes,
    deletes: [`${removed.pluginDir}/${removed.plugin.id}.json`],
    notes: ['Plugin removal deletes a local manifest only when --yes is provided.'],
  });
  const human = [
    'ZaoWu Plugin Remove',
    '',
    `Status: ${removed.status}`,
    `Plugin: ${removed.plugin.id}`,
    `Removed file: ${removed.removedFile ? 'yes' : 'no'}`,
    '',
    formatOperationPlan(operationPlan),
  ].join('\n');

  return result(context, withOperationPlan(removed, operationPlan), human);
};

const handlePluginValidate: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw plugin validate');
  const validation = await validatePluginSource(target);
  const human = [
    'ZaoWu Plugin Validate',
    '',
    `Status: ${validation.status}`,
    `Target: ${validation.target}`,
    `Manifest: ${validation.manifestPath ?? 'none'}`,
    '',
    validation.errors.length > 0
      ? ['Errors:', ...validation.errors.map((error) => `- ${error}`)].join('\n')
      : 'Errors: none',
    '',
    validation.warnings.length > 0
      ? ['Warnings:', ...validation.warnings.map((warning) => `- ${warning}`)].join('\n')
      : 'Warnings: none',
  ].join('\n');

  return result(context, validation, human);
};

const handleTeachPlan: DomainActionHandler = async (args, context) => {
  const plan = await createTeachingPlan(args.join(' '));
  const human = [
    'ZaoWu Teach Plan',
    '',
    `Topic: ${plan.topic}`,
    '',
    ...plan.outline.map((item) => `- ${item}`),
  ].join('\n');

  return result(context, plan, human);
};

const handleTeachQuiz: DomainActionHandler = async (args, context) => {
  const quiz = await createTeachingQuiz(args.join(' '));
  const human = ['ZaoWu Teach Quiz', '', `Topic: ${quiz.topic}`, '', ...quiz.questions].join('\n');

  return result(context, quiz, human);
};

const handleWebInspect: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw web inspect');
  const inspected = await inspectWebTarget(target, { yes: context.yes });
  const operationPlan = createOperationPlan({
    risk: 'medium',
    confirmationRequired: !context.yes,
    network: [inspected.url],
    notes: ['Web inspect sends a HEAD request only when --yes is provided.'],
  });
  const human = [
    'ZaoWu Web Inspect',
    '',
    `Status: ${inspected.status}`,
    `URL: ${inspected.url}`,
    inspected.statusCode
      ? `HTTP: ${inspected.statusCode} ${inspected.statusText ?? ''}`
      : 'HTTP: not requested',
    '',
    formatOperationPlan(operationPlan),
    '',
    Object.keys(inspected.headers).length > 0 ? formatObject(inspected.headers) : 'Headers: none',
  ].join('\n');

  return result(context, withOperationPlan(inspected, operationPlan), human);
};

const handleWebFetch: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw web fetch');
  const fetched = await fetchWebTarget(target, { yes: context.yes });
  const operationPlan = createOperationPlan({
    risk: 'medium',
    confirmationRequired: !context.yes,
    network: [fetched.url],
    notes: ['Web fetch sends a GET request only when --yes is provided.'],
  });
  const human = [
    'ZaoWu Web Fetch',
    '',
    `Status: ${fetched.status}`,
    `URL: ${fetched.url}`,
    fetched.statusCode
      ? `HTTP: ${fetched.statusCode} ${fetched.statusText ?? ''}`
      : 'HTTP: not requested',
    '',
    formatOperationPlan(operationPlan),
    '',
    fetched.body ?? 'Body: not requested',
  ].join('\n');

  return result(context, withOperationPlan(fetched, operationPlan), human);
};

const HANDLERS: Record<string, Record<string, DomainActionHandler>> = {
  ai: {
    ask: handleAiAsk,
    providers: handleAiProviders,
  },
  auto: {
    plan: handleAutoPlan,
    run: handleAutoRun,
    validate: handleAutoValidate,
  },
  config: {
    get: handleConfigGet,
    migrate: handleConfigMigrate,
    path: handleConfigPath,
    set: handleConfigSet,
    show: handleConfigShow,
    validate: handleConfigValidate,
  },
  data: {
    analyze: handleDataAnalyze,
    clean: handleDataClean,
    inspect: handleDataInspect,
    sample: handleDataSample,
    schema: handleDataSchema,
  },
  dev: {
    commit: handleDevCommit,
    review: handleDevReview,
    status: handleDevStatus,
  },
  doc: {
    convert: handleDocConvert,
    extract: handleDocExtract,
    outline: handleDocOutline,
    search: handleDocSearch,
    summary: handleDocSummary,
  },
  plugin: {
    install: handlePluginInstall,
    list: handlePluginList,
    remove: handlePluginRemove,
    validate: handlePluginValidate,
  },
  teach: {
    plan: handleTeachPlan,
    quiz: handleTeachQuiz,
  },
  web: {
    fetch: handleWebFetch,
    inspect: handleWebInspect,
  },
};

export const getDomainActionHandler = (
  domainName: string,
  actionName: string
): DomainActionHandler | undefined => HANDLERS[domainName]?.[actionName];
