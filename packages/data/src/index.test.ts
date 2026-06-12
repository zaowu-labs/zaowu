import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import {
  analyzeData,
  cleanData,
  DATA_DOMAIN,
  inferDataSchema,
  inspectData,
  sampleData,
  listSheets,
} from './index';

describe('data domain', () => {
  it('declares data workflow commands', () => {
    expect(DATA_DOMAIN.name).toBe('data');
    expect(DATA_DOMAIN.commands.map((command) => command.name)).toEqual([
      'inspect',
      'analyze',
      'clean',
      'schema',
      'sample',
      'sheets',
    ]);
  });

  it('inspects CSV shape and missing values', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-data-'));
    const filePath = path.join(root, 'sales.csv');

    await writeFile(filePath, 'name,amount\nA,10\nB,\n', 'utf8');

    try {
      await expect(inspectData(filePath)).resolves.toEqual({
        schemaVersion: 1,
        status: 'ok',
        filePath,
        rowCount: 2,
        columnCount: 2,
        columns: ['name', 'amount'],
        missingByColumn: {
          name: 0,
          amount: 1,
        },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('strips a UTF-8 BOM from CSV headers', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-data-'));
    const filePath = path.join(root, 'sales.csv');

    await writeFile(filePath, '\uFEFFname,amount\nalpha,1\n', 'utf8');

    try {
      await expect(inspectData(filePath)).resolves.toMatchObject({
        columns: ['name', 'amount'],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('handles quoted CSV values with commas and escaped quotes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-data-'));
    const filePath = path.join(root, 'quoted.csv');

    await writeFile(filePath, 'name,note\nA,"hello, world"\nB,"said ""hi"""\n', 'utf8');

    try {
      await expect(sampleData(filePath, { rows: 2 })).resolves.toMatchObject({
        rows: [
          {
            name: 'A',
            note: 'hello, world',
          },
          {
            name: 'B',
            note: 'said "hi"',
          },
        ],
      });
      await expect(cleanData(filePath)).resolves.toMatchObject({
        content: 'name,note\nA,"hello, world"\nB,"said ""hi"""\n',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('inspects empty CSV files as empty datasets', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-data-'));
    const filePath = path.join(root, 'empty.csv');

    await writeFile(filePath, '', 'utf8');

    try {
      await expect(inspectData(filePath)).resolves.toEqual({
        schemaVersion: 1,
        status: 'ok',
        filePath,
        rowCount: 0,
        columnCount: 0,
        columns: [],
        missingByColumn: {},
      });
      await expect(sampleData(filePath)).resolves.toMatchObject({
        rowCount: 0,
        rows: [],
      });
      await expect(inferDataSchema(filePath)).resolves.toMatchObject({
        columns: [],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('analyzes numeric columns', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-data-'));
    const filePath = path.join(root, 'sales.csv');

    await writeFile(filePath, 'name,amount\nA,10\nB,20\n', 'utf8');

    try {
      await expect(analyzeData(filePath)).resolves.toEqual({
        schemaVersion: 1,
        status: 'ok',
        filePath,
        numericColumns: [
          {
            column: 'amount',
            count: 2,
            min: 10,
            max: 20,
            average: 15,
          },
        ],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('previews cleaned CSV output without writing by default', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-data-'));
    const inputPath = path.join(root, 'sales.csv');
    const outputPath = path.join(root, 'clean.csv');

    await writeFile(inputPath, ' name , amount \n A , 10 \n\n', 'utf8');

    try {
      await expect(cleanData(inputPath, { outputPath })).resolves.toEqual({
        schemaVersion: 1,
        status: 'preview',
        inputPath,
        outputPath,
        content: 'name,amount\nA,10\n',
        wroteFile: false,
        removedEmptyRows: 1,
        trimmedCells: 4,
        missingByColumn: {
          name: 0,
          amount: 0,
        },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('writes cleaned CSV output only after confirmation', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-data-'));
    const inputPath = path.join(root, 'sales.csv');
    const outputPath = path.join(root, 'clean.csv');

    await writeFile(inputPath, ' name , amount \n A , 10 \n', 'utf8');

    try {
      await expect(cleanData(inputPath, { outputPath, yes: true })).resolves.toMatchObject({
        status: 'ok',
        inputPath,
        outputPath,
        content: 'name,amount\nA,10\n',
        wroteFile: true,
      });
      await expect(readFile(outputPath, 'utf8')).resolves.toBe('name,amount\nA,10\n');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('refuses to overwrite data inputs or existing outputs', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-data-'));
    const inputPath = path.join(root, 'sales.csv');
    const outputPath = path.join(root, 'clean.csv');

    await writeFile(inputPath, 'name,amount\nA,10\n', 'utf8');
    await writeFile(outputPath, 'existing', 'utf8');

    try {
      await expect(cleanData(inputPath, { outputPath: inputPath, yes: true })).rejects.toThrow(
        'Data output path conflicts with input path.'
      );
      await expect(cleanData(inputPath, { outputPath, yes: true })).rejects.toThrow(
        'Data output file already exists.'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('infers CSV schema', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-data-'));
    const filePath = path.join(root, 'sales.csv');

    await writeFile(filePath, 'name,amount,active,note\nA,10,true,\nB,20,false,text\n', 'utf8');

    try {
      await expect(inferDataSchema(filePath)).resolves.toMatchObject({
        columns: [
          {
            column: 'name',
            type: 'string',
            nullable: false,
          },
          {
            column: 'amount',
            type: 'number',
            nullable: false,
          },
          {
            column: 'active',
            type: 'boolean',
            nullable: false,
          },
          {
            column: 'note',
            type: 'string',
            nullable: true,
          },
        ],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('samples CSV rows', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-data-'));
    const filePath = path.join(root, 'sales.csv');

    await writeFile(filePath, 'name,amount\nA,10\nB,20\n', 'utf8');

    try {
      await expect(sampleData(filePath, { rows: 1 })).resolves.toMatchObject({
        rowCount: 1,
        rows: [
          {
            name: 'A',
            amount: '10',
          },
        ],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('normalizes blank and duplicate headers before sampling rows', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-data-'));
    const filePath = path.join(root, 'messy.csv');

    await writeFile(filePath, 'name,name,,name\nA,B,C,D\n', 'utf8');

    try {
      await expect(inspectData(filePath)).resolves.toMatchObject({
        columns: ['name', 'name_2', 'column_3', 'name_3'],
      });
      await expect(sampleData(filePath, { rows: 1 })).resolves.toMatchObject({
        rows: [
          {
            name: 'A',
            name_2: 'B',
            column_3: 'C',
            name_3: 'D',
          },
        ],
      });
      await expect(inferDataSchema(filePath)).resolves.toMatchObject({
        columns: [
          {
            column: 'name',
            index: 0,
          },
          {
            column: 'name_2',
            index: 1,
          },
          {
            column: 'column_3',
            index: 2,
          },
          {
            column: 'name_3',
            index: 3,
          },
        ],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('inspects XLSX workbooks from the first sheet', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-data-'));
    const filePath = path.join(root, 'sales.xlsx');
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['name', 'amount', 'active'],
      ['A', 10, true],
      ['B', 20, false],
      ['', '', ''],
    ]);

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sales');
    XLSX.writeFile(workbook, filePath);

    try {
      await expect(inspectData(filePath)).resolves.toMatchObject({
        status: 'ok',
        filePath,
        rowCount: 2,
        columnCount: 3,
        columns: ['name', 'amount', 'active'],
        missingByColumn: {
          name: 0,
          amount: 0,
          active: 0,
        },
      });
      await expect(inferDataSchema(filePath)).resolves.toMatchObject({
        columns: [
          {
            column: 'name',
            type: 'string',
          },
          {
            column: 'amount',
            type: 'number',
          },
          {
            column: 'active',
            type: 'boolean',
          },
        ],
      });
      await expect(sampleData(filePath, { rows: 1 })).resolves.toMatchObject({
        rowCount: 1,
        rows: [
          {
            name: 'A',
            amount: '10',
            active: 'true',
          },
        ],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reads a named XLSX sheet when requested', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-data-'));
    const filePath = path.join(root, 'sales.xlsx');
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['name', 'amount'],
        ['ignored', 0],
      ]),
      'Summary'
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['name', 'amount'],
        ['A', 10],
        ['B', 20],
      ]),
      'Details'
    );
    XLSX.writeFile(workbook, filePath);

    try {
      await expect(inspectData(filePath, { sheet: 'Details' })).resolves.toMatchObject({
        sheetName: 'Details',
        rowCount: 2,
        columns: ['name', 'amount'],
      });
      await expect(sampleData(filePath, { sheet: 'Details', rows: 1 })).resolves.toMatchObject({
        sheetName: 'Details',
        rows: [
          {
            name: 'A',
            amount: '10',
          },
        ],
      });
      await expect(inspectData(filePath, { sheet: 'Missing' })).rejects.toThrow(
        'XLSX sheet was not found.'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects damaged XLSX workbooks with an actionable read error', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-data-'));
    const filePath = path.join(root, 'damaged.xlsx');

    await writeFile(filePath, 'not a workbook', 'utf8');

    try {
      await expect(inspectData(filePath)).rejects.toThrow('Could not read data file.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects unsupported data formats', async () => {
    await expect(inspectData('sales.xls')).rejects.toThrow('Data format is not supported yet.');
  });

  it('lists sheets for CSV and TSV files', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-data-'));
    const csvPath = path.join(root, 'test.csv');
    const tsvPath = path.join(root, 'test.tsv');

    await writeFile(csvPath, 'name,amount\nA,10\n', 'utf8');
    await writeFile(tsvPath, 'name\tamount\nA\t10\n', 'utf8');

    try {
      await expect(listSheets(csvPath)).resolves.toEqual({
        schemaVersion: 1,
        status: 'ok',
        filePath: csvPath,
        sheets: ['default'],
      });
      await expect(listSheets(tsvPath)).resolves.toEqual({
        schemaVersion: 1,
        status: 'ok',
        filePath: tsvPath,
        sheets: ['default'],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('lists sheets for XLSX workbooks', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-data-'));
    const filePath = path.join(root, 'sheets.xlsx');
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['name'], ['A']]), 'SheetA');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['amount'], [10]]), 'SheetB');
    XLSX.writeFile(workbook, filePath);

    try {
      await expect(listSheets(filePath)).resolves.toEqual({
        schemaVersion: 1,
        status: 'ok',
        filePath,
        sheets: ['SheetA', 'SheetB'],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
