import { ZaoWuError } from '@zaowu-labs/core';
import { MAX_DATA_COLUMNS, assertTableSize, dataTooLarge } from './input-limits.js';

interface ParsedDelimitedLine {
  values: string[];
  trimmedCells: number;
}

interface CellCollector {
  values: string[];
  trimmedCells: number;
  push(value: string): void;
}

const createCellCollector = (): CellCollector => ({
  values: [],
  trimmedCells: 0,
  push(value: string): void {
    if (this.values.length >= MAX_DATA_COLUMNS) throw dataTooLarge();
    const trimmed = value.trim();

    if (value !== trimmed) {
      this.trimmedCells += 1;
    }

    this.values.push(trimmed);
  },
});

const parseTsvLine = (line: string): ParsedDelimitedLine => {
  const cells = createCellCollector();

  for (const value of line.split('\t', MAX_DATA_COLUMNS + 1)) {
    cells.push(value);
  }

  return { values: cells.values, trimmedCells: cells.trimmedCells };
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
export const parseCsvRecords = (content: string): ParsedDelimitedRecords => {
  const records: ParsedDelimitedLine[] = [];
  let emptyLineCount = 0;
  let widestRecord = 0;
  let cells = createCellCollector();
  let current = '';
  let raw = '';
  let quoted = false;
  let afterQuote = false;
  let started = false;

  const pushValue = (value: string): void => {
    cells.push(value);
  };

  const finishRecord = (): void => {
    pushValue(current);

    if (raw.trim() === '') {
      emptyLineCount += 1;
    } else {
      widestRecord = Math.max(widestRecord, cells.values.length);
      assertTableSize(records.length, widestRecord);
      records.push({ values: cells.values, trimmedCells: cells.trimmedCells });
    }

    cells = createCellCollector();
    current = '';
    raw = '';
    started = false;
    afterQuote = false;
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
      if (quoted) {
        quoted = false;
        afterQuote = true;
      } else {
        if (afterQuote || current.trim() !== '') throw invalidCsvQuote();
        quoted = true;
      }
      continue;
    }

    if (char === ',' && !quoted) {
      pushValue(current);
      current = '';
      afterQuote = false;
      continue;
    }

    if (afterQuote && char !== ' ' && char !== '\t') throw invalidCsvQuote();

    current += char;
  }

  if (quoted)
    throw new ZaoWuError({
      code: 'DATA_READ_FAILED',
      message: 'CSV contains an unclosed quoted field.',
      why: 'The file ended before a quoted field was closed; continuing would merge records and lose row boundaries.',
      fix: 'Close the quoted field or re-export the file as valid CSV.',
    });
  if (started || current !== '' || cells.values.length > 0) {
    finishRecord();
  }

  return { records, emptyLineCount };
};

const invalidCsvQuote = (): ZaoWuError =>
  new ZaoWuError({
    code: 'DATA_READ_FAILED',
    message: 'CSV contains a misplaced quote.',
    why: 'Quoted fields must start before non-whitespace content and end before a delimiter or record boundary. Silently removing quotes would change the data.',
    fix: 'Escape a literal quote as two quotes inside a quoted field, or re-export valid CSV.',
  });

export const parseTsvRecords = (content: string): ParsedDelimitedRecords => {
  const rawLines = content.split(/\r?\n/);
  const contentLines = rawLines.at(-1) === '' ? rawLines.slice(0, -1) : rawLines;
  const records: ParsedDelimitedLine[] = [];
  let emptyLineCount = 0;
  let widestRecord = 0;

  for (const line of contentLines) {
    if (line.trim() === '') {
      emptyLineCount += 1;
      continue;
    }

    const record = parseTsvLine(line);
    widestRecord = Math.max(widestRecord, record.values.length);
    assertTableSize(records.length, widestRecord);
    records.push(record);
  }

  return { records, emptyLineCount };
};

export const serializeDelimitedLine = (values: readonly string[], delimiter: ',' | '\t'): string =>
  values
    .map((value) => {
      const trimmed = value.trim();

      if (delimiter === ',' && /[",\n\r]/.test(trimmed)) {
        return `"${trimmed.replaceAll('"', '""')}"`;
      }

      return trimmed;
    })
    .join(delimiter);
