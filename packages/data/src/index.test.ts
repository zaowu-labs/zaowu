import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
    ]);
  });

  it('inspects CSV shape and missing values', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-data-'));
    const filePath = path.join(root, 'sales.csv');

    await writeFile(filePath, 'name,amount\nA,10\nB,\n', 'utf8');

    try {
      await expect(inspectData(filePath)).resolves.toEqual({
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

  it('analyzes numeric columns', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-data-'));
    const filePath = path.join(root, 'sales.csv');

    await writeFile(filePath, 'name,amount\nA,10\nB,20\n', 'utf8');

    try {
      await expect(analyzeData(filePath)).resolves.toEqual({
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

  it('rejects unsupported data formats', async () => {
    await expect(inspectData('sales.xls')).rejects.toThrow('Data format is not supported yet.');
  });
});
