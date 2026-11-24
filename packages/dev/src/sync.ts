import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  opendirSync,
  openSync,
  readSync,
  readdirSync,
  readlinkSync,
} from 'node:fs';
import path from 'node:path';
import {
  assertOperationPlanFingerprint,
  createOperationPlan,
  hashOperationContent,
  ZaoWuError,
} from '@zaowu-labs/core';
import type { DevCommandRunner, DevStatusResult, DevSyncResult } from './contracts.js';
import { runGit } from './git.js';

export interface DevSyncOptions {
  cwd?: string;
  yes?: boolean;
  discardLocal?: boolean;
  expectedPlanFingerprint?: string;
}

interface ResetTarget {
  commit: string;
  ahead: number;
  collisions: Map<string, string>;
}

const maxCollisionBytes = 64n * 1024n * 1024n;
const maxCollisionEntries = 4096;
interface CollisionBudget {
  bytes: bigint;
  entries: number;
}
const collisionLimitError = () =>
  new ZaoWuError({
    code: 'GIT_COMMAND_FAILED',
    message: 'Reset obstruction inspection limit exceeded.',
    why: 'One inspection can verify up to 64 MiB of file contents and 4096 filesystem entries across all obstructions.',
    fix: 'Back up and move the obstructing paths outside the worktree, then preview the sync again.',
  });

const readBranch = (runner: DevCommandRunner, cwd?: string): string => {
  const ref = runGit(runner, ['symbolic-ref', '--quiet', 'HEAD'], cwd).trim();
  const prefix = 'refs/heads/';
  if (!ref.startsWith(prefix) || ref.length === prefix.length) {
    throw new ZaoWuError({
      code: 'GIT_COMMAND_FAILED',
      message: 'Could not determine current branch.',
      why: 'Git did not report a local branch reference for HEAD.',
      fix: 'Switch to a local branch and try again.',
    });
  }
  return ref.slice(prefix.length);
};

// Include directory entries and link destinations without following links or
// reading special files. Hash file contents in chunks and keep only digests.
const hashCollisionPath = (file: Buffer, chunk: Buffer, budget: CollisionBudget): string => {
  if (budget.entries === 0) throw collisionLimitError();
  budget.entries--;
  const stat = lstatSync(file, { bigint: true });
  const hash = createHash('sha256').update(String(stat.mode)).update('\0');
  if (stat.isSymbolicLink()) {
    hash.update(readlinkSync(file, { encoding: 'buffer' }));
  } else if (stat.isDirectory()) {
    const names: Buffer[] = [];
    // Read incrementally and preserve raw filename bytes via latin1.
    const dir = opendirSync(file, { encoding: 'latin1' });
    try {
      for (let entry = dir.readSync(); entry; entry = dir.readSync()) {
        if (names.length >= budget.entries) throw collisionLimitError();
        names.push(Buffer.from(entry.name, 'latin1'));
      }
    } finally {
      dir.closeSync();
    }
    for (const name of names.sort(Buffer.compare)) {
      const child = Buffer.concat([file, Buffer.from(path.sep), name]);
      hash
        .update(name)
        .update('\0')
        .update(hashCollisionPath(child, chunk, budget));
    }
  } else if (stat.isFile()) {
    if (stat.size > budget.bytes) throw collisionLimitError();
    budget.bytes -= stat.size;
    const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const opened = fstatSync(fd, { bigint: true });
      if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino) {
        throw new Error('File changed while opening it.');
      }
      let total = 0n;
      while (total < stat.size) {
        const count = readSync(
          fd,
          chunk,
          0,
          Math.min(Number(stat.size - total), chunk.length),
          null
        );
        if (count === 0) throw new Error('File changed while reading it.');
        hash.update(chunk.subarray(0, count));
        total += BigInt(count);
      }
    } finally {
      closeSync(fd);
    }
  } else {
    throw new Error('Unsupported filesystem entry.');
  }
  const after = lstatSync(file, { bigint: true });
  if (after.dev !== stat.dev || after.ino !== stat.ino || after.ctimeNs !== stat.ctimeNs) {
    throw new Error('Path changed during inspection.');
  }
  return hash.digest('hex');
};

