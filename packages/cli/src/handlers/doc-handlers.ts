import {
  convertDocument,
  extractDocument,
  outlineDocument,
  searchDocument,
  summarizeDocument,
} from '@zaowu/doc';
import {
  assertOperationPlanFingerprint,
  createContentOperationSubjects,
  createOperationPlan,
  formatConfirmCommand,
  formatObject,
  formatOperationPlan,
  getValue,
  requireTarget,
  result,
  withOperationPlan,
  ZaoWuError,
  type DomainActionHandler,
} from '../handler-utils.js';

export const handleDocSummary: DomainActionHandler = async (args, context) => {
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

export const handleDocExtract: DomainActionHandler = async (args, context) => {
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

export const handleDocOutline: DomainActionHandler = async (args, context) => {
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

export const handleDocSearch: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw doc search');
  const rawKeyword = args[1];
  const keyword = (rawKeyword || '').trim();

  if (!keyword) {
    throw new ZaoWuError({
      code: 'DOCUMENT_SEARCH_KEYWORD_REQUIRED',
      message: 'Search keyword is required.',
      why: '`zw doc search` needs a non-empty keyword.',
      fix: 'Run `zw doc search README.md install`.',
    });
  }

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

export const handleDocConvert: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw doc convert');
  const outputPath = getValue(context.parsed, '--output');
  const format = getValue(context.parsed, '--format');
  const preview = await convertDocument(target, {
    outputPath,
    format: format === 'text' ? 'text' : format === 'markdown' ? 'markdown' : undefined,
  });
  const operationPlan = createOperationPlan({
    risk: preview.outputPath ? 'medium' : 'low',
    confirmationRequired: Boolean(preview.outputPath && !context.yes),
    subjects: [
      `doc:${preview.inputPath}`,
      `format:${preview.format}`,
      ...createContentOperationSubjects(preview.content),
    ],
    reads: [preview.inputPath],
    writes: preview.outputPath ? [preview.outputPath] : [],
    notes: ['Document conversion writes require --yes when --output is used.'],
  });
  assertOperationPlanFingerprint(context, operationPlan);

  const converted =
    context.yes && preview.outputPath
      ? await convertDocument(target, {
          outputPath,
          format: format === 'text' ? 'text' : format === 'markdown' ? 'markdown' : undefined,
          yes: true,
        })
      : preview;
  const confirmCommand =
    preview.outputPath && !context.yes
      ? formatConfirmCommand([
          'zw',
          'doc',
          'convert',
          target,
          ...(format ? ['--format', format] : []),
          '--output',
          preview.outputPath,
          '--yes',
          '--plan-fingerprint',
          operationPlan.fingerprint,
        ])
      : undefined;
  const human = [
    'ZaoWu Doc Convert',
    '',
    `Status: ${converted.status}`,
    `Input: ${converted.inputPath}`,
    `Output: ${converted.outputPath ?? 'stdout'}`,
    `Wrote file: ${converted.wroteFile ? 'yes' : 'no'}`,
    '',
    formatOperationPlan(operationPlan),
    ...(confirmCommand
      ? ['', 'To write exactly this converted output, run:', `  ${confirmCommand}`]
      : []),
    '',
    converted.wroteFile ? 'Conversion complete.' : converted.content,
  ].join('\n');

  return result(context, withOperationPlan(converted, operationPlan), human);
};
