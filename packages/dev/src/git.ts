import { ZaoWuError } from '@zaowu-labs/core';
import type { DevCommandRunner } from './contracts.js';

/**
 * Shared `git` invocation wrapper for the dev domain. Maps any runner failure
 * to the stable GIT_COMMAND_FAILED error so callers never leak raw exceptions.
 */
export const runGit = (
  commandRunner: DevCommandRunner,
  args: readonly string[],
  cwd?: string
): string => {
  try {
    const safeArgs =
      args[0] === 'diff'
        ? [
            ...args,
            ...['--no-ext-diff', '--no-textconv', '--no-color'].filter(
              (flag) => !args.includes(flag)
            ),
          ]
        : args;
    return commandRunner('git', safeArgs, {
      cwd,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
      timeout: 10_000,
    });
  } catch {
    throw new ZaoWuError({
      code: 'GIT_COMMAND_FAILED',
      message: 'Git command failed.',
      why: `ZaoWu tried to run \`git ${args.join(' ')}\`, but Git returned an error.`,
      fix: 'Run this command inside a Git repository and make sure Git is available on PATH. For large changes, stage a smaller set of files.',
    });
  }
};
