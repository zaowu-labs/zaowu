import { createCapabilityLedger, type DomainDefinition } from '@zaowu/core';
import { ZaoWuError } from '@zaowu/core';

export type DevCommandRunner = (
  command: string,
  args: readonly string[],
  options?: { cwd?: string }
) => string;

export type DevChangeCategory =
  | 'source'
  | 'test'
  | 'docs'
  | 'dependency'
  | 'workflow'
  | 'config'
  | 'other';

export type DevChangeCategories = Record<DevChangeCategory, number>;

export interface GitChangeSummary {
  files: string[];
  untrackedFiles: string[];
  additions: number;
  deletions: number;
  categories: DevChangeCategories;
}

export interface DevCommitResult {
  schemaVersion: 1;
  status: 'ok';
  source: 'staged';
  summary: GitChangeSummary;
  message: string;
  recommendedChecks: string[];
}

export interface DevStatusResult {
  schemaVersion: 1;
  status: 'ok';
  branch: string;
  clean: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

export interface DevReviewFinding {
  severity: 'info' | 'warning';
  priority: 'low' | 'medium' | 'high';
  category:
    | 'summary'
    | 'test'
    | 'dependency'
    | 'quality'
    | 'execution'
    | 'filesystem'
    | 'network'
    | 'security'
    | 'git';
  title: string;
  detail: string;
  filePath?: string;
  hunkHeader?: string;
}

export interface DevDiffHunk {
  filePath: string;
  header: string;
  addedLines: number;
  removedLines: number;
}

export interface DevReviewResult {
  schemaVersion: 1;
  status: 'ok';
  source: 'staged' | 'working-tree';
  summary: GitChangeSummary;
  diffHunks: DevDiffHunk[];
  findings: DevReviewFinding[];
  recommendedChecks: string[];
}

export type DevReviewMode = 'auto' | 'staged' | 'worktree';

const DEV_REVIEW_SCHEMA_VERSION = 1;
const DEV_COMMIT_SCHEMA_VERSION = 1;
const DEV_STATUS_SCHEMA_VERSION = 1;

export const DEV_DOMAIN: DomainDefinition = {
  name: 'dev',
  summary: 'Developer workflows for review, commit, and repository assistance',
  capabilities: createCapabilityLedger({
    modifiesGit: true,
  }),
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
    {
      name: 'status',
      summary: 'Show Git working tree status for the current project',
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

const createEmptyCategories = (): DevChangeCategories => ({
  source: 0,
  test: 0,
  docs: 0,
  dependency: 0,
  workflow: 0,
  config: 0,
  other: 0,
});

const getFileCategory = (filePath: string): DevChangeCategory => {
  const file = filePath.replaceAll('\\', '/');

  if (file.includes('.test.') || file.includes('.spec.')) {
    return 'test';
  }

  if (file === 'package.json' || file === 'pnpm-lock.yaml' || file.endsWith('/package.json')) {
    return 'dependency';
  }

  if (file.startsWith('.github/workflows/') || file.startsWith('scripts/')) {
    return 'workflow';
  }

  if (file.startsWith('docs/') || file.endsWith('.md')) {
    return 'docs';
  }

  if (file.startsWith('packages/') && (file.includes('/src/') || file.endsWith('/src/index.ts'))) {
    return 'source';
  }

  if (
    file === 'tsconfig.json' ||
    file === 'eslint.config.js' ||
    file === '.prettierrc' ||
    file.startsWith('.changeset/')
  ) {
    return 'config';
  }

  return 'other';
};

const summarizeCategories = (files: readonly string[]): DevChangeCategories => {
  const categories = createEmptyCategories();

  for (const file of files) {
    categories[getFileCategory(file)] += 1;
  }

  return categories;
};

const parseNumstat = (
  output: string,
  files: readonly string[],
  untrackedFiles: readonly string[] = []
): GitChangeSummary => {
  let additions = 0;
  let deletions = 0;
  const allFiles = [...new Set([...files, ...untrackedFiles])];

  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const [added, deleted] = line.split(/\s+/);
    additions += Number.parseInt(added, 10) || 0;
    deletions += Number.parseInt(deleted, 10) || 0;
  }

  return {
    files: allFiles,
    untrackedFiles: [...untrackedFiles],
    additions,
    deletions,
    categories: summarizeCategories(allFiles),
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
      untrackedFiles: [],
      additions: 0,
      deletions: 0,
      categories: createEmptyCategories(),
    };
  }

  return parseNumstat(runGit(commandRunner, numstatArgs, cwd), files);
};

const getStagedSummary = (commandRunner: DevCommandRunner, cwd?: string): GitChangeSummary =>
  getSummary(
    commandRunner,
    ['diff', '--cached', '--name-only'],
    ['diff', '--cached', '--numstat'],
    cwd
  );

const getWorkingTreeSummary = (commandRunner: DevCommandRunner, cwd?: string): GitChangeSummary =>
  parseNumstat(
    runGit(commandRunner, ['diff', '--numstat'], cwd),
    getChangedFiles(commandRunner, ['diff', '--name-only'], cwd),
    getChangedFiles(commandRunner, ['ls-files', '--others', '--exclude-standard'], cwd)
  );

interface ParsedDiffHunk extends DevDiffHunk {
  addedText: string[];
}

const stripDiffPath = (value: string): string => value.replace(/^[ab]\//, '');

const parseDiffHunks = (diff: string): ParsedDiffHunk[] => {
  const hunks: ParsedDiffHunk[] = [];
  let currentFile = '';
  let currentHunk: ParsedDiffHunk | undefined;

  for (const line of diff.split(/\r?\n/)) {
    const fileMatch = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);

    if (fileMatch) {
      currentFile = stripDiffPath(fileMatch[2]);
      currentHunk = undefined;
      continue;
    }

    const hunkMatch = /^@@\s+(.+?)\s+@@/.exec(line);

    if (hunkMatch && currentFile) {
      currentHunk = {
        filePath: currentFile,
        header: hunkMatch[0],
        addedLines: 0,
        removedLines: 0,
        addedText: [],
      };
      hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) {
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      currentHunk.addedLines += 1;
      currentHunk.addedText.push(line.slice(1));
      continue;
    }

    if (line.startsWith('-') && !line.startsWith('---')) {
      currentHunk.removedLines += 1;
    }
  }

  return hunks;
};

const toPublicDiffHunks = (hunks: readonly ParsedDiffHunk[]): DevDiffHunk[] =>
  hunks.map(({ filePath, header, addedLines, removedLines }) => ({
    filePath,
    header,
    addedLines,
    removedLines,
  }));

const getReviewDiffHunks = (
  commandRunner: DevCommandRunner,
  source: DevReviewResult['source'],
  cwd?: string
): ParsedDiffHunk[] => {
  const args =
    source === 'working-tree' ? ['diff', '--unified=0'] : ['diff', '--cached', '--unified=0'];

  return parseDiffHunks(runGit(commandRunner, args, cwd));
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

const getRecommendedChecks = (summary: GitChangeSummary): string[] => {
  const checks: string[] = [];
  const addCheck = (check: string): void => {
    if (!checks.includes(check)) {
      checks.push(check);
    }
  };

  if (summary.categories.dependency > 0) {
    addCheck('corepack pnpm install --frozen-lockfile');
  }

  if (
    summary.categories.source > 0 ||
    summary.categories.test > 0 ||
    summary.categories.dependency > 0 ||
    summary.categories.workflow > 0 ||
    summary.categories.config > 0
  ) {
    addCheck('corepack pnpm build');
    addCheck('corepack pnpm test');
  }

  if (
    summary.categories.docs > 0 ||
    summary.categories.workflow > 0 ||
    summary.categories.config > 0
  ) {
    addCheck('corepack pnpm lint');
    addCheck('corepack pnpm format:check');
  }

  if (checks.length === 0) {
    addCheck('corepack pnpm test');
  }

  return checks;
};

const addFindingOnce = (findings: DevReviewFinding[], finding: DevReviewFinding): void => {
  if (
    findings.some(
      (existing) =>
        existing.title === finding.title &&
        existing.filePath === finding.filePath &&
        existing.hunkHeader === finding.hunkHeader
    )
  ) {
    return;
  }

  findings.push(finding);
};

const SENSITIVE_REVIEW_FILE_EXTENSIONS = new Set([
  '.bash',
  '.bat',
  '.cjs',
  '.cmd',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ps1',
  '.sh',
  '.ts',
  '.tsx',
  '.zsh',
]);

const SENSITIVE_REVIEW_FILE_NAMES = new Set([
  'eslint.config.js',
  'package.json',
  'pnpm-workspace.yaml',
  'tsconfig.json',
  'vitest.config.ts',
]);

const isSensitiveReviewFile = (filePath: string): boolean => {
  const normalized = filePath.replaceAll('\\', '/');
  const fileName = normalized.split('/').pop() ?? normalized;

  if (SENSITIVE_REVIEW_FILE_NAMES.has(fileName)) {
    return true;
  }

  if (/^(?:\.github\/workflows|examples\/workflows)\//.test(normalized)) {
    return /\.ya?ml$/.test(normalized);
  }

  return SENSITIVE_REVIEW_FILE_EXTENSIONS.has(/\.[^.]+$/.exec(fileName)?.[0] ?? '');
};

const hasShellExecutionAdded = (line: string): boolean =>
  /(?:^|[^\w.])exec\s*\(/.test(line) ||
  /\b(?:execFile|execFileSync|spawn|spawnSync|execSync)\s*\(/.test(line);

const hasFileMutationAdded = (line: string): boolean =>
  /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|rm|rmSync|unlink|unlinkSync)\s*\(/.test(
    line
  );

const hasNetworkAccessAdded = (line: string): boolean => /\bfetch\s*\(/.test(line);

const hasSecretLikeLiteralAdded = (line: string): boolean =>
  /\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/.test(
    line
  ) ||
  /\b(?:api[_-]?key|token|secret|password)\b\s*[:=]\s*['"](?!(?:test|example|dummy|placeholder|redacted|set|missing)[\w-]*['"])[^'"]{16,}['"]/i.test(
    line
  );

const hasDestructiveGitCommandAdded = (line: string): boolean =>
  /\bgit\s+(?:reset\s+--hard|push\s+--force(?:-with-lease)?|clean\s+-[A-Za-z]*[fd][A-Za-z]*|checkout\s+--)\b/.test(
    line
  ) ||
  (/\bgit\b/.test(line) &&
    (/[`'"]reset[`'"]\s*,\s*[`'"]--hard[`'"]/.test(line) ||
      /[`'"]push[`'"]\s*,\s*[`'"]--force(?:-with-lease)?[`'"]/.test(line) ||
      /[`'"]clean[`'"]\s*,\s*[`'"]-[A-Za-z]*[fd][A-Za-z]*[`'"]/.test(line) ||
      /[`'"]checkout[`'"]\s*,\s*[`'"]--[`'"]/.test(line)));

const addDiffHeuristicFindings = (
  findings: DevReviewFinding[],
  hunks: readonly ParsedDiffHunk[]
): void => {
  for (const hunk of hunks) {
    const shouldScanSensitiveText = isSensitiveReviewFile(hunk.filePath);

    if (hunk.addedLines + hunk.removedLines > 80) {
      addFindingOnce(findings, {
        severity: 'warning',
        priority: 'medium',
        category: 'quality',
        title: 'Large diff hunk',
        detail:
          'This hunk is large enough to hide review risk; consider splitting it before merge.',
        filePath: hunk.filePath,
        hunkHeader: hunk.header,
      });
    }

    if (shouldScanSensitiveText && hunk.addedText.some(hasShellExecutionAdded)) {
      addFindingOnce(findings, {
        severity: 'warning',
        priority: 'high',
        category: 'execution',
        title: 'Shell execution added',
        detail:
          'Added code appears to run shell commands; confirm preview or confirmation behavior.',
        filePath: hunk.filePath,
        hunkHeader: hunk.header,
      });
    }

    if (shouldScanSensitiveText && hunk.addedText.some(hasFileMutationAdded)) {
      addFindingOnce(findings, {
        severity: 'warning',
        priority: 'medium',
        category: 'filesystem',
        title: 'File mutation added',
        detail:
          'Added code appears to write or delete files; confirm it cannot silently overwrite user data.',
        filePath: hunk.filePath,
        hunkHeader: hunk.header,
      });
    }

    if (shouldScanSensitiveText && hunk.addedText.some(hasNetworkAccessAdded)) {
      addFindingOnce(findings, {
        severity: 'warning',
        priority: 'medium',
        category: 'network',
        title: 'Network access added',
        detail:
          'Added code appears to access the network; confirm preview and user consent behavior.',
        filePath: hunk.filePath,
        hunkHeader: hunk.header,
      });
    }

    if (hunk.addedText.some((line) => /\b(?:it|describe|test)\.only\s*\(/.test(line))) {
      addFindingOnce(findings, {
        severity: 'warning',
        priority: 'high',
        category: 'test',
        title: 'Focused test committed',
        detail: 'A focused test marker was added and would narrow the test run.',
        filePath: hunk.filePath,
        hunkHeader: hunk.header,
      });
    }

    if (shouldScanSensitiveText && hunk.addedText.some(hasSecretLikeLiteralAdded)) {
      addFindingOnce(findings, {
        severity: 'warning',
        priority: 'high',
        category: 'security',
        title: 'Secret-like literal added',
        detail:
          'Added code appears to contain a credential-like literal; move secrets to environment variables and rotate any exposed value.',
        filePath: hunk.filePath,
        hunkHeader: hunk.header,
      });
    }

    if (shouldScanSensitiveText && hunk.addedText.some(hasDestructiveGitCommandAdded)) {
      addFindingOnce(findings, {
        severity: 'warning',
        priority: 'high',
        category: 'git',
        title: 'Destructive Git command added',
        detail:
          'Added code appears to run a destructive Git command; confirm it cannot reset, clean, or force-push user work without explicit consent.',
        filePath: hunk.filePath,
        hunkHeader: hunk.header,
      });
    }
  }
};

const addDependencyConsistencyFindings = (
  findings: DevReviewFinding[],
  files: readonly string[]
): void => {
  const hasPackageManifest = files.some(
    (file) => file === 'package.json' || file.endsWith('/package.json')
  );
  const hasLockfile = files.includes('pnpm-lock.yaml');

  if (hasPackageManifest && !hasLockfile) {
    findings.push({
      severity: 'warning',
      priority: 'medium',
      category: 'dependency',
      title: 'Package manifest without lockfile',
      detail:
        'A package manifest changed without pnpm-lock.yaml; confirm dependency resolution did not change or run a frozen install.',
    });
  }

  if (hasLockfile && !hasPackageManifest) {
    findings.push({
      severity: 'warning',
      priority: 'medium',
      category: 'dependency',
      title: 'Lockfile without package manifest',
      detail:
        'pnpm-lock.yaml changed without a package manifest; confirm the lockfile change is intentional.',
    });
  }
};

const getPackageName = (filePath: string): string | undefined =>
  /^packages\/([^/]+)\//.exec(filePath.replaceAll('\\', '/'))?.[1];

const isTestFile = (filePath: string): boolean =>
  filePath.includes('.test.') || filePath.includes('.spec.');

const addPackageTestCoverageFindings = (
  findings: DevReviewFinding[],
  files: readonly string[]
): void => {
  const changedSourcePackages = [
    ...new Set(
      files
        .filter(
          (file) =>
            file.replaceAll('\\', '/').startsWith('packages/') &&
            file.replaceAll('\\', '/').includes('/src/') &&
            !isTestFile(file)
        )
        .map((file) => getPackageName(file))
        .filter((packageName): packageName is string => Boolean(packageName))
    ),
  ];

  if (changedSourcePackages.length === 0) {
    return;
  }

  const changedTestPackages = new Set(
    files
      .filter(isTestFile)
      .map((file) => getPackageName(file))
      .filter((packageName): packageName is string => Boolean(packageName))
  );
  const missingPackageTests = changedSourcePackages.filter(
    (packageName) => !changedTestPackages.has(packageName)
  );

  if (missingPackageTests.length === 0) {
    return;
  }

  findings.push({
    severity: 'warning',
    priority: 'medium',
    category: 'test',
    title: 'Package tests not detected',
    detail: `Source changed in package(s) ${missingPackageTests.join(', ')}, but no matching package test file changed in this diff.`,
  });
};

export const previewDevCommit = (
  commandRunner: DevCommandRunner,
  options: { cwd?: string } = {}
): DevCommitResult => {
  const summary = getStagedSummary(commandRunner, options.cwd);

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
    schemaVersion: DEV_COMMIT_SCHEMA_VERSION,
    status: 'ok',
    source: 'staged',
    summary,
    message: `${type}: update ${scope}`,
    recommendedChecks: getRecommendedChecks(summary),
  };
};

export const getDevStatus = (
  commandRunner: DevCommandRunner,
  options: { cwd?: string } = {}
): DevStatusResult => {
  const output = runGit(commandRunner, ['status', '--short', '--branch'], options.cwd);
  const lines = output.split(/\r?\n/).filter(Boolean);
  const firstLine = lines[0] ?? '';
  const branch =
    /^##\s+(.+?)(?:\.{3}.+)?$/.exec(firstLine)?.[1].replace(/\s+\[.+\]$/, '') ?? 'unknown';
  const staged: string[] = [];
  const unstaged: string[] = [];
  const untracked: string[] = [];

  for (const line of lines.slice(firstLine.startsWith('##') ? 1 : 0)) {
    const indexStatus = line[0] ?? ' ';
    const worktreeStatus = line[1] ?? ' ';
    const file = line.slice(3).trim();

    if (!file) {
      continue;
    }

    if (indexStatus === '?' && worktreeStatus === '?') {
      untracked.push(file);
      continue;
    }

    if (indexStatus !== ' ') {
      staged.push(file);
    }

    if (worktreeStatus !== ' ') {
      unstaged.push(file);
    }
  }

  return {
    schemaVersion: DEV_STATUS_SCHEMA_VERSION,
    status: 'ok',
    branch,
    clean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
    staged,
    unstaged,
    untracked,
  };
};

export const reviewDevChanges = (
  commandRunner: DevCommandRunner,
  options: { cwd?: string; mode?: DevReviewMode } = {}
): DevReviewResult => {
  let source: DevReviewResult['source'] = 'staged';
  let summary =
    options.mode === 'worktree'
      ? getWorkingTreeSummary(commandRunner, options.cwd)
      : getStagedSummary(commandRunner, options.cwd);

  if (options.mode === 'worktree') {
    source = 'working-tree';
  }

  if (summary.files.length === 0 && (!options.mode || options.mode === 'auto')) {
    source = 'working-tree';
    summary = getWorkingTreeSummary(commandRunner, options.cwd);
  }

  if (summary.files.length === 0) {
    const sourceDescription =
      options.mode === 'staged'
        ? 'staged changes'
        : options.mode === 'worktree'
          ? 'working-tree changes'
          : 'staged or working-tree changes';

    throw new ZaoWuError({
      code: 'NO_CHANGES_TO_REVIEW',
      message: 'No changes found to review.',
      why: `ZaoWu could not find ${sourceDescription}.`,
      fix: 'Change files or stage changes before running `zw dev review`.',
    });
  }

  const diffHunks = getReviewDiffHunks(commandRunner, source, options.cwd);
  const findings: DevReviewFinding[] = [
    {
      severity: 'info',
      priority: 'low',
      category: 'summary',
      title: 'Change size',
      detail: `${summary.files.length} file(s), +${summary.additions}/-${summary.deletions}.`,
    },
  ];

  if (summary.untrackedFiles.length > 0) {
    findings.push({
      severity: 'warning',
      priority: 'medium',
      category: 'git',
      title: 'Untracked files detected',
      detail: `${summary.untrackedFiles.length} untracked file(s) are listed by name only; stage them to include full diff context.`,
    });
  }

  if (
    summary.files.some((file) => file.startsWith('packages/') && file.includes('/src/')) &&
    !summary.files.some((file) => file.includes('.test.') || file.includes('.spec.'))
  ) {
    findings.push({
      severity: 'warning',
      priority: 'medium',
      category: 'test',
      title: 'Tests not detected',
      detail: 'Source files changed, but no test file changed in this diff.',
    });
  }

  if (
    summary.files.some((file) => file.endsWith('package.json') || file.endsWith('pnpm-lock.yaml'))
  ) {
    findings.push({
      severity: 'warning',
      priority: 'medium',
      category: 'dependency',
      title: 'Dependency metadata changed',
      detail: 'Run a frozen install, build, and tests before merging.',
    });
  }

  addDependencyConsistencyFindings(findings, summary.files);
  addPackageTestCoverageFindings(findings, summary.files);
  addDiffHeuristicFindings(findings, diffHunks);

  return {
    schemaVersion: DEV_REVIEW_SCHEMA_VERSION,
    status: 'ok',
    source,
    summary,
    diffHunks: toPublicDiffHunks(diffHunks),
    findings,
    recommendedChecks: getRecommendedChecks(summary),
  };
};
