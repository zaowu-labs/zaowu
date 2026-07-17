import type { OperationPlan } from '@zaowu-labs/core';

export type DevCommandRunner = (
  command: string,
  args: readonly string[],
  options?: { cwd?: string }
) => string;

export const DEV_CHANGE_CATEGORIES = [
  'source',
  'test',
  'docs',
  'dependency',
  'workflow',
  'config',
  'other',
] as const;
export type DevChangeCategory = (typeof DEV_CHANGE_CATEGORIES)[number];
export type DevChangeCategories = Record<DevChangeCategory, number>;

export interface GitChangeSummary {
  files: string[];
  untrackedFiles: string[];
  additions: number;
  deletions: number;
  categories: DevChangeCategories;
}

export interface DevCommitSuggestion {
  type: string;
  scope: string;
  subject: string;
  title: string;
  body: string[];
}

export interface DevReviewFinding {
  severity: 'info' | 'warning';
  priority: 'low' | 'medium' | 'high';
  category:
    | 'summary'
    | 'test'
    | 'dependency'
    | 'quality'
    | 'performance'
    | 'execution'
    | 'filesystem'
    | 'network'
    | 'security'
    | 'git';
  title: string;
  detail: string;
  filePath?: string;
  hunkHeader?: string;
  line?: number;
}

export interface DevCommitResult {
  schemaVersion: 1;
  status: 'ok';
  source: 'staged';
  summary: GitChangeSummary;
  suggestion: DevCommitSuggestion;
  message: string;
  findings: DevReviewFinding[];
  recommendedChecks: string[];
}

export interface DevStatusResult {
  schemaVersion: 1;
  status: 'ok';
  branch: string;
  clean: boolean;
  ahead: number;
  behind: number;
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

export const isDevFindingSeverity = (value: unknown): value is DevReviewFinding['severity'] =>
  value === 'info' || value === 'warning';
export const isDevFindingPriority = (value: unknown): value is DevReviewFinding['priority'] =>
  value === 'low' || value === 'medium' || value === 'high';
export const isDevFindingCategory = (value: unknown): value is DevReviewFinding['category'] =>
  [
    'summary',
    'test',
    'dependency',
    'quality',
    'performance',
    'execution',
    'filesystem',
    'network',
    'security',
    'git',
  ].includes(value as string);

export interface DevDiffHunk {
  filePath: string;
  header: string;
  addedLines: number;
  removedLines: number;
  startLine: number;
  endLine: number;
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

export interface DevSyncResult {
  schemaVersion: 1;
  status: 'ok' | 'preview';
  branch: string;
  previousCommit: string;
  currentCommit: string;
  output: string;
  operationPlan?: OperationPlan;
}
