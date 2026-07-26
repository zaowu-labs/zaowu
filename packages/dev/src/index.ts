import path from 'node:path';
import { ZaoWuError } from '@zaowu-labs/core';

export { DEV_DOMAIN } from './domain.js';

import {
  DEV_CHANGE_CATEGORIES,
  type DevChangeCategories,
  type DevChangeCategory,
  type DevCommandRunner,
  type DevCommitResult,
  type DevCommitSuggestion,
  type DevDiffHunk,
  type DevReviewFinding,
  type DevReviewMode,
  type DevReviewResult,
  type DevStatusResult,
  type DevSyncResult,
  type GitChangeSummary,
} from './contracts.js';
import { runGit } from './git.js';
import { syncDevRepoInternal, type DevSyncOptions } from './sync.js';

export * from './ai-assist.js';
export * from './contracts.js';

const DEV_REVIEW_SCHEMA_VERSION = 1;
const DEV_COMMIT_SCHEMA_VERSION = 1;
const DEV_STATUS_SCHEMA_VERSION = 1;

const createEmptyCategories = (): DevChangeCategories =>
  Object.fromEntries(DEV_CHANGE_CATEGORIES.map((cat) => [cat, 0])) as DevChangeCategories;

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
  addedLineNumbers: number[];
}

const stripDiffPath = (value: string): string => {
  let cleaned = value.replace(/^[ab]\//, '');

  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1);
  }

  return cleaned;
};

const parseDiffHunks = (diff: string): ParsedDiffHunk[] => {
  const hunks: ParsedDiffHunk[] = [];
  let currentFile = '';
  let currentHunk: ParsedDiffHunk | undefined;
  let currentNewLine = 0;

  for (const line of diff.split(/\r?\n/)) {
    const fileMatch = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);

    if (fileMatch) {
      currentFile = stripDiffPath(fileMatch[2]);
      currentHunk = undefined;
      currentNewLine = 0;
      continue;
    }

    const hunkMatch = /^@@\s+-(?:\d+)(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/.exec(line);

    if (hunkMatch && currentFile) {
      const startLine = Number.parseInt(hunkMatch[1], 10);
      const lineCount = Number.parseInt(hunkMatch[2] ?? '1', 10);
      currentNewLine = startLine;
      currentHunk = {
        filePath: currentFile,
        header: hunkMatch[0],
        addedLines: 0,
        removedLines: 0,
        startLine,
        endLine: Math.max(startLine, startLine + lineCount - 1),
        addedText: [],
        addedLineNumbers: [],
      };
      hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) {
      continue;
    }

    if (line.startsWith('\\ No newline at end of file')) {
      continue;
    }

    if (line.startsWith('+')) {
      currentHunk.addedLines += 1;
      currentHunk.addedText.push(line.slice(1));
      currentHunk.addedLineNumbers.push(currentNewLine);
      currentNewLine += 1;
      continue;
    }

    if (line.startsWith('-')) {
      currentHunk.removedLines += 1;
      continue;
    }

    currentNewLine += 1;
  }

  return hunks;
};

