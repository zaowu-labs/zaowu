import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeData, inspectData, sampleData } from './index';

describe('JSON data regressions', () => {
  it.each([false, true])(
    'keeps source values when normalizing JSON keys (array=%s)',
    async (array) => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-json-'));
      const file = path.join(root, 'data.json');
      const record = { ' amount ': 10, amount: 20, '': 'empty key', column_3: 'original' };
      try {
        await writeFile(file, JSON.stringify(array ? [record] : record));
        expect((await sampleData(file)).rows).toEqual([
          { amount: '10', amount_2: '20', column_3: 'empty key', column_3_2: 'original' },
        ]);
        expect((await analyzeData(file)).numericColumns).toMatchObject([
          { column: 'amount', average: 10 },
          { column: 'amount_2', average: 20 },
        ]);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  );

  it('treats absent prototype-named JSON fields as missing cells', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-json-'));
    const file = path.join(root, 'data.json');
    try {
      await writeFile(file, '[{"constructor":"own","toString":"own","__proto__":"own"},{}]');
      expect((await sampleData(file)).rows[1]).toEqual(
        JSON.parse('{"constructor":"","toString":"","__proto__":""}')
      );
      const missing = (await inspectData(file)).missingByColumn;
      expect(JSON.stringify(missing)).toBe('{"constructor":1,"toString":1,"__proto__":1}');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
