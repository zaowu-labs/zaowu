import { askAI, listAIProviders, validateAIProviderConfig } from '@zaowu/ai';
import { planWorkflowFile, runWorkflowFile, validateWorkflowFile } from '@zaowu/auto';
import {
  findConfigPathOrThrow,
  getResolvedConfigValue,
  loadResolvedConfig,
  setResolvedConfigValue,
  validateResolvedConfig,
} from '@zaowu/config';
import { ZaoWuError } from '@zaowu/core';
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
    updated.wroteFile ? 'Config updated.' : updated.content,
  ].join('\n');

  return result(context, updated, human);
};

const handleAiAsk: DomainActionHandler = async (args, context) => {
  const prompt = args.join(' ');
  const response = await askAI({
    prompt,
    filePath: getValue(context.parsed, '--file'),
    provider: getValue(context.parsed, '--provider'),
    model: getValue(context.parsed, '--model'),
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
    'Output:',
    response.output,
  ].join('\n');

  return result(context, payload, human);
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
  const human = [
    'ZaoWu Dev Commit',
    '',
    'No Git state was modified.',
    '',
    `Files: ${preview.summary.files.length}`,
    `Changes: +${preview.summary.additions}/-${preview.summary.deletions}`,
    '',
    'Suggested message:',
    preview.message,
  ].join('\n');

  return result(context, preview, human);
};

const handleDevReview: DomainActionHandler = async (_args, context) => {
  const mode: DevReviewMode = context.parsed.flags.has('--staged')
    ? 'staged'
    : context.parsed.flags.has('--worktree')
      ? 'worktree'
      : 'auto';
  const review = reviewDevChanges(context.commandRunner, { cwd: context.cwd, mode });
  const human = [
    'ZaoWu Dev Review',
    '',
    `Source: ${review.source}`,
    `Files: ${review.summary.files.length}`,
    `Changes: +${review.summary.additions}/-${review.summary.deletions}`,
    '',
    'Findings:',
    ...review.findings.map(
      (finding) => `- ${finding.severity}: ${finding.title} - ${finding.detail}`
    ),
  ].join('\n');

  return result(context, review, human);
};

const handleDevStatus: DomainActionHandler = async (_args, context) => {
  const status = getDevStatus(context.commandRunner, { cwd: context.cwd });
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
  ].join('\n');

  return result(context, status, human);
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
  const human = [
    'ZaoWu Doc Convert',
    '',
    `Status: ${converted.status}`,
    `Input: ${converted.inputPath}`,
    `Output: ${converted.outputPath ?? 'stdout'}`,
    `Wrote file: ${converted.wroteFile ? 'yes' : 'no'}`,
    '',
    converted.wroteFile ? 'Conversion complete.' : converted.content,
  ].join('\n');

  return result(context, converted, human);
};

const handleDataInspect: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw data inspect');
  const inspected = await inspectData(target);
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
  const analysis = await analyzeData(target);
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
    yes: context.yes,
  });
  const human = [
    'ZaoWu Data Clean',
    '',
    `Status: ${cleaned.status}`,
    `Input: ${cleaned.inputPath}`,
    `Output: ${cleaned.outputPath ?? 'stdout'}`,
    `Wrote file: ${cleaned.wroteFile ? 'yes' : 'no'}`,
    '',
    cleaned.wroteFile ? 'Clean complete.' : cleaned.content,
  ].join('\n');

  return result(context, cleaned, human);
};

const handleDataSchema: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw data schema');
  const schema = await inferDataSchema(target);
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
    `Steps: ${validation.workflow.steps.length}`,
    '',
    validation.warnings.length > 0
      ? ['Warnings:', ...validation.warnings.map((warning) => `- ${warning}`)].join('\n')
      : 'Warnings: none',
  ].join('\n');

  return result(context, validation, human);
};

const handleAutoRun: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw auto run');
  const run = await runWorkflowFile(target, { yes: context.yes });
  const human = [
    'ZaoWu Auto Run',
    '',
    `Status: ${run.status}`,
    `Workflow: ${run.workflow.name}`,
    '',
    'Executed:',
    ...(run.executed.length > 0 ? run.executed.map((item) => `- ${item}`) : ['- none']),
    '',
    'Skipped:',
    ...(run.skipped.length > 0 ? run.skipped.map((item) => `- ${item}`) : ['- none']),
  ].join('\n');

  return result(context, run, human);
};

const handleAutoPlan: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw auto plan');
  const plan = await planWorkflowFile(target);
  const human = [
    'ZaoWu Auto Plan',
    '',
    `File: ${plan.filePath}`,
    `Workflow: ${plan.workflow.name}`,
    '',
    ...plan.steps.map(
      (step) =>
        `${step.index}. ${step.name} [${step.action}] ${step.blocked ? 'blocked' : 'ready'} - ${step.preview}`
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
  const human = [
    'ZaoWu Plugin Install',
    '',
    `Status: ${installed.status}`,
    `Plugin: ${installed.plugin.id}`,
    `Source: ${installed.plugin.source}`,
    `Wrote file: ${installed.wroteFile ? 'yes' : 'no'}`,
  ].join('\n');

  return result(context, installed, human);
};

const handlePluginRemove: DomainActionHandler = async (args, context) => {
  const id = requireTarget(args, 'zw plugin remove');
  const removed = await removePlugin(id, {
    cwd: context.cwd,
    yes: context.yes,
  });
  const human = [
    'ZaoWu Plugin Remove',
    '',
    `Status: ${removed.status}`,
    `Plugin: ${removed.plugin.id}`,
    `Removed file: ${removed.removedFile ? 'yes' : 'no'}`,
  ].join('\n');

  return result(context, removed, human);
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
  const human = [
    'ZaoWu Web Inspect',
    '',
    `Status: ${inspected.status}`,
    `URL: ${inspected.url}`,
    inspected.statusCode
      ? `HTTP: ${inspected.statusCode} ${inspected.statusText ?? ''}`
      : 'HTTP: not requested',
    '',
    Object.keys(inspected.headers).length > 0 ? formatObject(inspected.headers) : 'Headers: none',
  ].join('\n');

  return result(context, inspected, human);
};

const handleWebFetch: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw web fetch');
  const fetched = await fetchWebTarget(target, { yes: context.yes });
  const human = [
    'ZaoWu Web Fetch',
    '',
    `Status: ${fetched.status}`,
    `URL: ${fetched.url}`,
    fetched.statusCode
      ? `HTTP: ${fetched.statusCode} ${fetched.statusText ?? ''}`
      : 'HTTP: not requested',
    '',
    fetched.body ?? 'Body: not requested',
  ].join('\n');

  return result(context, fetched, human);
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
