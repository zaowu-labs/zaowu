import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  assertSafeOutputPath,
  createCapabilityLedger,
  stripUtf8Bom,
  writeTextFileExclusive,
  ZaoWuError,
  type DomainDefinition,
} from '@zaowu-labs/core';

export interface DataTable {
  filePath: string;
  format: 'csv' | 'tsv' | 'xlsx' | 'json';
  sheetName?: string;
  delimiter: ',' | '\t';
  headers: string[];
  rows: string[][];
  emptyLineCount: number;
  trimmedCellCount: number;
}

export interface DataInspectResult {
  schemaVersion: 1;
  status: 'ok';
  filePath: string;
  sheetName?: string;
  rowCount: number;
  columnCount: number;
  columns: string[];
  missingByColumn: Record<string, number>;
}

export interface NumericColumnAnalysis {
  column: string;
  count: number;
  min: number;
  max: number;
  average: number;
}

export interface DataAnalyzeResult {
  schemaVersion: 1;
  status: 'ok';
  filePath: string;
  sheetName?: string;
  numericColumns: NumericColumnAnalysis[];
}

export interface DataCleanResult {
  schemaVersion: 1;
  status: 'ok' | 'preview';
  inputPath: string;
  sheetName?: string;
  outputPath?: string;
  content: string;
  wroteFile: boolean;
  removedEmptyRows: number;
  trimmedCells: number;
  missingByColumn: Record<string, number>;
}

export interface DataColumnSchema {
  column: string;
  index: number;
  type: 'number' | 'boolean' | 'date' | 'percent' | 'currency' | 'string' | 'empty' | 'mixed';
  nullable: boolean;
  examples: string[];
}

export interface DataSchemaResult {
  schemaVersion: 1;
  status: 'ok';
  filePath: string;
  sheetName?: string;
  columns: DataColumnSchema[];
}

export interface DataSampleResult {
  schemaVersion: 1;
  status: 'ok';
  filePath: string;
  sheetName?: string;
  rowCount: number;
  rows: Record<string, string>[];
}

export interface DataReadOptions {
  sheet?: string;
}

export const DATA_DOMAIN: DomainDefinition = {
  name: 'data',
  summary: 'Data workflows for inspection, analysis, and cleanup',
  capabilities: createCapabilityLedger({
    readsFiles: true,
    writesFiles: true,
  }),
  commands: [
    {
      name: 'inspect',
      summary: 'Inspect a dataset or spreadsheet',
      status: 'available',
    },
    {
      name: 'analyze',
      summary: 'Analyze a dataset or spreadsheet',
      status: 'available',
    },
    {
      name: 'clean',
      summary: 'Clean data with preview and explicit output control',
      status: 'available',
      sensitive: true,
    },
    {
      name: 'schema',
      summary: 'Infer a lightweight schema for CSV or TSV data',
      status: 'available',
    },
    {
      name: 'sample',
      summary: 'Show sample rows from CSV or TSV data',
      status: 'available',
    },
    {
      name: 'sheets',
      summary: 'List available sheets in a spreadsheet workbook',
      status: 'available',
    },
  ],
};

const assertSupportedDataFile = (
  filePath: string
): { format: DataTable['format']; delimiter: ',' | '\t' } => {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.csv') {
    return {
      format: 'csv',
      delimiter: ',',
    };
  }

  if (extension === '.tsv') {
    return {
      format: 'tsv',
      delimiter: '\t',
    };
  }

  if (extension === '.xlsx') {
    return {
      format: 'xlsx',
      delimiter: ',',
    };
  }

  if (extension === '.json') {
    return {
      format: 'json',
      delimiter: ',',
    };
  }

  throw new ZaoWuError({
    code: 'DATA_FORMAT_UNSUPPORTED',
    message: 'Data format is not supported yet.',
    why: `ZaoWu can read CSV, TSV, XLSX, and JSON files. It cannot parse \`${extension || 'unknown'}\` files yet.`,
    fix: 'Export the data as `.csv`, `.tsv`, `.xlsx`, or `.json`, or add a parser inside `packages/data` before using this format.',
  });
};

