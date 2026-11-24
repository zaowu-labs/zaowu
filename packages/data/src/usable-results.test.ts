import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDataTable, listSheets, cleanData } from './index';

describe('trustworthy table results', () => {
  it.each([
    ['tsv', 'CSV', 'name\tcount\n"a,b"\t2\n', 'name,count\n"""a,b""",2\n'],
    ['csv', 'tsv', 'name,count\n"a,b",2\n,\n', 'name\tcount\na,b\t2\n\t\n'],
    ['tsv', 'txt', ' name \tcount\n A \t2\n', 'name\tcount\nA\t2\n'],
    ['tsv', '', ' name \tcount\r A \t2\r', 'name\tcount\nA\t2\n'],
    ['csv', 'csv', 'name\n""\n', 'name\n""\n'],
  ])(
    'renders %s input for a %s destination in preview and confirmed writes',
    async (ext, suffix, input, expected) => {
      const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-export-'));
      try {
        const file = path.join(cwd, 'input.' + ext);
        const outputPath = path.join(cwd, suffix ? 'export.' + suffix : 'export');
        await writeFile(file, input);
        const preview = await cleanData(file, { outputPath });
        expect(preview).toMatchObject({ status: 'preview', content: expected, wroteFile: false });
        await expect(access(outputPath)).rejects.toHaveProperty('code', 'ENOENT');
        await cleanData(file, { outputPath, yes: true, expectedContent: preview.content });
        expect(await readFile(outputPath, 'utf8')).toBe(expected);
        if (['csv', 'tsv'].includes(suffix.toLowerCase())) {
          expect((await loadDataTable(outputPath)).rows).toEqual((await loadDataTable(file)).rows);
        }
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    }
  );

  it.each([
    ['xlsx', 'name\nA\n'],
    ['json', 'name\nA\n'],
    ['tsv', 'name\n"one\ntwo"\n'],
    ['tsv', 'name\none\ttwo\n'],
    ['tsv', 'name\n""\n'],
  ])('rejects unrepresentable %s output before previewing or writing', async (ext, input) => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-export-'));
    try {
      const file = path.join(cwd, 'input.csv');
      const outputPath = path.join(cwd, 'export.' + ext);
      await writeFile(file, input);
      for (const yes of [false, true]) {
        await expect(cleanData(file, { outputPath, yes })).rejects.toMatchObject({
          code: 'DATA_FORMAT_UNSUPPORTED',
        });
      }
      await expect(access(outputPath)).rejects.toHaveProperty('code', 'ENOENT');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
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

it.each([
  ['csv', ','],
  ['tsv', '\t'],
])('reads BOM-marked UTF-16 %s in either byte order', async (extension, delimiter) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-delimited-encoding-'));
  try {
    const file = path.join(cwd, `input.${extension}`);
    const bytes = Buffer.from(`\uFEFF城市${delimiter}金额\r\n上海🌱${delimiter}23\r\n`, 'utf16le');
    for (const input of [bytes, Buffer.from(bytes).swap16()]) {
      await writeFile(file, input);
      expect(await loadDataTable(file)).toMatchObject({
        headers: ['城市', '金额'],
        rows: [['上海🌱', '23']],
      });
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

it.each([
  ['csv', Buffer.from([0x61, 0xff, 0x62])],
  ['csv', Buffer.from([0xff, 0xfe, 0x61])],
  ['tsv', Buffer.from([0xfe, 0xff, 0xd8, 0x00])],
  ['tsv', Buffer.from('\uFEFFa\0b', 'utf16le')],
  ['csv', Buffer.from('a\0b')],
  ['json', Buffer.from('\uFEFF{"a":1}', 'utf16le')],
] as const)('rejects invalid table bytes or encodings for %s', async (extension, bytes) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-data-utf8-'));
  try {
    const file = path.join(cwd, `input.${extension}`);
    await writeFile(file, bytes);
    await expect(loadDataTable(file)).rejects.toMatchObject({
      code: 'DATA_READ_FAILED',
      fix: expect.stringContaining('UTF-8'),
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
