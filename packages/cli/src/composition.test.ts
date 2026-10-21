import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeCli } from './run';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('explicit composed jobs', () => {
  it('keeps conversion and network approval separate and rejects edited intermediate content', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-composition-'));
    const input = path.join(root, 'report.html');
    const output = path.join(root, 'report.md');
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ response: 'Reviewed report.' }),
    }));
    vi.stubGlobal('fetch', fetcher);
    try {
      await writeFile(input, '<h1>Report</h1><p>Decide the next action.</p>');
      const conversion = JSON.parse(
        (await executeCli(['doc', 'convert', input, '--output', output, '--json'])).stdout
      );
      expect(conversion.status).toBe('preview');
      expect(conversion.wroteFile).toBe(false);
      await expect(readFile(output)).rejects.toThrow();
      const created = await executeCli([
        'doc',
        'convert',
        input,
        '--output',
        output,
        '--yes',
        '--plan-fingerprint',
        conversion.operationPlan.fingerprint,
        '--json',
      ]);
      expect(created.exitCode).toBe(0);
      const extracted = await readFile(output, 'utf8');
      expect(extracted).toContain('# Report');
      const args = [
        'ai',
        'ask',
        'Find next actions',
        '--file',
        output,
        '--provider',
        'ollama',
        '--json',
      ];
      const preview = JSON.parse((await executeCli(args)).stdout);
      expect(preview.status).toBe('preview');
      expect(fetcher).not.toHaveBeenCalled();
      await writeFile(output, `${extracted}\nNew private content.`);
      const stale = await executeCli([
        ...args,
        '--yes',
        '--plan-fingerprint',
        preview.operationPlan.fingerprint,
      ]);
      expect(JSON.parse(stale.stderr).error.code).toBe('OPERATION_PLAN_MISMATCH');
      expect(fetcher).not.toHaveBeenCalled();
      const fresh = JSON.parse((await executeCli(args)).stdout);
      const answer = await executeCli([
        ...args,
        '--yes',
        '--plan-fingerprint',
        fresh.operationPlan.fingerprint,
      ]);
      expect(JSON.parse(answer.stdout).output).toBe('Reviewed report.');
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(await readFile(input, 'utf8')).toContain('<h1>Report</h1>');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps JSON requests non-streaming and returns cancellation as one error envelope', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const preview = JSON.parse(
      (await executeCli(['ai', 'ask', 'hello', '--provider', 'ollama', '--json'])).stdout
    );
    const chunks: string[] = [];
    const cancelled = await executeCli(
      [
        'ai',
        'ask',
        'hello',
        '--provider',
        'ollama',
        '--json',
        '--yes',
        '--plan-fingerprint',
        preview.operationPlan.fingerprint,
      ],
      { signal: controller.signal, onChunk: (chunk) => chunks.push(chunk) }
    );
    expect(cancelled.exitCode).toBe(130);
    expect(cancelled.stdout).toBe('');
    expect(JSON.parse(cancelled.stderr).error.code).toBe('AI_REQUEST_CANCELLED');
    expect(chunks).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
