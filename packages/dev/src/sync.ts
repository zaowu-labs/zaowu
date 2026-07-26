import { createOperationPlan, hashOperationContent, ZaoWuError } from '@zaowu-labs/core';
import type { DevCommandRunner, DevStatusResult, DevSyncResult } from './contracts.js';
import { runGit } from './git.js';

export interface DevSyncOptions {
  cwd?: string;
  yes?: boolean;
  discardLocal?: boolean;
}

const getDiscardRisks = (status: DevStatusResult): string[] => [
  ...(status.staged.length > 0 ? [`${status.staged.length} staged file(s)`] : []),
  ...(status.unstaged.length > 0 ? [`${status.unstaged.length} unstaged file(s)`] : []),
  ...(status.ahead > 0 ? [`${status.ahead} local commit(s) ahead of origin/${status.branch}`] : []),
];

export const syncDevRepoInternal = (
  commandRunner: DevCommandRunner,
  options: DevSyncOptions,
  getStatus: (runner: DevCommandRunner, options: { cwd?: string }) => DevStatusResult
): DevSyncResult => {
  const status = getStatus(commandRunner, options);
  if (status.branch === 'unknown') {
    throw new ZaoWuError({
      code: 'GIT_COMMAND_FAILED',
      message: 'Could not determine current branch.',
      why: 'ZaoWu tried to read the current Git branch, but it is not a valid branch (possibly detached HEAD).',
      fix: 'Switch to a valid branch (e.g., `git checkout main`) and try again.',
    });
  }

  const previousCommit = runGit(commandRunner, ['rev-parse', 'HEAD'], options.cwd).trim();
  const discardRisks = getDiscardRisks(status);
  const hasDiscardRisk = discardRisks.length > 0;
  const statusFingerprint = hashOperationContent(
    JSON.stringify({
      branch: status.branch,
      head: previousCommit,
      staged: status.staged,
      unstaged: status.unstaged,
      untracked: status.untracked,
      ahead: status.ahead,
    })
  );
  const operationPlan = createOperationPlan({
    risk: 'high',
    confirmationRequired: !options.yes,
    subjects: [
      `git:${status.branch}`,
      `git-head:${previousCommit}`,
      `git-status-sha256:${statusFingerprint}`,
      `git-discard-risk:${hasDiscardRisk ? 'yes' : 'no'}`,
    ],
    reads: ['current Git branch', 'current HEAD commit', 'current Git status'],
    executes: ['git fetch origin', `git reset --hard origin/${status.branch}`],
    network: ['git remote origin'],
    notes: [
      `This command will fetch remote updates and hard-reset your local \`${status.branch}\` branch to \`origin/${status.branch}\`.`,
      'WARNING: Any local uncommitted changes or diverged local commits will be discarded.',
      ...(hasDiscardRisk
        ? [
            `Local discard risk: ${discardRisks.join(', ')}.`,
            'Confirmed sync requires both --yes and --discard-local while local discard risk is present.',
          ]
        : ['No tracked local changes or local ahead commits detected.']),
      ...(status.untracked.length > 0
        ? [
            `Untracked files detected: ${status.untracked.length}; git reset --hard will not delete them.`,
          ]
        : []),
    ],
  });

  if (!options.yes) {
    return {
      schemaVersion: 1,
      status: 'preview',
      branch: status.branch,
      previousCommit,
      currentCommit: previousCommit,
      output: hasDiscardRisk
        ? `Preview: ZaoWu will run \`git fetch origin\` and \`git reset --hard origin/${status.branch}\`. Re-run with --yes --discard-local only if the local discard risk is acceptable.`
        : `Preview: ZaoWu will run \`git fetch origin\` and \`git reset --hard origin/${status.branch}\`.`,
      operationPlan,
    };
  }
  if (hasDiscardRisk && !options.discardLocal) {
    throw new ZaoWuError({
      code: 'GIT_SYNC_DISCARD_CONFIRMATION_REQUIRED',
      message: 'Local Git changes require explicit discard confirmation.',
      why: `ZaoWu found local state that would be discarded by the hard reset: ${discardRisks.join(', ')}.`,
      fix: 'Review the preview output. If discarding that local state is intended, re-run with `--yes --discard-local --plan-fingerprint <hash>`.',
    });
  }

  runGit(commandRunner, ['fetch', 'origin'], options.cwd);
  try {
    runGit(commandRunner, ['reset', '--hard', `origin/${status.branch}`], options.cwd);
  } catch {
    throw new ZaoWuError({
      code: 'GIT_COMMAND_FAILED',
      message: 'Git reset failed.',
      why: `ZaoWu ran \`git reset --hard origin/${status.branch}\`, but origin/${status.branch} does not exist or fetch failed.`,
      fix: `Verify the remote branch origin/${status.branch} exists and you have internet access.`,
    });
  }
  const currentCommit = runGit(commandRunner, ['rev-parse', 'HEAD'], options.cwd).trim();
  return {
    schemaVersion: 1,
    status: 'ok',
    branch: status.branch,
    previousCommit,
    currentCommit,
    output: `Successfully synchronized branch \`${status.branch}\` to \`origin/${status.branch}\`.`,
    operationPlan,
  };
};
