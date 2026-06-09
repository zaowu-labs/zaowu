import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { executeCli } from './run';

const getStableLines = (value: string, root?: string): string[] =>
  (root ? value.replaceAll(root, '<root>') : value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

describe('golden command output contracts', () => {
  it('keeps init preview human output structured and non-writing', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-golden-'));

    try {
      const result = await executeCli(['init'], { cwd: root });
      const lines = getStableLines(result.stdout, root);

      expect(result.exitCode).toBe(0);
      expect(lines.slice(0, 12)).toEqual([
        'ZaoWu Init',
        'No files were written.',
        'Would create:',
        'zw.yml',
        'Operation plan:',
        'Risk: medium',
        'Confirmation required: yes',
        expect.stringMatching(/^Fingerprint: [a-f0-9]{64}$/),
        `Subjects: init:<root>${path.sep}zw.yml`,
        `Writes: <root>${path.sep}zw.yml`,
        'Deletes: none',
        'Preview:',
      ]);
      expect(lines).toContain('To create this file, run:');
      expect(lines).toContain('zw init --yes');
      expect(result.stdout).not.toContain('undefined');
      expect(result.stdout).not.toContain('null');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps doctor human output actionable with mocked diagnostics', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-golden-'));

    try {
      const result = await executeCli(['doctor'], {
        cwd: root,
        nodeVersion: '20.19.0',
        commandRunner: (command, args) => {
          if (command === 'git') {
            return 'git version 2.44.0';
          }

          if (command === 'pnpm') {
            return '10.34.1';
          }

          if (command === 'corepack' && args.join(' ') === 'pnpm --version') {
            return '10.34.1';
          }

          throw new Error('unexpected command');
        },
      });

      expect(result.exitCode).toBe(0);
      expect(getStableLines(result.stdout)).toEqual([
        'ZaoWu Doctor',
        'Status: Warning',
        'Checks:',
        '- Node.js: ok v20.19.0',
        '- Git: ok 2.44.0',
        '- pnpm: ok 10.34.1',
        '- Config: missing',
        'Next steps:',
        '1. Run `zw init` to preview config creation, then `zw init --yes` to create it.',
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps network AI preview explicit before sending requests', async () => {
    const result = await executeCli(['ai', 'ask', 'Explain', 'ZaoWu', '--provider', 'openai']);

    expect(result.exitCode).toBe(0);
    expect(getStableLines(result.stdout).slice(0, 18)).toEqual([
      'ZaoWu AI Ask',
      'Status: preview',
      'Provider: openai (OpenAI)',
      'Model: gpt-4.1-mini',
      'Operation plan:',
      'Risk: medium',
      'Confirmation required: yes',
      expect.stringMatching(/^Fingerprint: [a-f0-9]{64}$/),
      'Subjects:',
      '- ai:openai',
      '- model:gpt-4.1-mini',
      'Read:',
      '- none',
      'Write:',
      '- none',
      'Delete:',
      '- none',
      'Execute:',
    ]);
    expect(result.stdout).toContain('No provider request was sent.');
  });

  it('keeps dev review findings prioritized in human output', async () => {
    const result = await executeCli(['dev', 'review', '--staged'], {
      commandRunner: (_command, args) => {
        if (args.join(' ') === 'diff --cached --name-only') {
          return 'packages/dev/src/index.ts\npackages/dev/src/index.test.ts';
        }

        if (args.join(' ') === 'diff --cached --numstat') {
          return '1\t0\tpackages/dev/src/index.ts\n1\t0\tpackages/dev/src/index.test.ts';
        }

        if (args.join(' ') === 'diff --cached --unified=0') {
          return [
            'diff --git a/packages/dev/src/index.ts b/packages/dev/src/index.ts',
            '@@ -10,0 +11 @@',
            '+exec' + 'FileSync("git", ["status"])',
          ].join('\n');
        }

        throw new Error('unexpected command');
      },
    });

    const lines = getStableLines(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(lines).toContain('Findings:');
    expect(lines).toContain('- info/low/summary: Change size - 2 file(s), +2/-0.');
    expect(lines).toContain(
      '- warning/high/execution: Shell execution added (packages/dev/src/index.ts @@ -10,0 +11 @@) - Added code appears to run shell commands; confirm preview or confirmation behavior.'
    );
  });

  it('keeps dev commit human output structured and read-only', async () => {
    const result = await executeCli(['dev', 'commit'], {
      commandRunner: (_command, args) => {
        if (args.join(' ') === 'diff --cached --name-only') {
          return 'packages/dev/src/index.ts';
        }

        if (args.join(' ') === 'diff --cached --numstat') {
          return '1\t0\tpackages/dev/src/index.ts';
        }

        if (args.join(' ') === 'diff --cached --unified=0') {
          return [
            'diff --git a/packages/dev/src/index.ts b/packages/dev/src/index.ts',
            '@@ -10,0 +11 @@',
            '+exec' + 'FileSync("git", ["status"])',
          ].join('\n');
        }

        throw new Error('unexpected command');
      },
    });

    const lines = getStableLines(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(lines).toContain('No Git state was modified.');
    expect(lines).toContain('Suggested commit:');
    expect(lines).toContain('feat(dev): update dev');
    expect(lines).toContain('Suggested body:');
    expect(lines).toContain('- Staged files: 1.');
    expect(lines).toContain('Findings:');
    expect(lines).toContain(
      '- warning/high/execution: Shell execution added (packages/dev/src/index.ts @@ -10,0 +11 @@) - Added code appears to run shell commands; confirm preview or confirmation behavior.'
    );
    expect(lines).toContain('Execute:');
    expect(lines).toContain('- git diff --cached');
  });

  it('keeps JSON errors machine-readable and stack-free', async () => {
    const result = await executeCli(['doc', 'search', 'missing.md', '', '--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({
      error: {
        code: 'TARGET_REQUIRED',
        message: 'keyword is required.',
        why: '`zw doc search` needs keyword as its second argument.',
        fix: 'Run `zw doc search --help` to see the expected usage.',
        exitCode: 1,
      },
    });
    expect(result.stderr).not.toContain('at ');
  });

  it('keeps document summary output compact for human use', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-golden-'));
    const filePath = path.join(root, 'note.md');

    await writeFile(filePath, '# ZaoWu\n\nReadable output matters.\n', 'utf8');

    try {
      const result = await executeCli(['doc', 'summary', filePath]);

      expect(result.exitCode).toBe(0);
      expect(getStableLines(result.stdout).filter((line) => !line.startsWith('File:'))).toEqual([
        'ZaoWu Doc Summary',
        'Title: ZaoWu',
        'Lines: 4',
        'Words: 4',
        'Readable output matters.',
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
