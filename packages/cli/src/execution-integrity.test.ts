import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as config from '@zaowu-labs/config';
import { DEV_AI_DIFF_CHARACTER_LIMIT } from '@zaowu-labs/dev';
import * as plugin from '@zaowu-labs/plugin';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeCli } from './run';

afterEach(() => {
  vi.restoreAllMocks();
});

it('checks AI review locations against the complete diff lines sent to the provider', async () => {
  const header = '@@ -0,0 +1,3 @@';
  const visibleDiff = `diff --git a/example.ts b/example.ts\n--- /dev/null\n+++ b/example.ts\n${header}\n+visible\n`;
  const fullDiff =
    visibleDiff +
    `+${'x'.repeat(DEV_AI_DIFF_CHARACTER_LIMIT)}\n+not sent\n` +
    'diff --git a/later.ts b/later.ts\n--- /dev/null\n+++ b/later.ts\n@@ -0,0 +1 @@\n+also not sent\n';
  const commandRunner = (_command: string, args: readonly string[]) => {
    if (args.includes('--name-only')) return 'example.ts\0later.ts\0';
    if (args.includes('--numstat')) return '3\t0\texample.ts\0' + '1\t0\tlater.ts\0';
    return fullDiff;
  };
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json({
      done: true,
      done_reason: 'stop',
      response: JSON.stringify([
        {
          title: 'Shown line',
          detail: 'Visible',
          filePath: 'example.ts',
          line: 1,
          hunkHeader: header,
        },
        {
          title: 'Partial line',
          detail: 'Partial',
          filePath: 'example.ts',
          line: 2,
          hunkHeader: header,
        },
        { title: 'Unseen file', detail: 'Unseen', filePath: 'later.ts' },
      ]),
    })
  );
  const args = ['dev', 'review', '--staged', '--ai', '--provider', 'ollama', '--json'];
  const preview = JSON.parse((await executeCli(args, { commandRunner })).stdout);
  expect(preview.status).toBe('preview');
  expect(fetcher).not.toHaveBeenCalled();
  const confirmed = await executeCli(
    [...args, '--yes', '--plan-fingerprint', preview.operationPlan.fingerprint],
    { commandRunner }
  );
  expect(confirmed.exitCode).toBe(0);
  const result = JSON.parse(confirmed.stdout);
  const findings = result.findings.filter(
    (finding: { origin?: string }) => finding.origin === 'ai'
  );
  expect(findings[0]).toMatchObject({ filePath: 'example.ts', line: 1, hunkHeader: header });
  expect(findings[1]).not.toHaveProperty('line');
  expect(findings[1]).not.toHaveProperty('hunkHeader');
  expect(findings[1].detail).toContain('Location could not be verified');
  expect(findings[2]).not.toHaveProperty('filePath');
  expect(result.operationPlan.notes[0]).toContain(`${visibleDiff.length} of ${fullDiff.length}`);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const providerBody = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
  expect(providerBody.prompt).toContain(visibleDiff);
  expect(providerBody.prompt).not.toContain('xxxxxxxxxx');
  expect(providerBody.prompt).not.toContain('later.ts');
});