interface ParsedDelimitedLine {
  values: string[];
  trimmedCells: number;
}

const parseDelimitedLineDetailed = (line: string, delimiter: ',' | '\t'): ParsedDelimitedLine => {
  const values: string[] = [];
  let trimmedCells = 0;
  const pushValue = (value: string): void => {
    const trimmed = value.trim();

    if (value !== trimmed) {
      trimmedCells += 1;
    }

    values.push(trimmed);
  };

  if (delimiter === '\t') {
    for (const value of line.split('\t')) {
      pushValue(value);
    }

    return {
      values,
      trimmedCells,
    };
  }

  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === ',' && !quoted) {
      pushValue(current);
      current = '';
      continue;
    }

    current += char;
  }

  pushValue(current);

  return {
    values,
    trimmedCells,
  };
};

interface ParsedDelimitedRecords {
  records: ParsedDelimitedLine[];
  emptyLineCount: number;
}

/**
 * Record-aware CSV parser (RFC 4180). Unlike a naive line split, this tracks
 * quote state across newlines, so a quoted field containing a newline —
 * `"line one\nline two"` — stays a single field instead of being torn across
 * two records. Blank records (whose raw text trims to empty) are excluded and
 * counted as empty lines, matching the previous line-filtering behavior.
 */
const parseCsvRecords = (content: string): ParsedDelimitedRecords => {
  const records: ParsedDelimitedLine[] = [];
  let emptyLineCount = 0;
  let values: string[] = [];
  let current = '';
  let raw = '';
  let quoted = false;
  let trimmedCells = 0;
  let started = false;

  const pushValue = (value: string): void => {
    const trimmed = value.trim();

    if (value !== trimmed) {
      trimmedCells += 1;
    }

    values.push(trimmed);
  };

  const finishRecord = (): void => {
    pushValue(current);

    if (raw.trim() === '') {
      emptyLineCount += 1;
    } else {
      records.push({ values, trimmedCells });
    }

    values = [];
    current = '';
    raw = '';
    trimmedCells = 0;
    started = false;
  };

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }

      finishRecord();
      continue;
    }

    started = true;
    raw += char;

    if (char === '"' && quoted && next === '"') {
      current += '"';
      raw += next;
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === ',' && !quoted) {
      pushValue(current);
      current = '';
      continue;
    }

    current += char;
  }

  if (started || current !== '' || values.length > 0) {
    finishRecord();
  }

  return { records, emptyLineCount };
};

const parseTsvRecords = (content: string): ParsedDelimitedRecords => {
  const rawLines = content.split(/\r?\n/);
  const contentLines = rawLines.at(-1) === '' ? rawLines.slice(0, -1) : rawLines;
  const records: ParsedDelimitedLine[] = [];
  let emptyLineCount = 0;

  for (const line of contentLines) {
    if (line.trim() === '') {
      emptyLineCount += 1;
      continue;
    }

    records.push(parseDelimitedLineDetailed(line, '\t'));
  }

  return { records, emptyLineCount };
};