const toPublicDiffHunks = (hunks: readonly ParsedDiffHunk[]): DevDiffHunk[] =>
  hunks.map(({ filePath, header, addedLines, removedLines, startLine, endLine }) => ({
    filePath,
    header,
    addedLines,
    removedLines,
    startLine,
    endLine,
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

  if (files.some((file) => file.endsWith('package.json') || file.endsWith('pnpm-lock.yaml'))) {
    return 'chore';
  }

  // Test-only changes must be classified before the general src/ check;
  // test files live under src/, so the previous order made `test` unreachable.
  if (files.every((file) => file.includes('.test.') || file.includes('.spec.'))) {
    return 'test';
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

  if (
    files.some(
      (file) =>
        file === 'package.json' || file === 'pnpm-lock.yaml' || file.endsWith('/package.json')
    )
  ) {
    return 'deps';
  }

  if (files.some((file) => file.startsWith('.github/workflows/') || file.startsWith('scripts/'))) {
    return 'workflow';
  }

  if (
    files.some(
      (file) =>
        file === 'tsconfig.json' ||
        file === 'eslint.config.js' ||
        file === '.prettierrc' ||
        file.startsWith('.changeset/')
    )
  ) {
    return 'config';
  }

  return 'project';
};

const normalizeCommitScope = (scope: string): string =>
  scope
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';

const inferCommitSubject = (summary: GitChangeSummary, scope: string): string => {
  if (summary.categories.dependency > 0) {
    return 'update dependency metadata';
  }

  if (
    summary.categories.docs > 0 &&
    summary.files.every((file) => getFileCategory(file) === 'docs')
  ) {
    return 'update documentation';
  }

  if (summary.categories.test > 0 && summary.categories.source === 0) {
    return 'update tests';
  }

  if (summary.categories.workflow > 0 && summary.categories.source === 0) {
    return 'update workflows';
  }

  if (summary.categories.config > 0 && summary.categories.source === 0) {
    return 'update configuration';
  }

  return `update ${scope}`;
};

const describeCommitCategories = (categories: DevChangeCategories): string => {
  const entries = Object.entries(categories)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => `${name}=${count}`);

  return entries.length > 0 ? entries.join(', ') : 'none';
};

const createCommitSuggestion = (summary: GitChangeSummary): DevCommitSuggestion => {
  const type = inferCommitType(summary.files);
  const scope = normalizeCommitScope(inferScope(summary.files));
  const subject = inferCommitSubject(summary, scope);
  const title = `${type}(${scope}): ${subject}`;

  return {
    type,
    scope,
    subject,
    title,
    body: [
      `Staged files: ${summary.files.length}.`,
      `Change size: +${summary.additions}/-${summary.deletions}.`,
      `Categories: ${describeCommitCategories(summary.categories)}.`,
    ],
  };
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
        existing.hunkHeader === finding.hunkHeader &&
        existing.line === finding.line
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
  const fileName = path.basename(filePath);

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

const findFirstAddedLineNumber = (
  hunk: ParsedDiffHunk,
  predicate: (line: string) => boolean
): number | undefined => {
  const index = hunk.addedText.findIndex(predicate);

  return index >= 0 ? hunk.addedLineNumbers[index] : undefined;
};

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
        line: findFirstAddedLineNumber(hunk, hasShellExecutionAdded),
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
        line: findFirstAddedLineNumber(hunk, hasFileMutationAdded),
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
        line: findFirstAddedLineNumber(hunk, hasNetworkAccessAdded),
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
        line: findFirstAddedLineNumber(hunk, (line) =>
          /\b(?:it|describe|test)\.only\s*\(/.test(line)
        ),
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
        line: findFirstAddedLineNumber(hunk, hasSecretLikeLiteralAdded),
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
        line: findFirstAddedLineNumber(hunk, hasDestructiveGitCommandAdded),
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

const isGeneratedArtifactFile = (filePath: string): boolean => {
  const normalized = filePath.replaceAll('\\', '/');
  const fileName = path.basename(filePath);

  return (
    normalized.includes('/dist/') ||
    normalized.startsWith('dist/') ||
    normalized.includes('/coverage/') ||
    normalized.startsWith('coverage/') ||
    normalized.includes('/node_modules/') ||
    normalized.startsWith('node_modules/') ||
    normalized.includes('/.turbo/') ||
    normalized.startsWith('.turbo/') ||
    fileName.endsWith('.tsbuildinfo') ||
    fileName.endsWith('.tgz')
  );
};

const addGeneratedArtifactFindings = (
  findings: DevReviewFinding[],
  files: readonly string[]
): void => {
  for (const file of files.filter(isGeneratedArtifactFile)) {
    addFindingOnce(findings, {
      severity: 'warning',
      priority: 'high',
      category: 'quality',
      title: 'Generated artifact staged',
      detail:
        'This path looks like a build, coverage, dependency, or package artifact; confirm it belongs in source control before committing.',
      filePath: file,
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

const createDevChangeFindings = (
  summary: GitChangeSummary,
  diffHunks: readonly ParsedDiffHunk[],
  options: { includeSummary: boolean; includeUntracked: boolean }
): DevReviewFinding[] => {
  const findings: DevReviewFinding[] = [];

  if (options.includeSummary) {
    findings.push({
      severity: 'info',
      priority: 'low',
      category: 'summary',
      title: 'Change size',
      detail: `${summary.files.length} file(s), +${summary.additions}/-${summary.deletions}.`,
    });
  }

  if (options.includeUntracked && summary.untrackedFiles.length > 0) {
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
  addGeneratedArtifactFindings(findings, summary.files);
  addDiffHeuristicFindings(findings, diffHunks);

  return findings;
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

  const diffHunks = getReviewDiffHunks(commandRunner, 'staged', options.cwd);
  const suggestion = createCommitSuggestion(summary);

  return {
    schemaVersion: DEV_COMMIT_SCHEMA_VERSION,
    status: 'ok',
    source: 'staged',
    summary,
    suggestion,
    message: suggestion.title,
    findings: createDevChangeFindings(summary, diffHunks, {
      includeSummary: false,
      includeUntracked: false,
    }),
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
  const ahead = Number.parseInt(/\bahead\s+(\d+)/.exec(firstLine)?.[1] ?? '0', 10) || 0;
  const behind = Number.parseInt(/\bbehind\s+(\d+)/.exec(firstLine)?.[1] ?? '0', 10) || 0;
  const staged: string[] = [];
  const unstaged: string[] = [];
  const untracked: string[] = [];

  for (const line of lines.slice(firstLine.startsWith('##') ? 1 : 0)) {
    const indexStatus = line[0] ?? ' ';
    const worktreeStatus = line[1] ?? ' ';
    let file = line.slice(3).trim();

    if (file.includes(' -> ')) {
      const parts = file.split(' -> ');
      file = parts[parts.length - 1].trim();
    }

    if (file.startsWith('"') && file.endsWith('"')) {
      file = file.slice(1, -1);
    }

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
    ahead,
    behind,
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
  const findings = createDevChangeFindings(summary, diffHunks, {
    includeSummary: true,
    includeUntracked: true,
  });

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

export const syncDevRepo = (
  commandRunner: DevCommandRunner,
  options: DevSyncOptions = {}
): DevSyncResult => syncDevRepoInternal(commandRunner, options, getDevStatus);
