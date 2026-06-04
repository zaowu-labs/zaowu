import { describe, expect, it } from 'vitest';
import {
  DEV_DOMAIN,
  getDevStatus,
  previewDevCommit,
  reviewDevChanges,
  type DevCommandRunner,
} from './index';

describe('dev domain', () => {
  it('declares developer workflow commands', () => {
    expect(DEV_DOMAIN.name).toBe('dev');
    expect(DEV_DOMAIN.commands.map((command) => command.name)).toEqual([
      'commit',
      'review',
      'status',
    ]);
  });

  it('previews a commit message from staged changes', () => {
    const runner: DevCommandRunner = (_command, args) => {
      if (args.join(' ') === 'diff --cached --name-only') {
        return 'packages/dev/src/index.ts\npackages/dev/src/index.test.ts';
      }

      if (args.join(' ') === 'diff --cached --numstat') {
        return '10\t2\tpackages/dev/src/index.ts\n5\t0\tpackages/dev/src/index.test.ts';
      }

      throw new Error('unexpected git command');
    };

    expect(previewDevCommit(runner)).toEqual({
      status: 'ok',
      source: 'staged',
      message: 'test: update dev',
      recommendedChecks: ['corepack pnpm build', 'corepack pnpm test'],
      summary: {
        files: ['packages/dev/src/index.ts', 'packages/dev/src/index.test.ts'],
        untrackedFiles: [],
        additions: 15,
        deletions: 2,
        categories: {
          source: 1,
          test: 1,
          docs: 0,
          dependency: 0,
          workflow: 0,
          config: 0,
          other: 0,
        },
      },
    });
  });

  it('reviews working-tree changes when no staged changes exist', () => {
    const runner: DevCommandRunner = (_command, args) => {
      if (args.join(' ') === 'diff --cached --name-only') {
        return '';
      }

      if (args.join(' ') === 'diff --name-only') {
        return 'packages/dev/src/index.ts';
      }

      if (args.join(' ') === 'diff --numstat') {
        return '3\t1\tpackages/dev/src/index.ts';
      }

      if (args.join(' ') === 'ls-files --others --exclude-standard') {
        return '';
      }

      if (args.join(' ') === 'diff --cached --numstat') {
        return '';
      }

      throw new Error('unexpected git command');
    };

    expect(reviewDevChanges(runner)).toMatchObject({
      status: 'ok',
      source: 'working-tree',
      summary: {
        files: ['packages/dev/src/index.ts'],
        untrackedFiles: [],
        additions: 3,
        deletions: 1,
      },
      findings: [
        {
          severity: 'info',
          title: 'Change size',
        },
        {
          severity: 'warning',
          title: 'Tests not detected',
        },
      ],
      recommendedChecks: ['corepack pnpm build', 'corepack pnpm test'],
    });
  });

  it('includes untracked files in working-tree review', () => {
    const runner: DevCommandRunner = (_command, args) => {
      if (args.join(' ') === 'diff --cached --name-only') {
        return '';
      }

      if (args.join(' ') === 'diff --cached --numstat') {
        return '';
      }

      if (args.join(' ') === 'diff --name-only') {
        return '';
      }

      if (args.join(' ') === 'diff --numstat') {
        return '';
      }

      if (args.join(' ') === 'ls-files --others --exclude-standard') {
        return 'scripts/verify-local.sh';
      }

      throw new Error('unexpected git command');
    };

    expect(reviewDevChanges(runner)).toMatchObject({
      status: 'ok',
      source: 'working-tree',
      summary: {
        files: ['scripts/verify-local.sh'],
        untrackedFiles: ['scripts/verify-local.sh'],
        categories: {
          workflow: 1,
        },
      },
      findings: [
        {
          severity: 'info',
          title: 'Change size',
        },
        {
          severity: 'warning',
          title: 'Untracked files detected',
        },
      ],
      recommendedChecks: [
        'corepack pnpm build',
        'corepack pnpm test',
        'corepack pnpm lint',
        'corepack pnpm format:check',
      ],
    });
  });

  it('reviews staged changes when explicitly requested', () => {
    const runner: DevCommandRunner = (_command, args) => {
      if (args.join(' ') === 'diff --cached --name-only') {
        return 'packages/dev/src/index.ts';
      }

      if (args.join(' ') === 'diff --cached --numstat') {
        return '3\t1\tpackages/dev/src/index.ts';
      }

      throw new Error('unexpected git command');
    };

    expect(reviewDevChanges(runner, { mode: 'staged' })).toMatchObject({
      source: 'staged',
      summary: {
        files: ['packages/dev/src/index.ts'],
      },
    });
  });

  it('parses Git status output', () => {
    const runner: DevCommandRunner = (_command, args) => {
      if (args.join(' ') === 'status --short --branch') {
        return '## codex/work...origin/codex/work [ahead 1]\nM  packages/dev/src/index.ts\n M README.md\n?? scratch.md';
      }

      throw new Error('unexpected git command');
    };

    expect(getDevStatus(runner)).toEqual({
      status: 'ok',
      branch: 'codex/work',
      clean: false,
      staged: ['packages/dev/src/index.ts'],
      unstaged: ['README.md'],
      untracked: ['scratch.md'],
    });
  });

  it('rejects commit preview when there are no staged changes', () => {
    const runner: DevCommandRunner = () => '';

    expect(() => previewDevCommit(runner)).toThrow('No staged changes found.');
  });
});
