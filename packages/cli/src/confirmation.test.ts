import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatConfirmCommand } from './handler-utils';
import { COMMAND_TARGET_LIMITS } from './input-validation';
import { COMMAND_OPTIONS } from './option-registry';
import { getValue, hasFlag, parseArgs } from './args';
import { executeCli } from './run';

describe('copyable confirmation commands', () => {
  it.each([
    ['--file', '--help'],
    ['--model', '-h'],
  ])('preserves option-like values for %s', (option, value) => {
    const command = formatConfirmCommand(['zw', 'ai', 'ask', option, value, '--', 'Explain']);
    const parsed = parseArgs(command.split(' ').slice(1));
    expect(getValue(parsed, option)).toBe(value);
    expect(hasFlag(parsed, '--help')).toBe(false);
  });

  it('keeps option-like words literal after a separator', () => {
    const command = formatConfirmCommand(['zw', 'ai', 'ask', '--', '--file', '--help']);
    expect(parseArgs(command.split(' ').slice(1)).positionals).toEqual([
      'ai',
      'ask',
      '--file',
      '--help',
    ]);
  });
  it('declares an argument contract for every runnable option surface', () => {
    expect(Object.keys(COMMAND_TARGET_LIMITS).sort()).toEqual(Object.keys(COMMAND_OPTIONS).sort());
  });

  it.skipIf(process.platform === 'win32')('round-trips literal text through a POSIX shell', () => {
    const values = [
      "O'Reilly",
      'two words',
      '',
      '--not an option',
      '$literal',
      'a\\b',
      'line\nbreak',
    ];
    const command = formatConfirmCommand([
      process.execPath,
      '-e',
      'process.stdout.write(JSON.stringify(process.argv.slice(1)))',
      '--',
      ...values,
    ]);
    expect(JSON.parse(execFileSync('/bin/sh', ['-c', command], { encoding: 'utf8' }))).toEqual(
      values
    );
  });

  it('keeps option-like prompt text behind the literal separator', async () => {
    const preview = await executeCli(['ai', 'ask', '--provider', 'openai', '--', '--help']);
    expect(preview.exitCode).toBe(0);
    expect(preview.stdout).toMatch(/--plan-fingerprint [a-f0-9]{64} -- --help/);
  });

  it('offers an exact config confirmation and rejects a changed preview', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-confirm-'));
    try {
      await executeCli(['init', '--yes'], { cwd });
      const args = ['config', 'set', 'project.name', "O'Reilly demo"];
      const human = await executeCli(args, { cwd });
      const preview = JSON.parse((await executeCli([...args, '--json'], { cwd })).stdout);
      expect(human.stdout).toContain('To apply exactly this change, run:');
      expect(human.stdout).toContain(
        `--plan-fingerprint ${preview.operationPlan.fingerprint} -- project.name`
      );
      await writeFile(path.join(cwd, 'zw.yml'), 'version: 1\nproject:\n  name: changed\n');
      const confirmed = await executeCli(
        [...args, '--yes', '--plan-fingerprint', preview.operationPlan.fingerprint, '--json'],
        { cwd }
      );
      expect(JSON.parse(confirmed.stderr).error.code).toBe('OPERATION_PLAN_MISMATCH');
      expect(await readFile(path.join(cwd, 'zw.yml'), 'utf8')).toContain('name: changed');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('offers an exact migration confirmation only when a migration is needed', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-migrate-'));
    try {
      await writeFile(path.join(cwd, 'zw.yml'), 'project:\n  name: legacy\n');
      const result = await executeCli(['config', 'migrate'], { cwd });
      expect(result.stdout).toMatch(/zw config migrate --yes --plan-fingerprint [a-f0-9]{64}/);
      expect(await readFile(path.join(cwd, 'zw.yml'), 'utf8')).toBe('project:\n  name: legacy\n');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
