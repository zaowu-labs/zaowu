import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { afterEach, describe, expect, it } from 'vitest';
import { assertWorkbookSize } from './input-limits';
import { analyzeData, inferDataSchema, inspectData, sampleData } from './index';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const file = async (name: string, content: string | Buffer): Promise<string> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-data-real-'));
  roots.push(root);
  const target = path.join(root, name);
  await writeFile(target, content);
  return target;
};

describe('real bounded data inputs', () => {
  it('reports missing and rejected numeric cells from a multi-sheet XLSX', async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([['Ignored'], ['value']]),
      'Intro'
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['name', 'amount'],
        ['A', 10],
        ['B', null],
        ['C', '20kg'],
        ['D', 30],
      ]),
      '销售'
    );
    const target = await file(
      'sales.xlsx',
      XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
    );
    await expect(analyzeData(target, { sheet: '销售' })).resolves.toMatchObject({
      numericColumns: [
        { column: 'amount', count: 2, average: 20, missingCount: 1, nonNumericCount: 1 },
      ],
    });
    await expect(inspectData(target, { sheet: '销售' })).resolves.toMatchObject({
      rowCount: 4,
      missingByColumn: { amount: 1 },
    });
    await expect(inferDataSchema(target, { sheet: '销售' })).resolves.toMatchObject({
      columns: [{ column: 'name' }, { column: 'amount', nullable: true, type: 'mixed' }],
    });
  });

  it('rejects a forged huge worksheet dimension before enumerating sparse cells', async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['name'], ['A']]), 'Sheet1');
    const zip = await JSZip.loadAsync(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
    const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    zip.file(
      'xl/worksheets/sheet1.xml',
      xml.replace(/<dimension ref="[^"]+"\/>/, '<dimension ref="A1:XFD1048576"/>')
    );
    const target = await file('sparse.xlsx', await zip.generateAsync({ type: 'nodebuffer' }));
    await expect(inspectData(target)).rejects.toMatchObject({ code: 'DATA_INPUT_TOO_LARGE' });
  });

  it('stops a highly compressed workbook at the actual inflation budget', async () => {
    const zip = new JSZip();
    zip.file('oversized.xml', 'a'.repeat(64 * 1024 * 1024 + 1));
    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 1 },
    });
    await expect(assertWorkbookSize(buffer)).rejects.toMatchObject({
      code: 'DATA_INPUT_TOO_LARGE',
    });
  }, 20_000);

  it('preserves values under unnamed extra CSV columns', async () => {
    const target = await file('extra.csv', 'name\nA,10,yes\n');
    expect((await sampleData(target)).rows).toEqual([
      { name: 'A', column_2: '10', column_3: 'yes' },
    ]);
  });

  it('keeps nested JSON values instead of replacing them with [object Object]', async () => {
    const target = await file('nested.json', '[{"nested":{"a":1},"list":[1,2]}]');
    expect((await sampleData(target)).rows).toEqual([{ nested: '{"a":1}', list: '[1,2]' }]);
  });

  it.each(['null', '42', '[1,2]', '[{"a":1},null]'])(
    'rejects unsupported JSON table shape %s',
    async (content) => {
      const target = await file('invalid.json', content);
      await expect(inspectData(target)).rejects.toMatchObject({
        code: 'DATA_READ_FAILED',
        fix: expect.stringContaining('records'),
      });
    }
  );

  it('rejects unclosed CSV quotes instead of silently merging rows', async () => {
    const target = await file('invalid.csv', 'name,amount\n"A,10\nB,20\n');
    await expect(inspectData(target)).rejects.toMatchObject({
      code: 'DATA_READ_FAILED',
      message: expect.stringContaining('unclosed'),
    });
  });

  it('rejects oversized files and wide tables', async () => {
    const target = await file('large.csv', '');
    const handle = await open(target, 'w');
    try {
      await handle.truncate(20 * 1024 * 1024 + 1);
    } finally {
      await handle.close();
    }
    await expect(inspectData(target)).rejects.toMatchObject({ code: 'DATA_INPUT_TOO_LARGE' });
    const wide = await file('wide.tsv', Array(1_025).fill('x').join('\t'));
    await expect(inspectData(wide)).rejects.toMatchObject({ code: 'DATA_INPUT_TOO_LARGE' });
  });

  it('computes a finite average when ordinary summation would overflow', async () => {
    const target = await file('extreme.csv', 'value\n1e308\n1e308\n1e999\n');
    expect((await analyzeData(target)).numericColumns[0]).toMatchObject({
      average: 1e308,
      count: 2,
      nonNumericCount: 1,
    });
  });
});
