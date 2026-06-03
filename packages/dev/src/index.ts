import type { DomainDefinition } from '@zaowu/core';
import { ZaoWuError } from '@zaowu/core';

export type DevCommandRunner = (
  command: string,
  args: readonly string[],
  options?: { cwd?: string }
) => string;

export interface GitChangeSummary {
  files: string[];
  additions: number;
  deletions: number;
}

export interface DevCommitResult {
  status: 'ok';
  source: 'staged';
  summary: GitChangeSummary;
  message: string;
}

export interface DevReviewFinding {
  severity: 'info' | 'warning';
  title: string;
  detail: string;
}

export interface DevReviewResult {
  status: 'ok';
  source: 'staged' | 'working-tree';
  summary: GitChangeSummary;
  findings: DevReviewFinding[];
}

export const DEV_DOMAIN: DomainDefinition = {
  name: 'dev',
  summary: 'Developer workflows for review, commit, and repository assistance',
  commands: [
    {
      name: 'commit',
      summary: 'Preview and prepare a Git commit message',
      status: 'available',
      sensitive: true,
    },
    {
      name: 'review',
      summary: 'Review a repository change without modifying files',
      status: 'available',
    },
  ],
};

const runGit = (commandRunner: DevCommandRunner, args: readonly string[], cwd?: string): string => {
  try {
    return commandRunner('git', args, { cwd });
  } catch {
    throw new ZaoWuError({
      code: 'GIT_COMMAND_FAILED',
      message: 'Git command failed.',
      why: `ZaoWu tried to run \`git ${args.join(' ')}\`, but Git returned an error.`,
      fix: 'Run this command inside a Git repository and make sure Git is available on PATH.',
    });
  }
};

const parseNumstat = (output: string, files: readonly string[]): GitChangeSummary => {
  let additions = 0;
  let deletions = 0;

  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const [added, deleted] = line.split(/\s+/);
    additions += Number.parseInt(added, 10) || 0;
    deletions += Number.parseInt(deleted, 10) || 0;
  }

  return {
    files: [...files],
    additions,
    deletions,
  };
};

const getChangedFiles = (
  commandRunner: DevCommandRunner,
  args: readonly string[],
  cwd?: string
): string[] =>
  runGit(commandRunner, args, cwd)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const getSummary = (
  commandRunner: DevCommandRunner,
  nameArgs: readonly string[],
  numstatArgs: readonly string[],
  cwd?: string
): GitChangeSummary => {
  const files = getChangedFiles(commandRunner, nameArgs, cwd);

  if (files.length === 0) {
    return {
      files: [],
      additions: 0,
      deletions: 0,
    };
  }

  return parseNumstat(runGit(commandRunner, numstatArgs, cwd), files);
};

const inferCommitType = (files: readonly string[]): string => {
  if (files.every((file) => file.startsWith('docs/') || file.endsWith('.md'))) {
    return 'docs';
  }

  if (files.some((file) => file.includes('.test.') || file.includes('.spec.'))) {
    return 'test';
  }

  if (files.some((file) => file.endsWith('package.json') || file.endsWith('pnpm-lock.yaml'))) {
    return 'chore';
  }

  if (files.some((file) => file.startsWith('packages/') && file.includes('/src/'))) {
    return 'feat';
  }

  return 'chore';
};

const inferScope = (files: readonly string[]): string => {
  const packageMatch = files
    .map((file) => /^packages\/([^/]+)/.exec(file)?.[1])
    .find((scope): scope is string => Boolean(scope));

  if (packageMatch) {
    return packageMatch;
  }

  if (files.every((file) => file.startsWith('docs/') || file.endsWith('.md'))) {
    return 'docs';
  }

  return 'project';
};

export const previewDevCommit = (
  commandRunner: DevCommandRunner,
  options: { cwd?: string } = {}
): DevCommitResult => {
  const summary = getSummary(
    commandRunner,
    ['diff', '--cached', '--name-only'],
    ['diff', '--cached', '--numstat'],
    options.cwd
  );

  if (summary.files.length === 0) {
    throw new ZaoWuError({
      code: 'NO_STAGED_CHANGES',
      message: 'No staged changes found.',
      why: '`zw dev commit` reads staged Git changes by default and does not modify Git state.',
      fix: 'Run `git add <files>` and try again, or use `zw dev review` for unstaged changes.',
    });
  }

  const type = inferCommitType(summary.files);
  const scope = inferScope(summary.files);

  return {
    status: 'ok',
    source: 'staged',
    summary,
    message: `${type}: update ${scope}`,
  };
};

export const reviewDevChanges = (
  commandRunner: DevCommandRunner,
  options: { cwd?: string } = {}
): DevReviewResult => {
  let source: DevReviewResult['source'] = 'staged';
  let summary = getSummary(
    commandRunner,
    ['diff', '--cached', '--name-only'],
    ['diff', '--cached', '--numstat'],
    options.cwd
  );

  if (summary.files.length === 0) {
    source = 'working-tree';
    summary = getSummary(
      commandRunner,
      ['diff', '--name-only'],
      ['diff', '--numstat'],
      options.cwd
    );
  }

  if (summary.files.length === 0) {
    throw new ZaoWuError({
      code: 'NO_CHANGES_TO_REVIEW',
      message: 'No changes found to review.',
      why: '`zw dev review` reads staged changes first, then unstaged working-tree changes.',
      fix: 'Change files or stage changes before running `zw dev review`.',
    });
  }

  const findings: DevReviewFinding[] = [
    {
      severity: 'info',
      title: 'Change size',
      detail: `${summary.files.length} file(s), +${summary.additions}/-${summary.deletions}.`,
    },
  ];

  if (
    summary.files.some((file) => file.startsWith('packages/') && file.includes('/src/')) &&
    !summary.files.some((file) => file.includes('.test.') || file.includes('.spec.'))
  ) {
    findings.push({
      severity: 'warning',
      title: 'Tests not detected',
      detail: 'Source files changed, but no test file changed in this diff.',
    });
  }

  if (
    summary.files.some((file) => file.endsWith('package.json') || file.endsWith('pnpm-lock.yaml'))
  ) {
    findings.push({
      severity: 'warning',
      title: 'Dependency metadata changed',
      detail: 'Run a frozen install, build, and tests before merging.',
    });
  }

  return {
    status: 'ok',
    source,
    summary,
    findings,
  };
};
