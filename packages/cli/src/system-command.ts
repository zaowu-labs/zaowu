import { execFileSync } from 'node:child_process';
import { ZaoWuError } from '@zaowu-labs/core';
import type { CommandRunner } from './types.js';

const WINDOWS_COMMAND_PART_PATTERN = /^[a-zA-Z0-9._@:/\\=-]+$/;

/** Exported for tests: the Windows cmd.exe argument sanitizer. */
export const toWindowsCommand = (command: string, args: readonly string[]): string => {
  const parts = [command, ...args];

  for (const part of parts) {
    if (!WINDOWS_COMMAND_PART_PATTERN.test(part)) {
      throw new ZaoWuError({
        code: 'WORKFLOW_SHELL_DANGEROUS',
        message: 'Command part contains unsafe characters on Windows.',
        why: `The command part \`${part}\` does not match the allowed safe pattern.`,
        fix: 'Avoid special characters, shell control tokens, or spaces in arguments on Windows.',
      });
    }
  }

  return parts.join(' ');
};

export const runSystemCommand: CommandRunner = (command, args, options) => {
  const batchCommand =
    process.platform === 'win32' && /(?:^|[/\\])(?:corepack|pnpm|npm)(?:\.cmd)?$/i.test(command);
  const executable = batchCommand ? 'cmd.exe' : command;
  const commandArgs = batchCommand
    ? ['/d', '/s', '/c', toWindowsCommand(command, args)]
    : [...args];

  const output = execFileSync(executable, commandArgs, {
    cwd: options?.cwd,
    env: options?.env ? { ...process.env, ...options.env } : undefined,
    timeout: options?.timeout,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return output.includes('\0') ? output : output.trim();
};