const serializeDelimitedLine = (values: readonly string[], delimiter: ',' | '\t'): string =>
  values
    .map((value) => {
      const trimmed = value.trim();

      if (delimiter === ',' && /[",\n\r]/.test(trimmed)) {
        return `"${trimmed.replaceAll('"', '""')}"`;
      }

      return trimmed;
    })
    .join(delimiter);

const normalizeHeaders = (headers: readonly string[]): string[] => {
  const used = new Set<string>();

  return headers.map((header, index) => {
    const base = header.trim() || `column_${index + 1}`;
    let candidate = base;
    let suffix = 2;

    while (used.has(candidate)) {
      candidate = `${base}_${suffix}`;
      suffix += 1;
    }

    used.add(candidate);

    return candidate;
  });
};

export const loadDataTable = async (
  filePath: string,
  options: DataReadOptions = {}
): Promise<DataTable> => {
  const source = assertSupportedDataFile(filePath);
  let content: string;

  if (source.format === 'json') {
    try {
      const jsonContent = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(stripUtf8Bom(jsonContent));
      let rows: string[][] = [];
      let headers: string[] = [];

      if (Array.isArray(parsed)) {
        const uniqueKeys = new Set<string>();
        for (const item of parsed) {
          if (item && typeof item === 'object') {
            for (const key of Object.keys(item)) {
              uniqueKeys.add(key);
            }
          }
        }
        headers = normalizeHeaders(Array.from(uniqueKeys));

        for (const item of parsed) {
          const row: string[] = [];
          if (item && typeof item === 'object') {
            const obj = item as Record<string, unknown>;
            for (const header of headers) {
              const val = obj[header];
              row.push(val === undefined || val === null ? '' : String(val).trim());
            }
          } else {
            for (let i = 0; i < headers.length; i++) {
              row.push(item === undefined || item === null ? '' : String(item).trim());
            }
          }
          rows.push(row);
        }
      } else if (parsed && typeof parsed === 'object') {
        headers = normalizeHeaders(Object.keys(parsed));
        const row: string[] = [];
        const obj = parsed as Record<string, unknown>;
        for (const header of headers) {
          const val = obj[header];
          row.push(val === undefined || val === null ? '' : String(val).trim());
        }
        rows.push(row);
      }

      return {
        filePath,
        format: 'json',
        delimiter: ',',
        headers,
        rows,
        emptyLineCount: 0,
        trimmedCellCount: 0,
      };
    } catch (error) {
      if (error instanceof ZaoWuError) {
        throw error;
      }
      throw new ZaoWuError({
        code: 'DATA_READ_FAILED',
        message: 'Could not read data file.',
        why: `ZaoWu tried to read \`${filePath}\` as JSON, but the file is not valid JSON.`,
        fix: 'Check the path, file permissions, and JSON structure, then try again.',
      });
    }
  }

  if (source.format === 'xlsx') {
    try {
      const workbookBuffer = await readFile(filePath);

      if (workbookBuffer[0] !== 0x50 || workbookBuffer[1] !== 0x4b) {
        throw new ZaoWuError({
          code: 'DATA_READ_FAILED',
          message: 'Could not read data file.',
          why: `ZaoWu tried to read \`${filePath}\` as an XLSX workbook, but the file is not an XLSX ZIP container.`,
          fix: 'Check the workbook format or export the data as `.csv`, `.tsv`, or `.xlsx`.',
        });
      }

      const XLSX = await import('xlsx');
      const workbook = XLSX.read(workbookBuffer, {
        type: 'buffer',
      });

      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new ZaoWuError({
          code: 'DATA_SHEET_NOT_FOUND',
          message: 'XLSX sheet was not found.',
          why: `The workbook \`${filePath}\` contains no sheets.`,
          fix: 'Ensure the spreadsheet has at least one visible worksheet.',
        });
      }

      const firstSheetName = workbook.SheetNames[0];
      const sheetName = options.sheet?.trim() || firstSheetName;

      if (options.sheet && !workbook.Sheets[sheetName]) {
        throw new ZaoWuError({
          code: 'DATA_SHEET_NOT_FOUND',
          message: 'XLSX sheet was not found.',
          why: `ZaoWu could not find a sheet named \`${options.sheet}\` in \`${filePath}\`.`,
          fix: `Use one of: ${workbook.SheetNames.join(', ') || 'no sheets available'}.`,
        });
      }

      const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
      const rows = sheet
        ? (XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: '',
          }) as unknown[][])
        : [];
      const normalizedRows = rows.map((row) => row.map((value) => String(value).trim()));
      const headers = normalizeHeaders(normalizedRows[0] ?? []);
      const dataRows = normalizedRows.slice(1).filter((row) => row.some((value) => value.trim()));

      return {
        filePath,
        format: source.format,
        sheetName,
        delimiter: source.delimiter,
        headers,
        rows: dataRows,
        // Math.max guards the fully-empty-sheet case, where zero rows minus
        // the header slot would otherwise report -1 removed rows.
        emptyLineCount: Math.max(0, normalizedRows.length - 1 - dataRows.length),
        trimmedCellCount: 0,
      };
    } catch (error) {
      if (error instanceof ZaoWuError) {
        throw error;
      }

      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new ZaoWuError({
        code: 'DATA_READ_FAILED',
        message: 'Could not read data file.',
        why: `ZaoWu tried to read \`${filePath}\` as an XLSX file, but the file was not readable. Details: ${errorMsg}`,
        fix: 'Check the path, file permissions, and workbook format, then run the command again.',
      });
    }
  }

  try {
    content = stripUtf8Bom(await readFile(filePath, 'utf8'));
  } catch {
    throw new ZaoWuError({
      code: 'DATA_READ_FAILED',
      message: 'Could not read data file.',
      why: `ZaoWu tried to read \`${filePath}\`, but the file was not readable.`,
      fix: 'Check the path and file permissions, then run the command again.',
    });
  }

  const { records, emptyLineCount } =
    source.delimiter === ',' ? parseCsvRecords(content) : parseTsvRecords(content);
  const parsedHeaders = records[0] ?? { values: [], trimmedCells: 0 };
  const parsedRows = records.slice(1);
  const trimmedCellCount =
    parsedHeaders.trimmedCells +
    parsedRows.reduce((count, parsedLine) => count + parsedLine.trimmedCells, 0);

  return {
    filePath,
    format: source.format,
    delimiter: source.delimiter,
    headers: normalizeHeaders(parsedHeaders.values),
    rows: parsedRows.map((row) => row.values),
    emptyLineCount,
    trimmedCellCount,
  };
};

