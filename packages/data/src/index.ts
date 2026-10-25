import { parseCsvRecords, parseTsvRecords, serializeDelimitedLine } from './delimited.js';
import path from 'node:path';
import {
  assertTableSize,
  assertWorkbookSize,
  MAX_DATA_ROWS,
  readDataFile,
  readDataText,
} from './input-limits.js';
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
  missingCount: number;
  nonNumericCount: number;
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

/**
 * Opens an XLSX workbook with the shared guard sequence: ZIP magic-byte check,
 * lazy `xlsx` import, and mapping of low-level read failures to
 * `DATA_READ_FAILED`.
 */
const openXlsxWorkbook = async (filePath: string) => {
  try {
    const workbookBuffer = await readDataFile(filePath);
    await assertWorkbookSize(workbookBuffer);

    if (workbookBuffer[0] !== 0x50 || workbookBuffer[1] !== 0x4b) {
      throw new ZaoWuError({
        code: 'DATA_READ_FAILED',
        message: 'Could not read data file.',
        why: `ZaoWu tried to read \`${filePath}\` as an XLSX workbook, but the file is not an XLSX ZIP container.`,
        fix: 'Check the workbook format or export the data as `.csv`, `.tsv`, or `.xlsx`.',
      });
    }

    const XLSX = await import('xlsx');

    return {
      XLSX,
      workbook: XLSX.read(workbookBuffer, {
        type: 'buffer',
        sheetRows: MAX_DATA_ROWS + 2,
        cellHTML: false,
        cellStyles: false,
      }),
    };
  } catch (error) {
    if (error instanceof ZaoWuError) {
      throw error;
    }

    throw new ZaoWuError({
      code: 'DATA_READ_FAILED',
      message: 'Could not read data file.',
      why: `ZaoWu tried to read \`${filePath}\` as an XLSX file, but the file was not readable. The workbook may be corrupt, encrypted, or unsupported.`,
      fix: 'Check the path, file permissions, and workbook format, then run the command again.',
    });
  }
};