// Folding locates candidate spellings. Confirm each alias against the existing
// worktree entry so a Git setting cannot override volume behavior.
const foldedPath = (file: string): string => file.normalize('NFD').toUpperCase().toLowerCase();
const existingAlias = (root: string, entry: string, candidate: string): boolean => {
  const actual = path.join(root, entry);
  const alternate = path.join(root, candidate);
  try {
    const a = lstatSync(actual, { bigint: true });
    const b = lstatSync(alternate, { bigint: true, throwIfNoEntry: false });
    if (!b || a.dev !== b.dev || a.ino !== b.ino) return false;
    if (a.isDirectory() || a.nlink === 1n) return true;
    // On a case-sensitive volume, distinct hard links can have the same inode.
    const parent = lstatSync(path.dirname(actual), { bigint: true });
    const otherParent = lstatSync(path.dirname(alternate), { bigint: true });
    if (parent.dev !== otherParent.dev || parent.ino !== otherParent.ino) return false;
    if (path.basename(actual) === path.basename(alternate)) return true;
    const names = readdirSync(path.dirname(actual));
    return !(names.includes(path.basename(actual)) && names.includes(path.basename(alternate)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOTDIR') return false;
    throw new ZaoWuError({
      code: 'GIT_COMMAND_FAILED',
      message: 'Could not verify whether two worktree paths refer to the same entry.',
      why: `The filesystem did not provide an identity for ${JSON.stringify(entry)} or ${JSON.stringify(candidate)}.`,
      fix: 'Check the path permissions and run a fresh sync preview.',
    });
  }
};

const indexSpellings = (paths: Set<string>) => {
  const spellings = new Map<string, string[]>();
  for (const file of paths) {
    const key = foldedPath(file);
    const existing = spellings.get(key);
    if (existing) existing.push(file);
    else spellings.set(key, [file]);
  }
  return spellings;
};

const inspectNewTargetPaths = (root: string, paths: string[]): void => {
  const knownDirectories = new Set<string>();
  for (const file of paths) {
    let current = root;
    for (const name of file.split('/')) {
      current = path.join(current, name);
      if (knownDirectories.has(current)) continue;
      try {
        const entry = lstatSync(current, { throwIfNoEntry: false });
        if (!entry || entry.isFile() || entry.isSymbolicLink()) break;
        if (!entry.isDirectory()) throw new Error('Special filesystem entry.');
        knownDirectories.add(current);
      } catch {
        throw new ZaoWuError({
          code: 'GIT_COMMAND_FAILED',
          message: 'Could not verify a path that the reset would discard.',
          why: `The reset target encounters an unreadable or special filesystem entry at ${JSON.stringify(path.relative(root, current))}.`,
          fix: 'Back up or move that entry before requesting another sync preview.',
        });
      }
    }
  }
};

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

  const count = runGit(runner, ['rev-list', '--count', `${commit}..HEAD`], cwd).trim();
  const ahead = Number(count);
  if (!/^\d+$/.test(count) || !Number.isSafeInteger(ahead)) {
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
    .filter(Boolean);
  const collisions = new Map<string, string>();
  // Git excludes FIFOs and sockets from --others. Check the actual components
  // of newly written target paths without following links or opening devices.
  const newTargetPaths = runGit(
    runner,
    [
      'diff-index',
      '--cached',
      '--name-only',
      '--no-renames',
      '--diff-filter=DT',
      '-z',
      commit,
      '--',
      ':/',
    ],
    cwd
  )
    .split('\0')
    .filter(Boolean);
  if (untracked.length === 0 && newTargetPaths.length === 0) return { commit, ahead, collisions };
  const root = runGit(runner, ['rev-parse', '--show-toplevel'], cwd).replace(/\n$/, '');
  inspectNewTargetPaths(root, newTargetPaths);
  if (untracked.length === 0) return { commit, ahead, collisions };

  const targetFiles = runGit(
    runner,
    ['ls-tree', '--full-tree', '-r', '--name-only', '-z', commit],
    cwd
  )
    .split('\0')
    .filter(Boolean);
  const files = new Set(targetFiles);
  const directories = new Set<string>();
  for (const file of files) {
    for (let i = file.indexOf('/'); i !== -1; i = file.indexOf('/', i + 1)) {
      directories.add(file.slice(0, i));
    }
  }
  const fileSpellings = indexSpellings(files);
  const directorySpellings = indexSpellings(directories);
  const matches = (file: string, spellings: Map<string, string[]>): boolean =>
    (spellings.get(foldedPath(file)) ?? []).some(
      (candidate) => file === candidate || existingAlias(root, file, candidate)
    );
  const isDirectory = (file: string) => matches(file, directorySpellings);
  const isFile = (file: string) => matches(file, fileSpellings);
  const overlaps = (file: string): boolean => {
    if (isDirectory(file) || isFile(file)) return true;
    for (let i = file.indexOf('/'); i !== -1; i = file.indexOf('/', i + 1)) {
      if (isFile(file.slice(0, i))) return true;
    }
    return false;
  };
  const paths = new Set<string>();
  for (const entry of untracked) {
    const file = entry.replace(/\/$/, '');
    if (!overlaps(file)) continue;
    if (entry.endsWith('/') && isDirectory(file)) {
      // Git collapses untracked directories. Expand only shared directories
      // so unrelated siblings can survive a reset without discard permission.
      const children = runGit(
        runner,
        ['ls-files', '--full-name', '--others', '-z', '--', `:(top,literal)${file}`],
        cwd
      );
      for (const child of children.split('\0').filter(Boolean)) {
        const childPath = child.replace(/\/$/, '');
        if (overlaps(childPath)) paths.add(childPath);
      }
    } else {
      paths.add(file);
    }
  }

  if (paths.size > 0) {
    const chunk = Buffer.allocUnsafe(64 * 1024);
    const budget: CollisionBudget = { bytes: maxCollisionBytes, entries: maxCollisionEntries };
    for (const file of paths) {
      try {
        collisions.set(file, hashCollisionPath(Buffer.from(path.join(root, file)), chunk, budget));
      } catch (error) {
        if (error instanceof ZaoWuError) throw error;
        throw new ZaoWuError({
          code: 'GIT_COMMAND_FAILED',
          message: 'Could not verify a path that the reset would discard.',
          why: `The obstructing path ${JSON.stringify(file)} could not be read consistently as a regular file, directory, or symbolic link.`,
          fix: 'Back up or move the obstructing path, or check its permissions and retry the preview.',
        });
      }
    }
  }
  return { commit, ahead, collisions };
};

const getDiscardRisks = (status: DevStatusResult, target: ResetTarget | undefined): string[] => [
  ...(status.staged.length > 0 ? [`${status.staged.length} staged file(s)`] : []),
  ...(status.unstaged.length > 0 ? [`${status.unstaged.length} unstaged file(s)`] : []),
  ...(target && target.ahead > 0
    ? [`${target.ahead} local commit(s) ahead of origin/${status.branch}`]
    : []),
  ...(target?.collisions.size
    ? [`${target.collisions.size} untracked or ignored path(s) obstructing the reset`]
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
): Required<DevSyncResult> => {
  const status = getStatus(commandRunner, options);
  const branch = readBranch(commandRunner, options.cwd);
  status.branch = branch;

  const fetchArgs = ['fetch', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`];
  const fetchCommand = `git ${fetchArgs.join(' ')}`;
  const resetCommand = 'git reset --hard <verified-origin-commit>';
  const gitDirectory = runGit(
    commandRunner,
    ['rev-parse', '--absolute-git-dir'],
    options.cwd
  ).trim();
  let originUrl: string | null;
  try {
    originUrl = runGit(commandRunner, ['remote', 'get-url', 'origin'], options.cwd).trim();
  } catch {
    // A local repository without an origin can still describe the sync preview.
    originUrl = null;
  }
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
      `git-repository-sha256:${hashOperationContent(JSON.stringify([gitDirectory, originUrl]))}`,
      `git-head:${previousCommit}`,
      `git-target:${target?.commit ?? 'not-fetched'}`,
      `git-diff-sha256:${hashOperationContent(trackedDiff)}`,
      ...Array.from(target?.collisions.keys() ?? [], (file) => `git-obstructing-path:${file}`),
      ...(target?.collisions.size
        ? [
            `git-obstructing-content-sha256:${hashOperationContent(JSON.stringify([...target.collisions]))}`,
          ]
        : []),
      `git-status-sha256:${statusFingerprint}`,
      `git-discard-risk:${hasDiscardRisk ? 'yes' : 'no'}`,
    ],
    reads: [
      'current Git branch',
      'Git worktree identity and origin fetch URL',
      'current HEAD commit',
      'current Git status',
      'tracked Git diff',
      'origin branch history',
      'untracked and ignored reset collisions',
    ],
    executes: [fetchCommand, resetCommand],
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
        ? `Preview: ZaoWu will run \`${fetchCommand}\` and \`${resetCommand}\`. Re-run with --yes --discard-local only if the local discard risk is acceptable.`
        : `Preview: ZaoWu will run \`${fetchCommand}\` and \`${resetCommand}\`.`,
      operationPlan,
    };
  }
  assertOperationPlanFingerprint(options.expectedPlanFingerprint, operationPlan, true, ZaoWuError);
  requireDiscardConfirmation(discardRisks, options.discardLocal);

  try {
    runGit(commandRunner, fetchArgs, options.cwd);
  } catch {
    throw new ZaoWuError({
      code: 'GIT_COMMAND_FAILED',
      message: 'Could not fetch the branch from origin.',
      why: `Git could not fetch refs/heads/${branch} from the configured origin.`,
      fix: 'Check the remote branch name, repository access, and network connection before retrying.',
    });
  }
  const currentBranch = readBranch(commandRunner, options.cwd);
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
  const changedCollision = Array.from(fetchedTarget.collisions).some(([file, digest]) => {
    const reviewed = target?.collisions.get(file);
    return reviewed ? digest !== reviewed : Boolean(options.expectedPlanFingerprint);
  });
  if (
    changedCollision ||
    (options.expectedPlanFingerprint &&
      target?.commit !== fetchedTarget.commit &&
      fetchedTarget.ahead > 0)
  ) {
    throw new ZaoWuError({
      code: 'OPERATION_PLAN_MISMATCH',
      message: 'Discard risk changed after fetching.',
      why: 'The fetched branch would discard local commits, paths, or file contents outside the reviewed plan.',
      fix: 'Preview the updated origin branch with `zw dev sync` and review its discard risks.',
    });
  }
  try {
    runGit(commandRunner, ['reset', '--hard', fetchedTarget.commit], options.cwd);
  } catch {
    throw new ZaoWuError({
      code: 'GIT_COMMAND_FAILED',
      message: 'Git reset failed.',
      why: `Git could not reset the working tree to the verified commit ${fetchedTarget.commit}.`,
      fix: 'Inspect git status and working tree permissions before retrying.',
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
