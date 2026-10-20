import { createOperationPlan, hashOperationContent, ZaoWuError } from '@zaowu-labs/core';
import type { DevCommandRunner, DevStatusResult, DevSyncResult } from './contracts.js';
import { runGit } from './git.js';

export interface DevSyncOptions {
  cwd?: string;
  yes?: boolean;
  discardLocal?: boolean;
}

interface ResetTarget {
  commit: string;
  ahead: number;
  collisions: string[];
}

const readResetTarget = (
  runner: DevCommandRunner,
  branch: string,
  cwd?: string
): ResetTarget | undefined => {
  const reference = `refs/remotes/origin/${branch}`;
  let commit: string;
  try {
    commit = runGit(runner, ['rev-parse', '--verify', reference], cwd).trim();
  } catch {
    // A first sync can preview before origin has been fetched locally.
    return undefined;
  }

  const ahead = Number(runGit(runner, ['rev-list', '--count', `${reference}..HEAD`], cwd).trim());
  if (!Number.isSafeInteger(ahead) || ahead < 0) {
    throw new ZaoWuError({
      code: 'GIT_COMMAND_FAILED',
      message: 'Could not determine local commit discard risk.',
      why: 'Git did not return a valid commit count for the origin reset target.',
      fix: 'Check the origin branch history before retrying synchronization.',
    });
  }

  // Omitting --exclude-standard includes ignored paths too. Hard reset can
  // delete either kind when it needs to write a tracked path in their place.
  const untracked = runGit(
    runner,
    ['ls-files', '--full-name', '--others', '--directory', '-z', '--', ':/'],
    cwd
  )
    .split('\0')
    .filter(Boolean)
    .map((file) => file.replace(/\/$/, ''));
  const targetFiles = runGit(
    runner,
    ['ls-tree', '--full-tree', '-r', '--name-only', '-z', reference],
    cwd
  )
    .split('\0')
    .filter(Boolean);
  const collisions = untracked.filter((file) =>
    targetFiles.some(
      (target) => target === file || target.startsWith(`${file}/`) || file.startsWith(`${target}/`)
    )
  );

  return { commit, ahead, collisions };
};

const getDiscardRisks = (status: DevStatusResult, target: ResetTarget | undefined): string[] => [
  ...(status.staged.length > 0 ? [`${status.staged.length} staged file(s)`] : []),
  ...(status.unstaged.length > 0 ? [`${status.unstaged.length} unstaged file(s)`] : []),
  ...(target && target.ahead > 0
    ? [`${target.ahead} local commit(s) ahead of origin/${status.branch}`]
    : []),
  ...(target?.collisions.length
    ? [`${target.collisions.length} untracked or ignored path(s) obstructing the reset`]
    : []),
];

const requireDiscardConfirmation = (risks: string[], discardLocal?: boolean): void => {
  if (risks.length > 0 && !discardLocal) {
    throw new ZaoWuError({
      code: 'GIT_SYNC_DISCARD_CONFIRMATION_REQUIRED',
      message: 'Local Git changes require explicit discard confirmation.',
      why: `ZaoWu found local state that would be discarded by the hard reset: ${risks.join(', ')}.`,
      fix: 'Review a fresh preview. If discarding that local state is intended, re-run with `--yes --discard-local --plan-fingerprint <hash>`.',
    });
  }
};

const readTrackedDiff = (runner: DevCommandRunner, cwd?: string): string =>
  JSON.stringify([
    runGit(runner, ['diff', 'HEAD', '--binary', '--no-ext-diff', '--no-textconv'], cwd),
    runGit(runner, ['diff', '--cached', '--binary', '--no-ext-diff', '--no-textconv'], cwd),
  ]);

