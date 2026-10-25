import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDataTable, listSheets, cleanData } from './index';

describe('trustworthy table results', () => {
  it.each(['name\nhello "world"\n', 'name\n"hello"suffix\n', 'name\n"hello" "world"\n'])(
    'rejects malformed quotes instead of silently changing cell content: %s',
    async (content) => {
      const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-csv-quotes-'));
      try {
        const file = path.join(cwd, 'input.csv');
        await writeFile(file, content);
        await expect(loadDataTable(file)).rejects.toMatchObject({ code: 'DATA_READ_FAILED' });
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    }
  );
  it('preserves escaped quotes, quoted multiline fields, whitespace, and empty quoted records', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-csv-valid-'));
    try {
      const file = path.join(cwd, 'input.csv');
      await writeFile(file, 'name,value\r\n"a""b","line1\nline2"\r\n  alpha  , "beta" \r\n"",\r\n');
      const result = await loadDataTable(file);
      expect(result.rows).toEqual([
        ['a"b', 'line1\nline2'],
        ['alpha', 'beta'],
        ['', ''],
      ]);
      expect((await cleanData(file)).content).toContain('"a""b"');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
  it('refuses to list sheets in missing CSV files and to ignore a sheet selector on CSV', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-data-sheets-'));
    try {
      await expect(listSheets(path.join(cwd, 'missing.csv'))).rejects.toMatchObject({
        code: 'DATA_READ_FAILED',
      });
      const file = path.join(cwd, 'input.csv');
      await writeFile(file, 'name\nA\n');
      await expect(loadDataTable(file, { sheet: 'Sales' })).rejects.toMatchObject({
        code: 'DATA_SHEET_NOT_FOUND',
      });
      expect((await listSheets(file)).sheets).toEqual(['default']);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

it.each(['csv', 'json'])(
  'rejects malformed UTF-8 %s before replacing cell bytes',
  async (extension) => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-data-utf8-'));
    try {
      const file = path.join(cwd, `input.${extension}`);
      await writeFile(file, Buffer.from([0xff, 0xfe, 0x61]));
      await expect(loadDataTable(file)).rejects.toMatchObject({
        code: 'DATA_READ_FAILED',
        message: 'Table text is not valid UTF-8.',
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }
);
