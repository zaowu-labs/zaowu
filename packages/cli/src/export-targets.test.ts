import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { executeCli } from './run';

describe.each([
  ['doc', 'convert', 'input.md', '# Note', 'DOCUMENT'],
  ['data', 'clean', 'input.csv', 'name,amount\nA,2', 'DATA'],
])('%s %s output destinations', (domain, action, input, content, prefix) => {
  let cwd: string;
  const run = (target: string, ...options: string[]) =>
    executeCli([domain, action, input, '--json', '--output', target, ...options], { cwd });

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-export-'));
    await writeFile(path.join(cwd, input), content);
  });
  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it('reports conflicting and missing destinations during preview', async () => {
    for (const [target, code] of [
      [input, 'OUTPUT_CONFLICT'],
      ['missing/output.txt', 'WRITE_FAILED'],
    ]) {
      const result = await run(target);
      expect(result.stdout).toBe('');
      expect(JSON.parse(result.stderr).error.code).toBe(`${prefix}_${code}`);
    }
    expect(await readFile(path.join(cwd, input), 'utf8')).toBe(content);
  });

  it.skipIf(process.platform === 'win32')(
    'binds the confirmed operation to its physical output directory',
    async () => {
      const original = path.join(cwd, 'original');
      const current = path.join(cwd, 'current');
      const alias = path.join(cwd, 'alias');
      await mkdir(original);
      await mkdir(current);
      await symlink(original, alias);
      const target = 'alias/result.txt';
      const preview = JSON.parse((await run(target)).stdout);
      const destination = path.join(await realpath(original), 'result.txt');
      expect(preview.outputPath).toBe(destination);
      expect(preview.operationPlan.writes).toEqual([destination]);
      await unlink(alias);
      await symlink(current, alias);
      const confirm = ['--yes', '--plan-fingerprint', preview.operationPlan.fingerprint];
      expect(JSON.parse((await run(target, ...confirm)).stderr).error.code).toBe(
        'OPERATION_PLAN_MISMATCH'
      );
      expect((await run(destination, ...confirm)).exitCode).toBe(0);
      expect(await readFile(destination, 'utf8')).toBe(preview.content);
      await expect(readFile(path.join(current, 'result.txt'))).rejects.toHaveProperty(
        'code',
        'ENOENT'
      );
    }
  );

  it.skipIf(process.platform === 'win32')(
    'reports a dangling output link as occupied',
    async () => {
      await symlink('missing', path.join(cwd, 'out'));
      const result = await run('out');
      expect(JSON.parse(result.stderr).error.code).toBe(`${prefix}_OUTPUT_CONFLICT`);
    }
  );
});
