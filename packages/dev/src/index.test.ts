import { describe, expect, it } from 'vitest';
import { DEV_DOMAIN, previewDevCommit, reviewDevChanges, type DevCommandRunner } from './index';

describe('dev domain', () => {
  it('declares developer workflow commands', () => {
    expect(DEV_DOMAIN.name).toBe('dev');
    expect(DEV_DOMAIN.commands.map((command) => command.name)).toEqual(['commit', 'review']);
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
      summary: {
        files: ['packages/dev/src/index.ts', 'packages/dev/src/index.test.ts'],
        additions: 15,
        deletions: 2,
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
    });
  });

  it('rejects commit preview when there are no staged changes', () => {
    const runner: DevCommandRunner = () => '';

    expect(() => previewDevCommit(runner)).toThrow('No staged changes found.');
  });
});
