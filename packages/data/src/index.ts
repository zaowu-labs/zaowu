import { constants } from 'node:fs';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCapabilityLedger, stripUtf8Bom, type DomainDefinition } from '@zaowu/core';
import { ZaoWuError } from '@zaowu/core';

export interface DataTable {
  filePath: string;
  format: 'csv' | 'tsv' | 'xlsx';
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
  type: 'number' | 'boolean' | 'string' | 'empty' | 'mixed';
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

  throw new ZaoWuError({
    code: 'DATA_FORMAT_UNSUPPORTED',
    message: 'Data format is not supported yet.',
    why: `ZaoWu can read CSV, TSV, and XLSX files. It cannot parse \`${extension || 'unknown'}\` files yet.`,
    fix: 'Export the data as `.csv`, `.tsv`, or `.xlsx`, or add a parser inside `packages/data` before using this format.',
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
        emptyLineCount: normalizedRows.length - 1 - dataRows.length,
        trimmedCellCount: 0,
      };
    } catch (error) {
      if (error instanceof ZaoWuError) {
        throw error;
      }

      throw new ZaoWuError({
        code: 'DATA_READ_FAILED',
        message: 'Could not read data file.',
        why: `ZaoWu tried to read \`${filePath}\` as an XLSX file, but the file was not readable.`,
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

  const rawLines = content.split(/\r?\n/);
  const contentLines = rawLines.at(-1) === '' ? rawLines.slice(0, -1) : rawLines;
  const lines = contentLines.filter((line) => line.trim());
  const emptyLineCount = contentLines.length - lines.length;
  const parsedHeaders = lines[0]
    ? parseDelimitedLineDetailed(lines[0], source.delimiter)
    : { values: [], trimmedCells: 0 };
  const parsedRows = lines
    .slice(1)
    .map((line) => parseDelimitedLineDetailed(line, source.delimiter));
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

const pathExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const assertSafeOutputPath = async (inputPath: string, outputPath: string): Promise<void> => {
  if (path.resolve(inputPath) === path.resolve(outputPath)) {
    throw new ZaoWuError({
      code: 'DATA_OUTPUT_CONFLICT',
      message: 'Data output path conflicts with input path.',
      why: '`zw data clean` refuses to overwrite the input dataset.',
      fix: 'Choose a different `--output` path.',
    });
  }

  if (await pathExists(outputPath)) {
    throw new ZaoWuError({
      code: 'DATA_OUTPUT_CONFLICT',
      message: 'Data output file already exists.',
      why: `ZaoWu will not silently overwrite \`${outputPath}\`.`,
      fix: 'Choose a new `--output` path, or remove the existing file yourself first.',
    });
  }
};

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
      .map((row) => Number.parseFloat(row[index] ?? ''))
      .filter((value) => Number.isFinite(value));

    if (numbers.length === 0) {
      continue;
    }

    const total = numbers.reduce((sum, value) => sum + value, 0);

    numericColumns.push({
      column: header,
      count: numbers.length,
      min: Math.min(...numbers),
      max: Math.max(...numbers),
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
    await assertSafeOutputPath(inputPath, options.outputPath);

    try {
      await writeFile(options.outputPath, content, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      if (error instanceof ZaoWuError) {
        throw error;
      }

      throw new ZaoWuError({
        code: 'DATA_WRITE_FAILED',
        message: 'Could not write cleaned data.',
        why: `ZaoWu tried to write \`${options.outputPath}\`, but the file system rejected the write.`,
        fix: 'Check the output directory and permissions, then run the command again.',
      });
    }
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

const getColumnType = (values: readonly string[]): DataColumnSchema['type'] => {
  const nonEmpty = values.filter((value) => value.trim());

  if (nonEmpty.length === 0) {
    return 'empty';
  }

  if (nonEmpty.every((value) => Number.isFinite(Number(value)))) {
    return 'number';
  }

  if (nonEmpty.every(isBoolean)) {
    return 'boolean';
  }

  if (
    nonEmpty.some((value) => Number.isFinite(Number(value)) || isBoolean(value)) &&
    nonEmpty.some((value) => !Number.isFinite(Number(value)) && !isBoolean(value))
  ) {
    return 'mixed';
  }

  return 'string';
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
