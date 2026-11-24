import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runSystemCommand, toWindowsCommand } from './system-command';

describe('runSystemCommand', () => {
  it('preserves trailing spaces and the line ending in a real Git patch', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-git-output-'));
    const git = (...args: string[]) => runSystemCommand('git', args, { cwd });
    try {
      git('init', '--quiet');
      await writeFile(path.join(cwd, 'note.txt'), 'Added line  \n');
      git('add', '--', 'note.txt');
      const patch = git('diff', '--cached', '--no-color', '--no-ext-diff', '--no-textconv');
      expect(patch.endsWith('+Added line  \n')).toBe(true);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('preserves NUL-framed output including leading filename whitespace', () => {
    expect(
      runSystemCommand(process.execPath, ['-p', 'String.fromCharCode(32,110,97,109,101,0)'])
    ).toBe(' name\0\n');
  });
  it('passes scoped environment overrides to a diagnostic subprocess', () => {
    expect(
      runSystemCommand(process.execPath, ['-p', 'process.env.ZAOWU_DIAGNOSTIC_TEST'], {
        env: { ZAOWU_DIAGNOSTIC_TEST: 'diagnostic-only' },
        timeout: 5000,
      })
    ).toBe('diagnostic-only');
    expect(process.env.ZAOWU_DIAGNOSTIC_TEST).toBeUndefined();
  });
});

describe('toWindowsCommand', () => {
  it('joins safe command parts into a single cmd.exe command string', () => {
    expect(toWindowsCommand('git', ['status', '--short', '--branch'])).toBe(
      'git status --short --branch'
    );
    expect(toWindowsCommand('corepack', ['pnpm', '--version'])).toBe('corepack pnpm --version');
    expect(toWindowsCommand('node', ['C:\\tools\\script.js', '--flag=value'])).toBe(
      'node C:\\tools\\script.js --flag=value'
    );
  });

  it('rejects shell control tokens and spaces before they reach cmd.exe', () => {
    const dangerousParts = [
      ['git', ['status', '&& del C:\\Windows']],
      ['git', ['status', '| whoami']],
      ['git', ['status;whoami']],
      ['echo', ['hello world']],
      ['git', ['log', '--format=%H > out.txt']],
      ['cmd', ['/c', 'echo %PATH%']],
      ['git', ['"quoted"']],
      ['git', ['$(whoami)']],
      ['git', ['`whoami`']],
    ] as const;

    for (const [command, args] of dangerousParts) {
      expect(() => toWindowsCommand(command, [...args])).toThrowError(
        /unsafe characters on Windows/
      );
    }
  });
});