const assertSafeDataOutputPath = (inputPath: string, outputPath: string): Promise<void> =>
  assertSafeOutputPath(inputPath, outputPath, {
    inputConflict: {
      code: 'DATA_OUTPUT_CONFLICT',
      message: 'Data output path conflicts with input path.',
      why: '`zw data clean` refuses to overwrite the input dataset.',
      fix: 'Choose a different `--output` path.',
    },
    alreadyExists: {
      code: 'DATA_OUTPUT_CONFLICT',
      message: 'Data output file already exists.',
      why: `ZaoWu will not silently overwrite \`${outputPath}\`.`,
      fix: 'Choose a new `--output` path, or remove the existing file yourself first.',
    },
  });

const getMissingByColumn = (table: DataTable): Record<string, number> => {
  const missingByColumn: Record<string, number> = {};

  for (const [index, header] of table.headers.entries()) {
    missingByColumn[header] = table.rows.filter((row) => !row[index]?.trim()).length;
  }

  return missingByColumn;
};

export const inspectData = async (
  filePath: string,
  options: DataReadOptions = {}
): Promise<DataInspectResult> => {
  const table = await loadDataTable(filePath, options);

  return {
    schemaVersion: 1,
    status: 'ok',
    filePath,
    sheetName: table.sheetName,
    rowCount: table.rows.length,
    columnCount: table.headers.length,
    columns: table.headers,
    missingByColumn: getMissingByColumn(table),
  };
};

