import { describe, expect, it } from 'vitest';
import { runSystemCommand, toWindowsCommand } from './system-command';

describe('toWindowsCommand', () => {
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
