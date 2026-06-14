import {
  analyzeData,
  cleanData,
  inferDataSchema,
  inspectData,
  sampleData,
  listSheets,
} from '@zaowu/data';
import {
  assertOperationPlanFingerprint,
  createOperationPlan,
  formatObject,
  formatOperationPlan,
  getValue,
  parsePositiveInteger,
  requireTarget,
  result,
  withOperationPlan,
  type DomainActionHandler,
} from '../handler-utils.js';

export const handleDataInspect: DomainActionHandler = async (args, context) => {
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

export const handleDataAnalyze: DomainActionHandler = async (args, context) => {
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

export const handleDataClean: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw data clean');
  const preview = await cleanData(target, {
    outputPath: getValue(context.parsed, '--output'),
    sheet: getValue(context.parsed, '--sheet'),
  });
  const operationPlan = createOperationPlan({
    risk: preview.outputPath ? 'medium' : 'low',
    confirmationRequired: Boolean(preview.outputPath && !context.yes),
    subjects: [
      `data:${preview.inputPath}`,
      ...(preview.sheetName ? [`sheet:${preview.sheetName}`] : []),
    ],
    reads: [preview.inputPath],
    writes: preview.outputPath ? [preview.outputPath] : [],
    notes: ['Data cleaning writes require --yes when --output is used.'],
  });
  assertOperationPlanFingerprint(context, operationPlan);

  const cleaned =
    context.yes && preview.outputPath
      ? await cleanData(target, {
          outputPath: getValue(context.parsed, '--output'),
          sheet: getValue(context.parsed, '--sheet'),
          yes: true,
        })
      : preview;
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

export const handleDataSchema: DomainActionHandler = async (args, context) => {
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

export const handleDataSample: DomainActionHandler = async (args, context) => {
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

export const handleDataSheets: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw data sheets');
  const sheetsResult = await listSheets(target);
  const human = [
    'ZaoWu Data Sheets',
    '',
    `File: ${sheetsResult.filePath}`,
    `Sheets (${sheetsResult.sheets.length}):`,
    ...sheetsResult.sheets.map((sheet) => `- ${sheet}`),
  ].join('\n');

  return result(context, sheetsResult, human);
};