export const analyzeData = async (
  filePath: string,
  options: DataReadOptions = {}
): Promise<DataAnalyzeResult> => {
  const table = await loadDataTable(filePath, options);
  const numericColumns: NumericColumnAnalysis[] = [];

  for (const [index, header] of table.headers.entries()) {
    const numbers = table.rows
      .map((row) => (row[index] ?? '').trim())
      .filter((value) => value && isNumericText(value))
      .map((value) => Number(value));

    if (numbers.length === 0) {
      continue;
    }

    // Reduce instead of Math.min(...numbers)/Math.max(...numbers): spreading a
    // large numeric column into an argument list throws RangeError (call stack)
    // once the column has ~100k+ values.
    let total = 0;
    let min = numbers[0];
    let max = numbers[0];

    for (const value of numbers) {
      total += value;

      if (value < min) {
        min = value;
      }

      if (value > max) {
        max = value;
      }
    }

    numericColumns.push({
      column: header,
      count: numbers.length,
      min,
      max,
      average: total / numbers.length,
    });
  }

  return {
    schemaVersion: 1,
    status: 'ok',
    filePath,
    sheetName: table.sheetName,
    numericColumns,
  };
};

export const cleanData = async (
  inputPath: string,
  options: { outputPath?: string; yes?: boolean; sheet?: string } = {}
): Promise<DataCleanResult> => {
  const table = await loadDataTable(inputPath, options);
  const lines = [
    serializeDelimitedLine(table.headers, table.delimiter),
    ...table.rows.map((row) => serializeDelimitedLine(row, table.delimiter)),
  ];
  const content = `${lines.join('\n')}\n`;

  if (options.outputPath && options.yes) {
    await assertSafeDataOutputPath(inputPath, options.outputPath);
    await writeTextFileExclusive(options.outputPath, content, {
      exists: {
        code: 'DATA_OUTPUT_CONFLICT',
        message: 'Data output file already exists.',
        why: `ZaoWu will not silently overwrite \`${options.outputPath}\`.`,
        fix: 'Choose a new `--output` path, or remove the existing file yourself first.',
      },
      failed: {
        code: 'DATA_WRITE_FAILED',
        message: 'Could not write cleaned data.',
        why: `ZaoWu tried to write \`${options.outputPath}\`, but the file system rejected the write.`,
        fix: 'Check the output directory and permissions, then run the command again.',
      },
    });
  }

  return {
    schemaVersion: 1,
    status: options.outputPath && !options.yes ? 'preview' : 'ok',
    inputPath,
    sheetName: table.sheetName,
    outputPath: options.outputPath,
    content,
    wroteFile: Boolean(options.outputPath && options.yes),
    removedEmptyRows: table.emptyLineCount,
    trimmedCells: table.trimmedCellCount,
    missingByColumn: getMissingByColumn(table),
  };
};

const isBoolean = (value: string): boolean => ['true', 'false'].includes(value.toLowerCase());

const isValidCalendarDate = (year: number, month: number, day: number): boolean => {
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
};

