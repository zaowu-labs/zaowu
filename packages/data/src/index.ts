import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stripUtf8Bom, type DomainDefinition } from '@zaowu/core';
import { ZaoWuError } from '@zaowu/core';

export interface DataTable {
  filePath: string;
  delimiter: ',' | '\t';
  headers: string[];
  rows: string[][];
}

export interface DataInspectResult {
  status: 'ok';
  filePath: string;
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
  status: 'ok';
  filePath: string;
  numericColumns: NumericColumnAnalysis[];
}

export interface DataCleanResult {
  status: 'ok' | 'preview';
  inputPath: string;
  outputPath?: string;
  content: string;
  wroteFile: boolean;
}

export const DATA_DOMAIN: DomainDefinition = {
  name: 'data',
  summary: 'Data workflows for inspection, analysis, and cleanup',
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
  ],
};

const assertSupportedDataFile = (filePath: string): ',' | '\t' => {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.csv') {
    return ',';
  }

  if (extension === '.tsv') {
    return '\t';
  }

  throw new ZaoWuError({
    code: 'DATA_FORMAT_UNSUPPORTED',
    message: 'Data format is not supported yet.',
    why: `This first version reads CSV and TSV files. It cannot parse \`${extension || 'unknown'}\` files yet.`,
    fix: 'Export the data as `.csv` or `.tsv`, or add a parser inside `packages/data` before using this format.',
  });
};

const parseDelimitedLine = (line: string, delimiter: ',' | '\t'): string[] => {
  if (delimiter === '\t') {
    return line.split('\t').map((value) => value.trim());
  }

  const values: string[] = [];
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
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
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

export const loadDataTable = async (filePath: string): Promise<DataTable> => {
  const delimiter = assertSupportedDataFile(filePath);
  let content: string;

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

  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  const headers = lines[0] ? parseDelimitedLine(lines[0], delimiter) : [];
  const rows = lines.slice(1).map((line) => parseDelimitedLine(line, delimiter));

  return {
    filePath,
    delimiter,
    headers,
    rows,
  };
};

export const inspectData = async (filePath: string): Promise<DataInspectResult> => {
  const table = await loadDataTable(filePath);
  const missingByColumn: Record<string, number> = {};

  for (const [index, header] of table.headers.entries()) {
    missingByColumn[header] = table.rows.filter((row) => !row[index]?.trim()).length;
  }

  return {
    status: 'ok',
    filePath,
    rowCount: table.rows.length,
    columnCount: table.headers.length,
    columns: table.headers,
    missingByColumn,
  };
};

export const analyzeData = async (filePath: string): Promise<DataAnalyzeResult> => {
  const table = await loadDataTable(filePath);
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
    status: 'ok',
    filePath,
    numericColumns,
  };
};

export const cleanData = async (
  inputPath: string,
  options: { outputPath?: string; yes?: boolean } = {}
): Promise<DataCleanResult> => {
  const table = await loadDataTable(inputPath);
  const lines = [
    serializeDelimitedLine(table.headers, table.delimiter),
    ...table.rows.map((row) => serializeDelimitedLine(row, table.delimiter)),
  ];
  const content = `${lines.join('\n')}\n`;

  if (options.outputPath && options.yes) {
    await writeFile(options.outputPath, content, 'utf8');
  }

  return {
    status: options.outputPath && !options.yes ? 'preview' : 'ok',
    inputPath,
    outputPath: options.outputPath,
    content,
    wroteFile: Boolean(options.outputPath && options.yes),
  };
};
