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
      schemaVersion: 1,
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

      if (args.join(' ') === 'diff --unified=0') {
        return [
          'diff --git a/packages/dev/src/index.ts b/packages/dev/src/index.ts',
          '@@ -1 +1,3 @@',
          '-old',
          '+new',
          '+writeFile(path, content)',
        ].join('\n');
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
      schemaVersion: 1,
      status: 'ok',
      source: 'working-tree',
      summary: {
        files: ['packages/dev/src/index.ts'],
        untrackedFiles: [],
        additions: 3,
        deletions: 1,
      },
      diffHunks: [
        {
          filePath: 'packages/dev/src/index.ts',
          header: '@@ -1 +1,3 @@',
          addedLines: 2,
          removedLines: 1,
        },
      ],
      findings: [
        {
          severity: 'info',
          priority: 'low',
          category: 'summary',
          title: 'Change size',
        },
        {
          severity: 'warning',
          priority: 'medium',
          category: 'test',
          title: 'Tests not detected',
        },
        {
          severity: 'warning',
          priority: 'medium',
          category: 'test',
          title: 'Package tests not detected',
        },
        {
          severity: 'warning',
          priority: 'medium',
          category: 'filesystem',
          title: 'File mutation added',
          filePath: 'packages/dev/src/index.ts',
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

      if (args.join(' ') === 'diff --unified=0') {
        return '';
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
          priority: 'low',
          category: 'summary',
          title: 'Change size',
        },
        {
          severity: 'warning',
          priority: 'medium',
          category: 'git',
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

      if (args.join(' ') === 'diff --cached --unified=0') {
        return [
          'diff --git a/packages/dev/src/index.ts b/packages/dev/src/index.ts',
          '@@ -4,0 +5 @@',
          '+fetch("https://example.com")',
        ].join('\n');
      }

      throw new Error('unexpected git command');
    };

    expect(reviewDevChanges(runner, { mode: 'staged' })).toMatchObject({
      schemaVersion: 1,
      source: 'staged',
      summary: {
        files: ['packages/dev/src/index.ts'],
      },
      diffHunks: [
        {
          filePath: 'packages/dev/src/index.ts',
          addedLines: 1,
          removedLines: 0,
        },
      ],
      findings: [
        {
          title: 'Change size',
        },
        {
          title: 'Tests not detected',
        },
        {
          title: 'Package tests not detected',
        },
        {
          title: 'Network access added',
          filePath: 'packages/dev/src/index.ts',
        },
      ],
    });
  });

  it('does not flag sensitive keywords in documentation-only diffs', () => {
    const runner: DevCommandRunner = (_command, args) => {
      if (args.join(' ') === 'diff --cached --name-only') {
        return 'docs/experience/ZW_AUTO_EXECUTION.md';
      }

      if (args.join(' ') === 'diff --cached --numstat') {
        return '2\t0\tdocs/experience/ZW_AUTO_EXECUTION.md';
      }

      if (args.join(' ') === 'diff --cached --unified=0') {
        return [
          'diff --git a/docs/experience/ZW_AUTO_EXECUTION.md b/docs/experience/ZW_AUTO_EXECUTION.md',
          '@@ -1,0 +2,2 @@',
          '+Shell execution remains blocked even when docs mention execFileSync.',
          '+Network execution remains blocked even when docs mention ' +
            'fet' +
            'ch("https://example.com").',
        ].join('\n');
      }

      throw new Error('unexpected git command');
    };

    const titles = reviewDevChanges(runner, { mode: 'staged' }).findings.map(
      (finding) => finding.title
    );

    expect(titles).not.toContain('Shell execution added');
    expect(titles).not.toContain('Network access added');
    expect(titles).not.toContain('File mutation added');
  });

  it('flags package manifest and lockfile consistency risks', () => {
    const runner: DevCommandRunner = (_command, args) => {
      if (args.join(' ') === 'diff --cached --name-only') {
        return 'packages/auto/package.json';
      }

      if (args.join(' ') === 'diff --cached --numstat') {
        return '1\t0\tpackages/auto/package.json';
      }

      if (args.join(' ') === 'diff --cached --unified=0') {
        return '';
      }

      throw new Error('unexpected git command');
    };

    expect(reviewDevChanges(runner, { mode: 'staged' }).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          title: 'Dependency metadata changed',
        }),
        expect.objectContaining({
          severity: 'warning',
          title: 'Package manifest without lockfile',
        }),
      ])
    );
  });

  it('prioritizes secret-like literals and destructive Git commands', () => {
    const runner: DevCommandRunner = (_command, args) => {
      if (args.join(' ') === 'diff --cached --name-only') {
        return 'packages/dev/src/index.ts';
      }

      if (args.join(' ') === 'diff --cached --numstat') {
        return '2\t0\tpackages/dev/src/index.ts';
      }

      if (args.join(' ') === 'diff --cached --unified=0') {
        return [
          'diff --git a/packages/dev/src/index.ts b/packages/dev/src/index.ts',
          '@@ -1,0 +1,2 @@',
          '+const token = "ghp_abcdefghijklmnopqrstuvwxyz123456";',
          '+execFileSync("git", ["reset", "--hard"])',
        ].join('\n');
      }

      throw new Error('unexpected git command');
    };

    expect(reviewDevChanges(runner, { mode: 'staged' }).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          priority: 'high',
          category: 'security',
          title: 'Secret-like literal added',
          filePath: 'packages/dev/src/index.ts',
        }),
        expect.objectContaining({
          severity: 'warning',
          priority: 'high',
          category: 'git',
          title: 'Destructive Git command added',
          filePath: 'packages/dev/src/index.ts',
        }),
      ])
    );
  });

  it('flags package source changes without matching package tests', () => {
    const runner: DevCommandRunner = (_command, args) => {
      if (args.join(' ') === 'diff --cached --name-only') {
        return [
          'packages/dev/src/index.ts',
          'packages/dev/src/index.test.ts',
          'packages/auto/src/index.ts',
        ].join('\n');
      }

      if (args.join(' ') === 'diff --cached --numstat') {
        return [
          '1\t0\tpackages/dev/src/index.ts',
          '1\t0\tpackages/dev/src/index.test.ts',
          '1\t0\tpackages/auto/src/index.ts',
        ].join('\n');
      }

      if (args.join(' ') === 'diff --cached --unified=0') {
        return '';
      }

      throw new Error('unexpected git command');
    };

    expect(reviewDevChanges(runner, { mode: 'staged' }).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          title: 'Package tests not detected',
          detail:
            'Source changed in package(s) auto, but no matching package test file changed in this diff.',
        }),
      ])
    );
  });

  it('flags lockfile changes without package manifests', () => {
    const runner: DevCommandRunner = (_command, args) => {
      if (args.join(' ') === 'diff --cached --name-only') {
        return 'pnpm-lock.yaml';
      }

      if (args.join(' ') === 'diff --cached --numstat') {
        return '1\t1\tpnpm-lock.yaml';
      }

      if (args.join(' ') === 'diff --cached --unified=0') {
        return '';
      }

      throw new Error('unexpected git command');
    };

    expect(reviewDevChanges(runner, { mode: 'staged' }).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          title: 'Lockfile without package manifest',
        }),
      ])
    );
  });

  it('parses Git status output', () => {
    const runner: DevCommandRunner = (_command, args) => {
      if (args.join(' ') === 'status --short --branch') {
        return '## codex/work...origin/codex/work [ahead 1]\nM  packages/dev/src/index.ts\n M README.md\n?? scratch.md';
      }

      throw new Error('unexpected git command');
    };

    expect(getDevStatus(runner)).toEqual({
      schemaVersion: 1,
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
