import { describe, expect, it } from 'vitest';
import { toWindowsCommand } from './system-command';

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