describe('working-directory and config confirmation integrity', () => {
  it.each(['doc', 'data'])(
    'rejects a %s confirmation copied into a different directory',
    async (domain) => {
      const first = await mkdtemp(path.join(os.tmpdir(), 'zaowu-plan-first-'));
      const second = await mkdtemp(path.join(os.tmpdir(), 'zaowu-plan-second-'));
      const original = process.cwd();
      const name = domain === 'doc' ? 'report.md' : 'sales.csv';
      const content = domain === 'doc' ? '# Report\nSame text.' : 'name,amount\nA,10\n';
      const args = [
        domain,
        domain === 'doc' ? 'convert' : 'clean',
        name,
        '--output',
        'result.txt',
        '--json',
      ];
      try {
        await writeFile(path.join(first, name), content);
        await writeFile(path.join(second, name), content);
        process.chdir(first);
        const preview = JSON.parse((await executeCli(args)).stdout);
        process.chdir(second);
        const result = await executeCli([
          ...args,
          '--yes',
          '--plan-fingerprint',
          preview.operationPlan.fingerprint,
        ]);
        expect(result.exitCode).toBe(1);
        expect(JSON.parse(result.stderr).error.code).toBe('OPERATION_PLAN_MISMATCH');
        await expect(readFile(path.join(second, 'result.txt'))).rejects.toThrow();
      } finally {
        process.chdir(original);
        await Promise.all(
          [first, second].map((root) => rm(root, { recursive: true, force: true }))
        );
      }
    }
  );

  it('uses the supplied cwd for relative file inputs without changing process.cwd', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-api-cwd-'));
    try {
      await writeFile(
        path.join(cwd, 'unique-review-report.md'),
        '# Expected project\nLocal content.'
      );
      const result = await executeCli(['doc', 'summary', 'unique-review-report.md', '--json'], {
        cwd,
      });
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        filePath: path.join(cwd, 'unique-review-report.md'),
        title: 'Expected project',
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('preserves a plugin manifest changed after removal verification', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-plugin-remove-race-'));
    const file = path.join(cwd, '.zaowu', 'plugins', 'example.json');
    try {
      await executeCli(['plugin', 'install', 'example', '--yes'], { cwd });
      const args = ['plugin', 'remove', 'example', '--json'];
      const preview = JSON.parse((await executeCli(args, { cwd })).stdout);
      const changed = '{"id":"example","source":"concurrent-change","installedAt":null}';
      const run = plugin.removePlugin;
      let calls = 0;
      vi.spyOn(plugin, 'removePlugin').mockImplementation(async (...parameters) => {
        if (++calls === 2) await writeFile(file, changed);
        return run(...parameters);
      });
      const result = await executeCli(
        [...args, '--yes', '--plan-fingerprint', preview.operationPlan.fingerprint],
        { cwd }
      );
      expect(result.exitCode).toBe(1);
      expect(JSON.parse(result.stderr).error.code).toBe('OPERATION_PLAN_MISMATCH');
      expect(await readFile(file, 'utf8')).toBe(changed);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it.each(['set', 'migrate'])(
    'rejects config %s input changed after plan verification',
    async (action) => {
      const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-config-race-'));
      const file = path.join(cwd, 'zw.yml');
      const originalContent = 'project:\n  name: old\n';
      const changedContent = 'project:\n  name: changed\n# preserve concurrent edit\n';
      try {
        await writeFile(file, originalContent);
        const args = [
          'config',
          action,
          ...(action === 'set' ? ['project.name', 'new'] : []),
          '--json',
        ];
        const preview = JSON.parse((await executeCli(args, { cwd })).stdout);
        let calls = 0;
        if (action === 'set') {
          const run = config.setResolvedConfigValue;
          vi.spyOn(config, 'setResolvedConfigValue').mockImplementation(async (...parameters) => {
            if (++calls === 2) await writeFile(file, changedContent);
            return run(...parameters);
          });
        } else {
          const run = config.migrateResolvedConfig;
          vi.spyOn(config, 'migrateResolvedConfig').mockImplementation(async (...parameters) => {
            if (++calls === 2) await writeFile(file, changedContent);
            return run(...parameters);
          });
        }
        const result = await executeCli(
          [...args, '--yes', '--plan-fingerprint', preview.operationPlan.fingerprint],
          { cwd }
        );
        expect(result.exitCode).toBe(1);
        expect(JSON.parse(result.stderr).error.code).toBe('OPERATION_PLAN_MISMATCH');
        expect(await readFile(file, 'utf8')).toBe(changedContent);
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    }
  );

  it('rejects migration confirmations after comment-only changes, including between reads', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-config-comment-race-'));
    const file = path.join(cwd, 'zw.yml');
    const content = 'project:\n  name: original\n';
    const changed = `${content}# new comment must survive\n`;
    const args = ['config', 'migrate', '--json'];
    try {
      await writeFile(file, content);
      const preview = JSON.parse((await executeCli(args, { cwd })).stdout);
      const confirmed = [...args, '--yes', '--plan-fingerprint', preview.operationPlan.fingerprint];
      await writeFile(file, changed);
      expect(JSON.parse((await executeCli(confirmed, { cwd })).stderr).error.code).toBe(
        'OPERATION_PLAN_MISMATCH'
      );
      await writeFile(file, content);
      const run = config.migrateResolvedConfig;
      let calls = 0;
      vi.spyOn(config, 'migrateResolvedConfig').mockImplementation(async (...parameters) => {
        if (++calls === 2) await writeFile(file, changed);
        return run(...parameters);
      });
      expect(JSON.parse((await executeCli(confirmed, { cwd })).stderr).error.code).toBe(
        'OPERATION_PLAN_MISMATCH'
      );
      expect(await readFile(file, 'utf8')).toBe(changed);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