export const syncDevRepoInternal = (
  commandRunner: DevCommandRunner,
  options: DevSyncOptions,
  getStatus: (runner: DevCommandRunner, options: { cwd?: string }) => DevStatusResult
): DevSyncResult => {
  const status = getStatus(commandRunner, options);
  const branch = runGit(
    commandRunner,
    ['symbolic-ref', '--quiet', '--short', 'HEAD'],
    options.cwd
  ).trim();
  if (!branch || status.branch === 'unknown') {
    throw new ZaoWuError({
      code: 'GIT_COMMAND_FAILED',
      message: 'Could not determine current branch.',
      why: 'ZaoWu tried to read the current Git branch, but it is not a valid branch (possibly detached HEAD).',
      fix: 'Switch to a valid branch (e.g., `git checkout main`) and try again.',
    });
  }
  status.branch = branch;

  const previousCommit = runGit(commandRunner, ['rev-parse', 'HEAD'], options.cwd).trim();
  const trackedDiff = readTrackedDiff(commandRunner, options.cwd);
  const target = readResetTarget(commandRunner, branch, options.cwd);
  const discardRisks = getDiscardRisks(status, target);
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
      `git-target:${target?.commit ?? 'not-fetched'}`,
      `git-diff-sha256:${hashOperationContent(trackedDiff)}`,
      ...(target?.collisions ?? []).map((file) => `git-obstructing-path:${file}`),
      `git-status-sha256:${statusFingerprint}`,
      `git-discard-risk:${hasDiscardRisk ? 'yes' : 'no'}`,
    ],
    reads: [
      'current Git branch',
      'current HEAD commit',
      'current Git status',
      'tracked Git diff',
      'origin branch history',
      'untracked and ignored reset collisions',
    ],
    executes: ['git fetch origin', `git reset --hard refs/remotes/origin/${status.branch}`],
    network: ['git remote origin'],
    notes: [
      `This command will fetch remote updates and hard-reset your local \`${status.branch}\` branch to \`origin/${status.branch}\`.`,
      'WARNING: Any local uncommitted changes or diverged local commits will be discarded.',
      'Discard risks are checked against origin/<branch> again after fetching, including untracked and ignored paths that obstruct the reset.',
      ...(target
        ? []
        : [
            'The origin branch is not available locally; discard risk will be verified after fetching.',
          ]),
      ...(hasDiscardRisk
        ? [
            `Local discard risk: ${discardRisks.join(', ')}.`,
            'Confirmed sync requires both --yes and --discard-local while local discard risk is present.',
          ]
        : ['No tracked local changes or local ahead commits detected.']),
      ...(status.untracked.length > 0
        ? [
            `Untracked files detected: ${status.untracked.length}; obstructing paths require --discard-local because git reset --hard can delete them.`,
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
        ? `Preview: ZaoWu will run \`git fetch origin\` and \`git reset --hard refs/remotes/origin/${status.branch}\`. Re-run with --yes --discard-local only if the local discard risk is acceptable.`
        : `Preview: ZaoWu will run \`git fetch origin\` and \`git reset --hard refs/remotes/origin/${status.branch}\`.`,
      operationPlan,
    };
  }
  requireDiscardConfirmation(discardRisks, options.discardLocal);

  runGit(commandRunner, ['fetch', 'origin'], options.cwd);
  const currentBranch = runGit(
    commandRunner,
    ['symbolic-ref', '--quiet', '--short', 'HEAD'],
    options.cwd
  ).trim();
  const currentHead = runGit(commandRunner, ['rev-parse', 'HEAD'], options.cwd).trim();
  const currentStatus = getStatus(commandRunner, options);
  if (
    currentBranch !== branch ||
    currentHead !== previousCommit ||
    readTrackedDiff(commandRunner, options.cwd) !== trackedDiff ||
    JSON.stringify([currentStatus.staged, currentStatus.unstaged, currentStatus.untracked]) !==
      JSON.stringify([status.staged, status.unstaged, status.untracked])
  ) {
    throw new ZaoWuError({
      code: 'OPERATION_PLAN_MISMATCH',
      message: 'Local Git state changed during synchronization.',
      why: 'The branch, HEAD, or working tree changed while fetching remote updates.',
      fix: 'Review a fresh `zw dev sync` preview before retrying.',
    });
  }
  const fetchedTarget = readResetTarget(commandRunner, branch, options.cwd);
  if (!fetchedTarget) {
    throw new ZaoWuError({
      code: 'GIT_COMMAND_FAILED',
      message: 'Origin branch was not found after fetching.',
      why: `ZaoWu could not resolve refs/remotes/origin/${branch}.`,
      fix: 'Check that the branch exists on origin and that the fetch refspec includes it.',
    });
  }
  requireDiscardConfirmation(getDiscardRisks(currentStatus, fetchedTarget), options.discardLocal);
  try {
    runGit(commandRunner, ['reset', '--hard', `refs/remotes/origin/${status.branch}`], options.cwd);
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
