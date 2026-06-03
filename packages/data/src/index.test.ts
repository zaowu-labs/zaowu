import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeData, cleanData, DATA_DOMAIN, inspectData } from './index';

describe('data domain', () => {
  it('declares data workflow commands', () => {
    expect(DATA_DOMAIN.name).toBe('data');
    expect(DATA_DOMAIN.commands.map((command) => command.name)).toEqual([
      'inspect',
      'analyze',
      'clean',
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

    await writeFile(inputPath, ' name , amount \n A , 10 \n', 'utf8');

    try {
      await expect(cleanData(inputPath, { outputPath })).resolves.toEqual({
        status: 'preview',
        inputPath,
        outputPath,
        content: 'name,amount\nA,10\n',
        wroteFile: false,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects unsupported spreadsheet formats for now', async () => {
    await expect(inspectData('sales.xlsx')).rejects.toThrow('Data format is not supported yet.');
  });
});
