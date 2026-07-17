import { describe, expect, it } from 'vitest';
import {
  DEV_DOMAIN,
  getDevStatus,
  previewDevCommit,
  reviewDevChanges,
  syncDevRepo,
  type DevCommandRunner,
} from './index';

describe('dev domain', () => {
  it('declares developer workflow commands', () => {
    expect(DEV_DOMAIN.name).toBe('dev');
    expect(DEV_DOMAIN.commands.map((command) => command.name)).toEqual([
      'commit',
      'review',
      'status',
      'sync',
    ]);
    expect(DEV_DOMAIN.capabilities).toMatchObject({
      modifiesGit: true,
      usesNetwork: true,
      accessesSecrets: true,
    });
    expect(DEV_DOMAIN.commands.find((command) => command.name === 'review')?.sensitive).toBe(true);
  });

  it('previews a commit message from staged changes', () => {
    const runner: DevCommandRunner = (_command, args) => {
      if (args.join(' ') === 'diff --cached --name-only') {
        return 'packages/dev/src/index.ts\npackages/dev/src/index.test.ts';
      }

      if (args.join(' ') === 'diff --cached --numstat') {
        return '10\t2\tpackages/dev/src/index.ts\n5\t0\tpackages/dev/src/index.test.ts';
      }

      if (args.join(' ') === 'diff --cached --unified=0') {
        return '';
      }

      throw new Error('unexpected git command');
    };

    expect(previewDevCommit(runner)).toEqual({
      schemaVersion: 1,
      status: 'ok',
      source: 'staged',
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
      suggestion: {
        type: 'feat',
        scope: 'dev',
        subject: 'update dev',
        title: 'feat(dev): update dev',
        body: ['Staged files: 2.', 'Change size: +15/-2.', 'Categories: source=1, test=1.'],
      },
      message: 'feat(dev): update dev',
      findings: [],
      recommendedChecks: ['corepack pnpm build', 'corepack pnpm test'],
    });
  });

  it('includes staged risk findings in commit preview', () => {
    const runner: DevCommandRunner = (_command, args) => {
      if (args.join(' ') === 'diff --cached --name-only') {
        return 'packages/dev/src/index.ts\ndist/cli.js';
      }

      if (args.join(' ') === 'diff --cached --numstat') {
        return '1\t0\tpackages/dev/src/index.ts\n1\t0\tdist/cli.js';
      }

      if (args.join(' ') === 'diff --cached --unified=0') {
        return [
          'diff --git a/packages/dev/src/index.ts b/packages/dev/src/index.ts',
          '@@ -1,0 +1 @@',
          '+const token = "ghp_' + 'abcdefghijklmnopqrstuvwxyz123456";',
        ].join('\n');
      }

      throw new Error('unexpected git command');
    };

    expect(previewDevCommit(runner)).toMatchObject({
      message: 'feat(dev): update dev',
      findings: expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          priority: 'medium',
          category: 'test',
          title: 'Tests not detected',
        }),
        expect.objectContaining({
          severity: 'warning',
          priority: 'high',
          category: 'quality',
          title: 'Generated artifact staged',
          filePath: 'dist/cli.js',
        }),
        expect.objectContaining({
          severity: 'warning',
          priority: 'high',
          category: 'security',
          title: 'Secret-like literal added',
          filePath: 'packages/dev/src/index.ts',
        }),
      ]),
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
          startLine: 1,
          endLine: 3,
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
          line: 2,
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

  it('keeps added-line parsing accurate for diff-like content and metadata', () => {
    const runner: DevCommandRunner = (_command, args) => {
      if (args.join(' ') === 'diff --cached --name-only') {
        return 'packages/dev/src/a.ts\npackages/dev/src/b.ts';
      }

      if (args.join(' ') === 'diff --cached --numstat') {
        return '1\t0\tpackages/dev/src/a.ts\n1\t0\tpackages/dev/src/b.ts';
      }

      if (args.join(' ') === 'diff --cached --unified=0') {
        return [
          'diff --git a/packages/dev/src/a.ts b/packages/dev/src/a.ts',
          '@@ -0,0 +1 @@',
          '+++counter',
          '\\ No newline at end of file',
          'diff --git a/packages/dev/src/b.ts b/packages/dev/src/b.ts',
          'new file mode 100644',
          '--- /dev/null',
          '+++ b/packages/dev/src/b.ts',
          '@@ -0,0 +1 @@',
          '+fetch("https://example.com")',
        ].join('\n');
      }

      throw new Error('unexpected git command');
    };

    const review = reviewDevChanges(runner, { mode: 'staged' });

    expect(review.diffHunks).toEqual([
      {
        filePath: 'packages/dev/src/a.ts',
        header: '@@ -0,0 +1 @@',
        addedLines: 1,
        removedLines: 0,
        startLine: 1,
        endLine: 1,
      },
      {
        filePath: 'packages/dev/src/b.ts',
        header: '@@ -0,0 +1 @@',
        addedLines: 1,
        removedLines: 0,
        startLine: 1,
        endLine: 1,
      },
    ]);
    expect(review.findings).toContainEqual(
      expect.objectContaining({
        title: 'Network access added',
        filePath: 'packages/dev/src/b.ts',
        line: 1,
      })
    );
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
          startLine: 5,
          endLine: 5,
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
          line: 5,
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
          '+const token = "ghp_' + 'abcdefghijklmnopqrstuvwxyz123456";',
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
        return '## codex/work...origin/codex/work [ahead 1]\nM  packages/dev/src/index.ts\n M README.md\n?? scratch.md\nR  old.txt -> new.txt\nA  "quoted file.txt"';
      }

      throw new Error('unexpected git command');
    };

    expect(getDevStatus(runner)).toEqual({
      schemaVersion: 1,
      status: 'ok',
      branch: 'codex/work',
      clean: false,
      ahead: 1,
      behind: 0,
      staged: ['packages/dev/src/index.ts', 'new.txt', 'quoted file.txt'],
      unstaged: ['README.md'],
      untracked: ['scratch.md'],
    });
  });

  it('rejects commit preview when there are no staged changes', () => {
    const runner: DevCommandRunner = () => '';

    expect(() => previewDevCommit(runner)).toThrow('No staged changes found.');
  });

  it('previews and performs dev sync operations', () => {
    const runner: DevCommandRunner = (_command, args) => {
      if (args.join(' ') === 'status --short --branch') {
        return '## main...origin/main\n';
      }
      if (args.join(' ') === 'rev-parse HEAD') {
        return 'commit_hash_123';
      }
      if (args.join(' ') === 'fetch origin') {
        return 'fetched';
      }
      if (args.join(' ') === 'reset --hard origin/main') {
        return 'reset';
      }
      throw new Error('unexpected git command: ' + args.join(' '));
    };

    expect(syncDevRepo(runner)).toMatchObject({
      schemaVersion: 1,
      status: 'preview',
      branch: 'main',
      previousCommit: 'commit_hash_123',
      currentCommit: 'commit_hash_123',
      output: 'Preview: ZaoWu will run `git fetch origin` and `git reset --hard origin/main`.',
      operationPlan: {
        risk: 'high',
        confirmationRequired: true,
        reads: ['current Git branch', 'current HEAD commit', 'current Git status'],
        executes: ['git fetch origin', 'git reset --hard origin/main'],
        network: ['git remote origin'],
      },
    });

    expect(syncDevRepo(runner, { yes: true })).toMatchObject({
      schemaVersion: 1,
      status: 'ok',
      branch: 'main',
      previousCommit: 'commit_hash_123',
      currentCommit: 'commit_hash_123',
      output: 'Successfully synchronized branch `main` to `origin/main`.',
      operationPlan: {
        risk: 'high',
        confirmationRequired: false,
        executes: ['git fetch origin', 'git reset --hard origin/main'],
        network: ['git remote origin'],
      },
    });
  });

  it('requires explicit discard confirmation before dev sync discards local state', () => {
    const calls: string[] = [];
    const runner: DevCommandRunner = (_command, args) => {
      calls.push(args.join(' '));
      if (args.join(' ') === 'status --short --branch') {
        return '## main...origin/main [ahead 2]\nM  packages/dev/src/index.ts\n M README.md\n';
      }
      if (args.join(' ') === 'rev-parse HEAD') {
        return 'commit_hash_123';
      }
      if (args.join(' ') === 'fetch origin') {
        return 'fetched';
      }
      if (args.join(' ') === 'reset --hard origin/main') {
        return 'reset';
      }
      throw new Error('unexpected git command: ' + args.join(' '));
    };

    expect(syncDevRepo(runner).output).toContain('--yes --discard-local');
    expect(() => syncDevRepo(runner, { yes: true })).toThrow(
      'Local Git changes require explicit discard confirmation.'
    );
    expect(calls).not.toContain('fetch origin');

    expect(syncDevRepo(runner, { yes: true, discardLocal: true })).toMatchObject({
      status: 'ok',
      operationPlan: {
        confirmationRequired: false,
        notes: expect.arrayContaining([
          'Local discard risk: 1 staged file(s), 1 unstaged file(s), 2 local commit(s) ahead of origin/main.',
        ]),
      },
    });
  });

  it('parses quoted file paths with spaces correctly', () => {
    const runner: DevCommandRunner = (_command, args) => {
      if (args.join(' ') === 'diff --cached --name-only') {
        return '"some folder/file with spaces.ts"';
      }
      if (args.join(' ') === 'diff --cached --numstat') {
        return '2\t1\t"some folder/file with spaces.ts"';
      }
      if (args.join(' ') === 'diff --cached --unified=0') {
        return [
          'diff --git a/"some folder/file with spaces.ts" b/"some folder/file with spaces.ts"',
          '@@ -1 +1,2 @@',
          '-old',
          '+new',
        ].join('\n');
      }
      throw new Error('unexpected git command: ' + args.join(' '));
    };

    expect(reviewDevChanges(runner, { mode: 'staged' })).toMatchObject({
      diffHunks: [
        {
          filePath: 'some folder/file with spaces.ts',
          header: '@@ -1 +1,2 @@',
          addedLines: 1,
          removedLines: 1,
        },
      ],
    });
  });
});
