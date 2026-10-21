import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as core from '@zaowu-labs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeCli } from './run';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('input changes inside a confirmed execution', () => {
  it.each(['doc', 'data', 'ai'])(
    'rejects changed %s content before writes or network',
    async (domain) => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-input-race-'));
      const input = path.join(root, domain === 'data' ? 'sales.csv' : 'report.md');
      const output = path.join(root, domain === 'data' ? 'clean.csv' : 'converted.txt');
      const initial = domain === 'data' ? 'name,amount\nA,10\n' : '# Report\nOld public content.\n';
      const changed =
        domain === 'data' ? 'name,amount\nPRIVATE,999\n' : '# Report\nNew private content.\n';
      const fetcher = vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ response: 'answer' }),
      }));
      vi.stubGlobal('fetch', fetcher);
      try {
        await writeFile(input, initial);
        const args =
          domain === 'ai'
            ? ['ai', 'ask', 'Review', '--file', input, '--provider', 'ollama', '--json']
            : [domain, domain === 'doc' ? 'convert' : 'clean', input, '--output', output, '--json'];
        const preview = JSON.parse((await executeCli(args)).stdout);
        const read = core.readBoundedFile;
        let reads = 0;
        vi.spyOn(core, 'readBoundedFile').mockImplementation(async (...parameters) => {
          const buffer = await read(...parameters);
          if (parameters[0] === input && ++reads === 1) await writeFile(input, changed);
          return buffer;
        });
        const executed = await executeCli([
          ...args,
          '--yes',
          '--plan-fingerprint',
          preview.operationPlan.fingerprint,
        ]);
        expect(executed.exitCode).toBe(1);
        expect(JSON.parse(executed.stderr).error.code).toBe('OPERATION_PLAN_MISMATCH');
        expect(fetcher).not.toHaveBeenCalled();
        await expect(readFile(output)).rejects.toThrow();
        expect(await readFile(input, 'utf8')).toBe(changed);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  );
});