const isDateLike = (value: string): boolean => {
  const trimmed = value.trim();

  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (isoMatch) {
    return isValidCalendarDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (slashMatch) {
    return isValidCalendarDate(Number(slashMatch[3]), Number(slashMatch[1]), Number(slashMatch[2]));
  }

  return false;
};

const isPercentLike = (value: string): boolean => {
  const trimmed = value.trim();

  return /^[-+]?(?:\d+(?:\.\d+)?|\.\d+)%$/.test(trimmed);
};

const isCurrencyLike = (value: string): boolean => {
  const trimmed = value.trim();

  return (
    /^(?:[$€£¥]\s*)?[-+]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?(?:\s*(?:USD|EUR|GBP|CNY|JPY))?$/.test(
      trimmed
    ) && /[$€£¥,]|\b(?:USD|EUR|GBP|CNY|JPY)\b/.test(trimmed)
  );
};

/**
 * Strict numeric predicate for schema inference and numeric analysis.
 * `Number()` alone misclassifies real-world identifier columns: it accepts
 * leading-zero values (`01234` ZIP codes, phone fragments, SKUs) and hex
 * (`0x1A`). Decimal and scientific notation stay supported.
 */
const isNumericText = (value: string): boolean =>
  /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(value) && !/^[+-]?0\d/.test(value);

const getValueType = (value: string): Exclude<DataColumnSchema['type'], 'empty' | 'mixed'> => {
  if (isNumericText(value)) {
    return 'number';
  }

  if (isBoolean(value)) {
    return 'boolean';
  }

  if (isDateLike(value)) {
    return 'date';
  }

  if (isPercentLike(value)) {
    return 'percent';
  }

  if (isCurrencyLike(value)) {
    return 'currency';
  }

  return 'string';
};

const getColumnType = (values: readonly string[]): DataColumnSchema['type'] => {
  const nonEmpty = values.filter((value) => value.trim());

  if (nonEmpty.length === 0) {
    return 'empty';
  }

  const inferredTypes = new Set(nonEmpty.map(getValueType));

  return inferredTypes.size === 1 ? [...inferredTypes][0]! : 'mixed';
};

export const inferDataSchema = async (
  filePath: string,
  options: DataReadOptions = {}
): Promise<DataSchemaResult> => {
  const table = await loadDataTable(filePath, options);

  return {
    schemaVersion: 1,
    status: 'ok',
    filePath,
    sheetName: table.sheetName,
    columns: table.headers.map((header, index) => {
      const values = table.rows.map((row) => row[index] ?? '');

      return {
        column: header,
        index,
        type: getColumnType(values),
        nullable: values.some((value) => !value.trim()),
        examples: [...new Set(values.filter(Boolean))].slice(0, 3),
      };
    }),
  };
};

export const sampleData = async (
  filePath: string,
  options: { rows?: number; sheet?: string } = {}
): Promise<DataSampleResult> => {
  const table = await loadDataTable(filePath, options);
  const requestedRows = options.rows ?? 5;
  const rowCount =
    Number.isFinite(requestedRows) && requestedRows > 0 ? Math.floor(requestedRows) : 5;
  const rows = table.rows
    .slice(0, rowCount)
    .map((row) =>
      Object.fromEntries(table.headers.map((header, index) => [header, row[index] ?? '']))
    );

  return {
    schemaVersion: 1,
    status: 'ok',
    filePath,
    sheetName: table.sheetName,
    rowCount: rows.length,
    rows,
  };
};

export interface DataSheetsResult {
  schemaVersion: 1;
  status: 'ok';
  filePath: string;
  sheets: string[];
}

export const listSheets = async (filePath: string): Promise<DataSheetsResult> => {
  const source = assertSupportedDataFile(filePath);

  if (source.format === 'xlsx') {
    try {
      const workbookBuffer = await readFile(filePath);

      if (workbookBuffer[0] !== 0x50 || workbookBuffer[1] !== 0x4b) {
        throw new ZaoWuError({
          code: 'DATA_READ_FAILED',
          message: 'Could not read data file.',
          why: `ZaoWu tried to read \`${filePath}\` as an XLSX workbook, but the file is not an XLSX ZIP container.`,
          fix: 'Check the workbook format or export the data as `.csv`, `.tsv`, or `.xlsx`.',
        });
      }

      const XLSX = await import('xlsx');
      const workbook = XLSX.read(workbookBuffer, {
        type: 'buffer',
      });
      return {
        schemaVersion: 1,
        status: 'ok',
        filePath,
        sheets: workbook.SheetNames,
      };
    } catch (error) {
      if (error instanceof ZaoWuError) {
        throw error;
      }

      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new ZaoWuError({
        code: 'DATA_READ_FAILED',
        message: 'Could not read data file.',
        why: `ZaoWu tried to read \`${filePath}\` as an XLSX file, but the file was not readable. Details: ${errorMsg}`,
        fix: 'Check the path, file permissions, and workbook format, then run the command again.',
      });
    }
  }

  return {
    schemaVersion: 1,
    status: 'ok',
    filePath,
    sheets: ['default'],
  };
};
