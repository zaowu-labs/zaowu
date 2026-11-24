import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
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
  const publishCollision = (name: string): void => {
    commit(writer, name, 'remote content');
    git(writer, 'push', '-q', 'origin', 'main');
    git(local, 'fetch', '-q', 'origin');
  };

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

  it('keeps local work when the remote branch was deleted but the tracking ref remains', () => {
    git(remote, 'update-ref', '-d', 'refs/heads/main');
    writeFileSync(path.join(local, 'tracked.txt'), 'local edit');
    expect(() => syncDevRepo(runner, { ...options(), discardLocal: true })).toThrow();
    expect(calls.some((call) => call.startsWith('reset '))).toBe(false);
    expect(readFileSync(path.join(local, 'tracked.txt'), 'utf8')).toBe('local edit');
  });

  it('syncs the actual local branch when a tag and a different remote heads/main branch exist', () => {
    git(local, 'tag', 'main');
    commit(writer, 'tracked.txt', 'right branch');
    git(writer, 'push', '-q', 'origin', 'main');
    git(writer, 'checkout', '-qb', 'heads/main');
    commit(writer, 'tracked.txt', 'wrong branch');
    git(writer, 'push', '-q', 'origin', 'HEAD:refs/heads/heads/main');
    const preview = syncDevRepo(runner);
    expect(preview.branch).toBe('main');
    const result = syncDevRepo(runner, {
      ...options(),
      expectedPlanFingerprint: preview.operationPlan.fingerprint,
    });
    expect(result.branch).toBe('main');
    expect(readFileSync(path.join(local, 'tracked.txt'), 'utf8')).toBe('right branch');
  });

  it.each([false, true])(
    'keeps changed local collision bytes after preview (ignored=%s)',
    (ignored) => {
      publishCollision('new.txt');
      if (ignored) writeFileSync(path.join(local, '.git', 'info', 'exclude'), 'new.txt\n');
      const collision = path.join(local, 'new.txt');
      writeFileSync(collision, Buffer.from([0xfe, 0]));
      const expectedPlanFingerprint = syncDevRepo(runner).operationPlan.fingerprint;
      writeFileSync(collision, Buffer.from([0xff, 0]));
      expect(() =>
        syncDevRepo(runner, { ...options(), discardLocal: true, expectedPlanFingerprint })
      ).toThrow('Operation plan fingerprint does not match.');
      expect(readFileSync(collision)).toEqual(Buffer.from([0xff, 0]));
      expect(calls.some((call) => call.startsWith('fetch ') || call.startsWith('reset '))).toBe(
        false
      );
    }
  );

  it('checks the contents of an obstructing directory again after fetch', () => {
    publishCollision('notes');
    const nested = path.join(local, 'notes', 'nested');
    mkdirSync(nested, { recursive: true });
    const draft = path.join(nested, '草稿-📝');
    writeFileSync(draft, 'first version');
    const expectedPlanFingerprint = syncDevRepo(runner).operationPlan.fingerprint;
    const editingRunner: DevCommandRunner = (command, args, settings) => {
      const result = runner(command, args, settings);
      if (args[0] === 'fetch') writeFileSync(draft, 'second version');
      return result;
    };
    expect(() =>
      syncDevRepo(editingRunner, { ...options(), discardLocal: true, expectedPlanFingerprint })
    ).toThrow('Discard risk changed after fetching.');
    expect(readFileSync(draft, 'utf8')).toBe('second version');
    expect(calls.some((call) => call.startsWith('reset '))).toBe(false);
  });

  it.skipIf(process.platform === 'win32')(
    'binds the destination of an obstructing link without following it',
    () => {
      publishCollision('new.txt');
      const link = path.join(local, 'new.txt');
      const outside = path.join(root, 'outside');
      writeFileSync(outside, 'external data');
      symlinkSync(outside, link);
      const expectedPlanFingerprint = syncDevRepo(runner).operationPlan.fingerprint;
      writeFileSync(outside, 'updated external data');
      expect(syncDevRepo(runner).operationPlan.fingerprint).toBe(expectedPlanFingerprint);
      rmSync(link);
      symlinkSync('dangling', link);
      expect(() =>
        syncDevRepo(runner, { ...options(), discardLocal: true, expectedPlanFingerprint })
      ).toThrow('Operation plan fingerprint does not match.');
      expect(readlinkSync(link)).toBe('dangling');
      const updated = syncDevRepo(runner).operationPlan.fingerprint;
      expect(
        syncDevRepo(runner, { ...options(), discardLocal: true, expectedPlanFingerprint: updated })
          .status
      ).toBe('ok');
      expect(readFileSync(outside, 'utf8')).toBe('updated external data');
    }
  );

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'refuses a reset if a file inside an obstructing directory cannot be read',
    () => {
      publishCollision('notes');
      const directory = path.join(local, 'notes');
      mkdirSync(directory);
      const draft = path.join(directory, 'draft');
      writeFileSync(draft, 'local content', { mode: 0o000 });
      try {
        expect(() => syncDevRepo(runner, { ...options(), discardLocal: true })).toThrow(
          'Could not verify a path that the reset would discard.'
        );
        expect(calls.some((call) => call.startsWith('fetch ') || call.startsWith('reset '))).toBe(
          false
        );
      } finally {
        chmodSync(draft, 0o600);
      }
      expect(readFileSync(draft, 'utf8')).toBe('local content');
    }
  );

  it('rejects a stale plan at the domain entry point before fetching', () => {
    const expectedPlanFingerprint = syncDevRepo(runner).operationPlan?.fingerprint;
    writeFileSync(path.join(local, 'tracked.txt'), 'edited since preview');
    const confirmed = { ...options(), discardLocal: true, expectedPlanFingerprint };
    expect(() => syncDevRepo(runner, confirmed)).toThrow(
      'Operation plan fingerprint does not match.'
    );
    expect(calls.some((call) => call.startsWith('fetch '))).toBe(false);
    expect(readFileSync(path.join(local, 'tracked.txt'), 'utf8')).toBe('edited since preview');
  });

  it('binds confirmations to the worktree and origin without exposing the origin URL', () => {
    const initial = syncDevRepo(runner, { cwd: local }).operationPlan;
    expect(syncDevRepo(runner, { cwd: writer }).operationPlan.fingerprint).not.toBe(
      initial.fingerprint
    );
    const alternate = path.join(root, 'different origin');
    git(local, 'remote', 'set-url', 'origin', alternate);
    const next = syncDevRepo(runner, { cwd: local }).operationPlan;
    expect(next.fingerprint).not.toBe(initial.fingerprint);
    expect(JSON.stringify(next)).not.toContain(alternate);
  });

  it('requires a new preview if fetching introduces a previously undisclosed discard', () => {
    writeFileSync(path.join(local, 'tracked.txt'), 'reviewed edit');
    writeFileSync(path.join(local, 'new.txt'), 'local notes');
    const expectedPlanFingerprint = syncDevRepo(runner).operationPlan.fingerprint;
    commit(writer, 'new.txt', 'new remote file');
    git(writer, 'push', '-q', 'origin', 'main');
    expect(() =>
      syncDevRepo(runner, { ...options(), discardLocal: true, expectedPlanFingerprint })
    ).toThrow('Discard risk changed after fetching.');
    expect(calls.some((call) => call.startsWith('reset '))).toBe(false);
    expect(readFileSync(path.join(local, 'new.txt'), 'utf8')).toBe('local notes');
  });

  it.each(['true', 'false'])(
    'checks the actual filesystem for aliases with core.ignorecase=%s',
    (setting) => {
      git(local, 'config', 'core.ignorecase', setting);
      writeFileSync(path.join(local, 'NOTES.txt'), 'local text');
      publishCollision('notes.txt');
      const paths = syncDevRepo(runner).operationPlan.subjects;
      if (existsSync(path.join(local, 'notes.txt'))) {
        expect(paths).toContain('git-obstructing-path:NOTES.txt');
        expect(() => syncDevRepo(runner, options())).toThrow(
          'Local Git changes require explicit discard confirmation.'
        );
      } else {
        expect(paths).not.toContain('git-obstructing-path:NOTES.txt');
        expect(syncDevRepo(runner, options()).status).toBe('ok');
      }
      expect(readFileSync(path.join(local, 'NOTES.txt'), 'utf8')).toBe('local text');
    }
  );

  it('checks nested aliases and keeps unrelated siblings in a shared directory', () => {
    git(local, 'config', 'core.ignorecase', 'false');
    mkdirSync(path.join(local, 'NOTES'));
    writeFileSync(path.join(local, 'NOTES', 'DRAFT'), 'local text');
    writeFileSync(path.join(local, 'NOTES', 'other'), 'local sibling');
    mkdirSync(path.join(writer, 'notes'));
    publishCollision('notes/draft');
    const subjects = syncDevRepo(runner).operationPlan.subjects;
    const collides = existsSync(path.join(local, 'notes', 'draft'));
    expect(subjects.includes('git-obstructing-path:NOTES/DRAFT')).toBe(collides);
    expect(subjects).not.toContain('git-obstructing-path:NOTES/other');
    if (collides)
      expect(() => syncDevRepo(runner, options())).toThrow(
        'Local Git changes require explicit discard confirmation.'
      );
    else expect(syncDevRepo(runner, options()).status).toBe('ok');
    expect(readFileSync(path.join(local, 'NOTES', 'DRAFT'), 'utf8')).toBe('local text');
  });

  it('bounds the total bytes hashed across an obstructing directory', () => {
    publishCollision('notes');
    const directory = path.join(local, 'notes');
    mkdirSync(directory);
    const draft = path.join(directory, 'large');
    writeFileSync(draft, '');
    truncateSync(draft, 64 * 1024 * 1024 + 1);
    expect(() => syncDevRepo(runner, { ...options(), discardLocal: true })).toThrow(
      'Reset obstruction inspection limit exceeded.'
    );
    expect(calls.some((call) => call.startsWith('reset '))).toBe(false);
    expect(existsSync(draft)).toBe(true);
  });

  it('bounds the number of entries inspected in an obstructing directory', () => {
    publishCollision('notes');
    const directory = path.join(local, 'notes');
    mkdirSync(directory);
    // The parent directory itself also counts toward the 4096-entry limit.
    for (let i = 0; i < 4096; i++) writeFileSync(path.join(directory, String(i)), '');
    expect(() => syncDevRepo(runner, { ...options(), discardLocal: true })).toThrow(
      'Reset obstruction inspection limit exceeded.'
    );
    expect(calls.some((call) => call.startsWith('reset '))).toBe(false);
  });

  it.skipIf(process.platform === 'win32')(
    'rejects an obstructing FIFO without reading from it',
    () => {
      publishCollision('notes');
      const fifo = path.join(local, 'notes');
      execFileSync('mkfifo', [fifo]);
      expect(() => syncDevRepo(runner, { ...options(), discardLocal: true })).toThrow(
        'Could not verify a path that the reset would discard.'
      );
      expect(calls.some((call) => call.startsWith('reset '))).toBe(false);
      expect(existsSync(fifo)).toBe(true);
    }
  );

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
    expect(calls).not.toContain('fetch origin +refs/heads/main:refs/remotes/origin/main');
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
    expect(calls).not.toContain('fetch origin +refs/heads/main:refs/remotes/origin/main');
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
    expect(calls).toContain('fetch origin +refs/heads/main:refs/remotes/origin/main');
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

  it('allows noncolliding files in a shared directory and identifies a nested collision precisely', () => {
    mkdirSync(path.join(writer, 'notes'));
    commit(writer, 'notes/remote.txt', 'from origin');
    git(writer, 'push', '-q', 'origin', 'main');
    git(local, 'fetch', '-q', 'origin');
    mkdirSync(path.join(local, 'notes'));
    writeFileSync(path.join(local, 'notes', 'local.txt'), 'keep');
    const collision = path.join(local, 'notes', 'remote.txt');
    writeFileSync(collision, 'not published');
    expect(syncDevRepo(runner).operationPlan.subjects).toContain(
      'git-obstructing-path:notes/remote.txt'
    );
    rmSync(collision);
    expect(syncDevRepo(runner, options()).status).toBe('ok');
    expect(readFileSync(path.join(local, 'notes', 'local.txt'), 'utf8')).toBe('keep');
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
    expect(calls).not.toContain('fetch origin +refs/heads/main:refs/remotes/origin/main');
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
