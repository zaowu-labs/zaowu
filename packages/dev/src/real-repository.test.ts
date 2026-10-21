import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyDevAiCommitSuggestion,
  getDevStatus,
  parseDevAiReviewFindings,
  previewDevCommit,
  readDevDiff,
  reviewDevChanges,
  type DevCommandRunner,
} from './index';

const runner: DevCommandRunner = (command, args, options) =>
  execFileSync(command, [...args], {
    ...options,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

describe('real Git review and commit previews', () => {
  it('handles Unicode/space paths, blocks diff drivers, and leaves the index and worktree unchanged', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-review-real-'));
    const git = (...args: string[]) => runner('git', args, { cwd: root });
    try {
      git('init', '-b', 'main');
      git('config', 'user.email', 'fixture@example.invalid');
      git('config', 'user.name', 'Fixture');
      await mkdir(path.join(root, '目录'));
      const relative = '目录/含 空格.ts';
      await writeFile(path.join(root, relative), 'export const old = true;\n');
      await writeFile(path.join(root, '.gitattributes'), '*.ts diff=trap\n');
      git('add', '.');
      git('commit', '-m', 'fixture');
      git('config', 'diff.trap.command', 'command-that-must-never-run-zaowu');
      git('config', 'diff.trap.textconv', 'command-that-must-never-run-zaowu');
      await writeFile(path.join(root, relative), 'fetch("https://example.invalid");\n');
      git('add', relative);
      const beforeIndex = await readFile(path.join(root, '.git', 'index'));
      const beforeStatus = git('status', '--porcelain=v1', '-z');
      const beforeHead = git('rev-parse', 'HEAD');
      expect(getDevStatus(runner, { cwd: root }).staged).toEqual([relative]);
      const review = reviewDevChanges(runner, { cwd: root, mode: 'staged' });
      expect(review.method).toBe('heuristic');
      expect(review.summary.files).toEqual([relative]);
      expect(review.diffHunks[0].filePath).toBe(relative);
      expect(review.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: 'Network access added', filePath: relative, line: 1 }),
        ])
      );
      const commit = previewDevCommit(runner, { cwd: root });
      expect(commit.summary.categories.source).toBe(1);
      expect(readDevDiff(runner, { cwd: root, source: 'staged' })).toContain('example.invalid');
      expect(await readFile(path.join(root, '.git', 'index'))).toEqual(beforeIndex);
      expect(git('status', '--porcelain=v1', '-z')).toBe(beforeStatus);
      expect(git('rev-parse', 'HEAD')).toBe(beforeHead);
      expect(await readFile(path.join(root, relative), 'utf8')).toContain('fetch(');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps newline filenames intact in NUL-separated file lists on Unix', async () => {
    if (process.platform === 'win32') return;
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-review-newline-'));
    try {
      runner('git', ['init'], { cwd: root });
      const relative = 'new\nfile.ts';
      await writeFile(path.join(root, relative), 'fetch("https://example.invalid");\n');
      runner('git', ['add', '--', relative], { cwd: root });
      const review = reviewDevChanges(runner, { cwd: root, mode: 'staged' });
      expect(review.summary.files).toEqual([relative]);
      expect(review.diffHunks[0].filePath).toBe(relative);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not count rename filenames as numstat entries or added diff-like lines as headers', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-review-rename-'));
    const git = (...args: string[]) => runner('git', args, { cwd: root });
    try {
      git('init');
      git('config', 'user.email', 'fixture@example.invalid');
      git('config', 'user.name', 'Fixture');
      await writeFile(path.join(root, '10 20 old.ts'), 'one\ntwo\nthree\nfour\nfive\n');
      git('add', '.');
      git('commit', '-m', 'fixture');
      git('mv', '10 20 old.ts', 'new.ts');
      const renamed = previewDevCommit(runner, { cwd: root });
      expect(renamed.summary).toMatchObject({ files: ['new.ts'], additions: 0, deletions: 0 });
      await writeFile(
        path.join(root, 'new.ts'),
        '++ fake-header\none\ntwo\nthree\nfour\nfetch("https://example.invalid");\n'
      );
      git('add', '.');
      const review = reviewDevChanges(runner, { cwd: root, mode: 'staged' });
      expect(review.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: 'Network access added', filePath: 'new.ts', line: 6 }),
        ])
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not present hallucinated model locations as verified source lines', () => {
    const findings = parseDevAiReviewFindings(
      '[{"title":"Check","detail":"Inspect this.","filePath":"missing.ts","line":99}]',
      { files: ['real.ts'], hunks: [] }
    );
    expect(findings[0]).toMatchObject({
      filePath: undefined,
      line: undefined,
      detail: expect.stringContaining('could not be verified'),
    });
  });

  it('rejects malformed model commit titles and accepts breaking changes', () => {
    const preview = previewDevCommit((_command, args) =>
      args.includes('--name-only') ? 'a.ts\0' : args.includes('--numstat') ? '1\t0\ta.ts\0' : ''
    );
    expect(() => applyDevAiCommitSuggestion(preview, 'Here is a commit message:')).toThrow(
      'AI commit suggestion is invalid.'
    );
    expect(
      applyDevAiCommitSuggestion(
        preview,
        '```text\nfeat(core)!: change API\n\nBREAKING CHANGE: new API\n```'
      ).suggestion
    ).toMatchObject({
      type: 'feat',
      scope: 'core',
      subject: 'change API',
      title: 'feat(core)!: change API',
    });
    expect(applyDevAiCommitSuggestion(preview, 'fix: repair CLI').suggestion.scope).toBe('');
  });
});