export const loadDataTable = async (
  filePath: string,
  options: DataReadOptions = {}
): Promise<DataTable> => {
  const source = assertSupportedDataFile(filePath);
  if (options.sheet !== undefined && source.format !== 'xlsx')
    throw new ZaoWuError({
      code: 'DATA_SHEET_NOT_FOUND',
      message: 'Sheet selection requires an XLSX workbook.',
      why: 'CSV, TSV, and JSON inputs have a single table; a named sheet selector would be ignored.',
      fix: 'Remove --sheet for this input, or select a worksheet in an XLSX workbook.',
    });
  let content: string;

  if (source.format === 'json') {
    try {
      const jsonContent = await readDataText(filePath);
      const parsed = JSON.parse(stripUtf8Bom(jsonContent));
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        (Array.isArray(parsed) &&
          parsed.some((item) => !item || typeof item !== 'object' || Array.isArray(item)))
      ) {
        throw new ZaoWuError({
          code: 'DATA_READ_FAILED',
          message: 'JSON data must contain records.',
          why: 'Table commands require an object or an array of objects; primitive and mixed arrays have no stable columns.',
          fix: 'Use records such as [{"name":"A","amount":10}] or export a CSV table.',
        });
      }
      let rows: string[][] = [];
      let headers: string[] = [];

      if (Array.isArray(parsed)) {
        assertTableSize(parsed.length, 0);
        const uniqueKeys = new Set<string>();
        for (const item of parsed) {
          if (item && typeof item === 'object') {
            for (const key of Object.keys(item)) {
              uniqueKeys.add(key);
              assertTableSize(parsed.length, uniqueKeys.size);
            }
          }
        }
        const sourceKeys = Array.from(uniqueKeys);
        headers = normalizeHeaders(sourceKeys);

        for (const item of parsed) {
          const row: string[] = [];
          if (item && typeof item === 'object') {
            const obj = item as Record<string, unknown>;
            for (const key of sourceKeys) {
              const val = Object.hasOwn(obj, key) ? obj[key] : undefined;
              row.push(
                val === undefined || val === null
                  ? ''
                  : (typeof val === 'object' ? JSON.stringify(val) : String(val)).trim()
              );
            }
          } else {
            for (let i = 0; i < headers.length; i++) {
              row.push(item === undefined || item === null ? '' : String(item).trim());
            }
          }
          rows.push(row);
        }
      } else if (parsed && typeof parsed === 'object') {
        const sourceKeys = Object.keys(parsed);
        assertTableSize(1, sourceKeys.length);
        headers = normalizeHeaders(sourceKeys);
        const row: string[] = [];
        const obj = parsed as Record<string, unknown>;
        for (const key of sourceKeys) {
          const val = obj[key];
          row.push(
            val === undefined || val === null
              ? ''
              : (typeof val === 'object' ? JSON.stringify(val) : String(val)).trim()
          );
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
      const { XLSX, workbook } = await openXlsxWorkbook(filePath);

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
      const range = sheet?.['!fullref'] || sheet?.['!ref'];
      if (range) {
        const bounds = XLSX.utils.decode_range(range);
        assertTableSize(bounds.e.r, bounds.e.c + 1);
      }
      const rows = sheet
        ? (XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: '',
          }) as unknown[][])
        : [];
      const normalizedRows = rows.map((row) => row.map((value) => String(value).trim()));
      const width = normalizedRows.reduce((max, row) => Math.max(max, row.length), 0);
      assertTableSize(Math.max(0, normalizedRows.length - 1), width);
      const headers = normalizeHeaders(
        Array.from({ length: width }, (_, i) => normalizedRows[0]?.[i] ?? '')
      );
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

      throw new ZaoWuError({
        code: 'DATA_READ_FAILED',
        message: 'Could not read data file.',
        why: `ZaoWu tried to read \`${filePath}\` as an XLSX file, but the file was not readable. The workbook may be corrupt, encrypted, or unsupported.`,
        fix: 'Check the path, file permissions, and workbook format, then run the command again.',
      });
    }
  }

  content = stripUtf8Bom(await readDataText(filePath));

  const { records, emptyLineCount } =
    source.delimiter === ',' ? parseCsvRecords(content) : parseTsvRecords(content);
  const parsedHeaders = records[0] ?? { values: [], trimmedCells: 0 };
  const parsedRows = records.slice(1);
  const width = records.reduce((max, record) => Math.max(max, record.values.length), 0);
  assertTableSize(Math.max(0, records.length - 1), width);
  const trimmedCellCount =
    parsedHeaders.trimmedCells +
    parsedRows.reduce((count, parsedLine) => count + parsedLine.trimmedCells, 0);

  return {
    filePath,
    format: source.format,
    delimiter: source.delimiter,
    headers: normalizeHeaders(
      Array.from({ length: width }, (_, i) => parsedHeaders.values[i] ?? '')
    ),
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
  return Object.fromEntries(
    table.headers.map((header, index) => [
      header,
      table.rows.filter((row) => !row[index]?.trim()).length,
    ])
  );
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
    let average = 0;
    let correction = 0;
    let min = numbers[0];
    let max = numbers[0];

    for (const value of numbers) {
      const adjusted = value / numbers.length - correction;
      const nextAverage = average + adjusted;
      correction = nextAverage - average - adjusted;
      average = nextAverage;

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
      average,
      missingCount: table.rows.filter((row) => !row[index]?.trim()).length,
      nonNumericCount: table.rows.filter(
        (row) => row[index]?.trim() && !isNumericText(row[index].trim())
      ).length,
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
  options: { outputPath?: string; yes?: boolean; sheet?: string; expectedContent?: string } = {}
): Promise<DataCleanResult> => {
  // Clean emits delimited output. JSON input would be silently converted to
  // CSV, which violates "no magic without control" — refuse instead.
  if (path.extname(inputPath).toLowerCase() === '.json') {
    throw new ZaoWuError({
      code: 'DATA_FORMAT_UNSUPPORTED',
      message: 'Data clean does not support JSON input yet.',
      why: '`zw data clean` writes delimited CSV/TSV output, so cleaning a `.json` file would silently change its format.',
      fix: 'Export the data as `.csv`, `.tsv`, or `.xlsx` first, then run `zw data clean` again.',
    });
  }

  const table = await loadDataTable(inputPath, options);
  const lines = [
    serializeDelimitedLine(table.headers, table.delimiter),
    ...table.rows.map((row) => serializeDelimitedLine(row, table.delimiter)),
  ];
  const content = `${lines.join('\n')}\n`;

  if (options.outputPath && options.yes) {
    if (options.expectedContent !== undefined && content !== options.expectedContent)
      throw new ZaoWuError({
        code: 'OPERATION_PLAN_MISMATCH',
        message: 'Data content changed after plan verification.',
        why: 'The cleaned output no longer matches the content authorized by the operation plan. No file was written.',
        fix: 'Run the preview again and confirm its new fingerprint.',
      });
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
  /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(value) &&
  !/^[+-]?0\d/.test(value) &&
  Number.isFinite(Number(value));

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
    const { workbook } = await openXlsxWorkbook(filePath);

    return {
      schemaVersion: 1,
      status: 'ok',
      filePath,
      sheets: workbook.SheetNames,
    };
  }

  await readDataFile(filePath);

  return {
    schemaVersion: 1,
    status: 'ok',
    filePath,
    sheets: ['default'],
  };
};
