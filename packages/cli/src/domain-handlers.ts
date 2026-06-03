import { askAI } from '@zaowu/ai';
import { runWorkflowFile, validateWorkflowFile } from '@zaowu/auto';
import { findConfigPathOrThrow, loadResolvedConfig } from '@zaowu/config';
import { ZaoWuError } from '@zaowu/core';
import { analyzeData, cleanData, inspectData } from '@zaowu/data';
import { previewDevCommit, reviewDevChanges } from '@zaowu/dev';
import { convertDocument, extractDocument, summarizeDocument } from '@zaowu/doc';
import { installPlugin, listPlugins, removePlugin } from '@zaowu/plugin';
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

const result = (context: DomainHandlerContext, payload: unknown, human: string): CliResult =>
  createResult(0, context.json ? stringifyJSON(payload) : human);

const formatObject = (value: unknown): string => JSON.stringify(value, null, 2);

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

const handleAiAsk: DomainActionHandler = async (args, context) => {
  const prompt = args.join(' ');
  const response = await askAI({
    prompt,
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
  const review = reviewDevChanges(context.commandRunner, { cwd: context.cwd });
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
  },
  auto: {
    run: handleAutoRun,
    validate: handleAutoValidate,
  },
  config: {
    path: handleConfigPath,
    show: handleConfigShow,
  },
  data: {
    analyze: handleDataAnalyze,
    clean: handleDataClean,
    inspect: handleDataInspect,
  },
  dev: {
    commit: handleDevCommit,
    review: handleDevReview,
  },
  doc: {
    convert: handleDocConvert,
    extract: handleDocExtract,
    summary: handleDocSummary,
  },
  plugin: {
    install: handlePluginInstall,
    list: handlePluginList,
    remove: handlePluginRemove,
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
