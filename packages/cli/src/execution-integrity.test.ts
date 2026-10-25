import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as config from '@zaowu-labs/config';
import * as plugin from '@zaowu-labs/plugin';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeCli } from './run';

afterEach(() => {
  vi.restoreAllMocks();
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
