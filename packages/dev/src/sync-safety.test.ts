import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { syncDevRepo, type DevCommandRunner } from './index';

describe('dev sync safety with real local Git repositories', () => {
  let root: string;
  let local: string;
  let remote: string;
  let writer: string;
  let calls: string[];

  const git = (cwd: string, ...args: string[]): string =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=ZaoWu Test',
        '-c',
        'user.email=test@example.invalid',
        '-c',
        'commit.gpgsign=false',
        '-c',
        `core.hooksPath=${os.devNull}`,
        ...args,
      ],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );

  const runner: DevCommandRunner = (_command, args, settings) => {
    calls.push(args.join(' '));
    return git(settings?.cwd ?? local, ...args);
  };
  const commit = (cwd: string, name: string, content: string): void => {
    writeFileSync(path.join(cwd, name), content);
    git(cwd, 'add', '--', name);
    git(cwd, 'commit', '-qm', 'fixture change');
  };
  const options = () => ({ cwd: local, yes: true });

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'zaowu-sync-safety-'));
    local = path.join(root, 'local');
    remote = path.join(root, 'origin.git');
    writer = path.join(root, 'writer');
    mkdirSync(local);
    git(root, 'init', '--bare', '--initial-branch=main', remote);
    git(local, 'init', '--initial-branch=main');
    commit(local, 'tracked.txt', 'initial');
    git(local, 'remote', 'add', 'origin', remote);
    git(local, 'push', '-qu', 'origin', 'main');
    git(root, 'clone', '-q', remote, writer);
    calls = [];
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('allows a clean fast-forward sync without discard acknowledgement', () => {
    commit(writer, 'new.txt', 'remote content');
    git(writer, 'push', '-q', 'origin', 'main');
    expect(syncDevRepo(runner, options()).status).toBe('ok');
    expect(readFileSync(path.join(local, 'new.txt'), 'utf8')).toBe('remote content');
    expect(git(local, 'rev-parse', 'HEAD')).toBe(git(writer, 'rev-parse', 'HEAD'));
  });

  it('checks commits against origin even without an upstream', () => {
    git(local, 'branch', '--unset-upstream');
    commit(local, 'local.txt', 'keep my commit');
    expect(syncDevRepo(runner).operationPlan?.notes.join('\n')).toContain('1 local commit(s)');
    expect(() => syncDevRepo(runner, options())).toThrow(
      'Local Git changes require explicit discard confirmation.'
    );
    expect(calls).not.toContain('fetch origin');
    expect(readFileSync(path.join(local, 'local.txt'), 'utf8')).toBe('keep my commit');
  });

  it('checks the actual origin branch when another branch is the upstream', () => {
    commit(local, 'local.txt', 'keep my commit');
    git(local, 'update-ref', 'refs/remotes/other/main', git(local, 'rev-parse', 'HEAD').trim());
    git(local, 'config', 'branch.main.remote', '.');
    git(local, 'config', 'branch.main.merge', 'refs/remotes/other/main');
    expect(() => syncDevRepo(runner, options())).toThrow(
      'Local Git changes require explicit discard confirmation.'
    );
    expect(calls).not.toContain('fetch origin');
  });

  it('rechecks discard risk after a remote history rewrite', () => {
    git(writer, 'checkout', '--orphan', 'replacement');
    git(writer, 'rm', '-qf', 'tracked.txt');
    commit(writer, 'replacement.txt', 'different history');
    git(writer, 'push', '-q', '--force', 'origin', 'HEAD:main');
    const head = git(local, 'rev-parse', 'HEAD');
    expect(() => syncDevRepo(runner, options())).toThrow(
      'Local Git changes require explicit discard confirmation.'
    );
    expect(calls).toContain('fetch origin');
    expect(calls.some((call) => call.startsWith('reset '))).toBe(false);
    expect(git(local, 'rev-parse', 'HEAD')).toBe(head);
    expect(readFileSync(path.join(local, 'tracked.txt'), 'utf8')).toBe('initial');
  });

  it.each([false, true])('protects obstructing untracked paths (ignored=%s)', (ignored) => {
    if (ignored) writeFileSync(path.join(local, '.git', 'info', 'exclude'), 'new.txt\n');
    writeFileSync(path.join(local, 'new.txt'), 'local content');
    commit(writer, 'new.txt', 'remote content');
    git(writer, 'push', '-q', 'origin', 'main');
    expect(() => syncDevRepo(runner, options())).toThrow(
      'Local Git changes require explicit discard confirmation.'
    );
    expect(readFileSync(path.join(local, 'new.txt'), 'utf8')).toBe('local content');
    expect(calls.some((call) => call.startsWith('reset '))).toBe(false);
    expect(syncDevRepo(runner, { ...options(), discardLocal: true }).status).toBe('ok');
    expect(readFileSync(path.join(local, 'new.txt'), 'utf8')).toBe('remote content');
  });

  it('preserves unrelated untracked files without requiring discard acknowledgement', () => {
    writeFileSync(path.join(local, 'scratch.txt'), 'keep');
    expect(syncDevRepo(runner, options()).status).toBe('ok');
    expect(readFileSync(path.join(local, 'scratch.txt'), 'utf8')).toBe('keep');
  });

  it('checks reset collisions outside the current subdirectory', () => {
    const nested = path.join(local, 'nested');
    mkdirSync(nested);
    writeFileSync(path.join(local, 'new.txt'), 'keep this root-level file');
    commit(writer, 'new.txt', 'remote content');
    git(writer, 'push', '-q', 'origin', 'main');
    expect(() => syncDevRepo(runner, { cwd: nested, yes: true })).toThrow(
      'Local Git changes require explicit discard confirmation.'
    );
    expect(readFileSync(path.join(local, 'new.txt'), 'utf8')).toBe('keep this root-level file');
    expect(calls.some((call) => call.startsWith('reset '))).toBe(false);
  });

  it('rejects changed tracked content even if the status file list is identical', () => {
    writeFileSync(path.join(local, 'tracked.txt'), 'first edit');
    const first = syncDevRepo(runner).operationPlan?.fingerprint;
    writeFileSync(path.join(local, 'tracked.txt'), 'second edit');
    expect(syncDevRepo(runner).operationPlan?.fingerprint).not.toBe(first);
  });

  it('binds staged content even when the working copy matches HEAD', () => {
    writeFileSync(path.join(local, 'tracked.txt'), 'first staged edit');
    git(local, 'add', 'tracked.txt');
    writeFileSync(path.join(local, 'tracked.txt'), 'initial');
    const first = syncDevRepo(runner).operationPlan?.fingerprint;
    writeFileSync(path.join(local, 'tracked.txt'), 'second staged edit');
    git(local, 'add', 'tracked.txt');
    writeFileSync(path.join(local, 'tracked.txt'), 'initial');
    expect(syncDevRepo(runner).operationPlan?.fingerprint).not.toBe(first);
  });

  it('rejects local edits made while fetching', () => {
    const changingRunner: DevCommandRunner = (command, args, settings) => {
      const output = runner(command, args, settings);
      if (args[0] === 'fetch')
        writeFileSync(path.join(local, 'tracked.txt'), 'edited during fetch');
      return output;
    };
    expect(() => syncDevRepo(changingRunner, options())).toThrow(
      'Local Git state changed during synchronization.'
    );
    expect(calls.some((call) => call.startsWith('reset '))).toBe(false);
  });

  it('rejects detached HEAD before fetching or resetting', () => {
    git(local, 'checkout', '--detach', '-q');
    expect(() => syncDevRepo(runner, options())).toThrow();
    expect(calls).not.toContain('fetch origin');
    expect(calls.some((call) => call.startsWith('reset '))).toBe(false);
  });

  it('ignores a tag that shadows the origin branch name', () => {
    git(local, 'tag', 'origin/main');
    commit(writer, 'new.txt', 'remote content');
    git(writer, 'push', '-q', 'origin', 'main');
    syncDevRepo(runner, options());
    expect(git(local, 'rev-parse', 'HEAD')).toBe(git(writer, 'rev-parse', 'HEAD'));
  });
});
