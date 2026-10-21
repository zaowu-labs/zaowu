import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMAND_CONTRACTS } from './command-contracts';
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
      expect(lines.slice(0, 15)).toEqual([
        'ZaoWu Init',
        'No files were written.',
        'Would create:',
        'zw.yml',
        'Operation plan:',
        'Risk: medium',
        'Confirmation required: yes',
        expect.stringMatching(/^Fingerprint: [a-f0-9]{64}$/),
        expect.stringMatching(/^Base confirmation flags: --yes --plan-fingerprint [a-f0-9]{64}$/),
        'Subjects:',
        expect.stringMatching(
          new RegExp(`^- init:<root>${path.sep.replace('\\', '\\\\')}zw\\.yml$`)
        ),
        expect.stringMatching(/^- content-sha256:[a-f0-9]{64}$/),
        expect.stringMatching(/^- content-length:\d+$/),
        'Read:',
        `- <root>${path.sep}zw.yml`,
      ]);
      expect(lines).toContain('Write:');
      expect(lines).toContain(`- <root>${path.sep}zw.yml`);
      expect(lines).toContain('To create exactly this file, run:');
      expect(lines).toContainEqual(
        expect.stringMatching(/^zw init --yes --plan-fingerprint [a-f0-9]{64}$/)
      );
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
        '- pnpm: ok 10.34.1 optional for CLI use; required for repository development',
        '- Config: missing',
        '- AI provider: ok echo (local, configured)',
        `- Command matrix: ok ${COMMAND_CONTRACTS.length + 3} command surface(s) tracked`,
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
    const lines = getStableLines(result.stdout);
    expect(lines.slice(0, 15)).toEqual([
      'ZaoWu AI Ask',
      'Status: preview',
      'Provider: openai (OpenAI)',
      'Model: gpt-4.1-mini',
      'Endpoint: https://api.openai.com/v1/responses',
      'Operation plan:',
      'Risk: medium',
      'Confirmation required: yes',
      expect.stringMatching(/^Fingerprint: [a-f0-9]{64}$/),
      expect.stringMatching(/^Base confirmation flags: --yes --plan-fingerprint [a-f0-9]{64}$/),
      'Subjects:',
      '- ai:openai',
      '- model:gpt-4.1-mini',
      expect.stringMatching(/^- content-sha256:[a-f0-9]{64}$/),
      '- content-length:13',
    ]);
    expect(lines).toContain('No targets: Read, Write, Delete, Execute.');
    expect(result.stdout).toContain('No provider request was sent.');
    expect(lines).toContain('To send exactly this AI request, run:');
    expect(lines).toContainEqual(
      expect.stringMatching(
        /^zw ai ask --provider openai --yes --plan-fingerprint [a-f0-9]{64} -- Explain ZaoWu$/
      )
    );
  });

  it('keeps dev review findings prioritized in human output', async () => {
    const result = await executeCli(['dev', 'review', '--staged'], {
      commandRunner: (_command, args) => {
        if (
          args.join(' ') === 'diff --cached --name-only -z --no-ext-diff --no-textconv --no-color'
        ) {
          return 'packages/dev/src/index.ts\npackages/dev/src/index.test.ts';
        }

        if (
          args.join(' ') === 'diff --cached --numstat -z --no-ext-diff --no-textconv --no-color'
        ) {
          return '1\t0\tpackages/dev/src/index.ts\n1\t0\tpackages/dev/src/index.test.ts';
        }

        if (args.join(' ') === 'diff --cached --unified=0 --no-ext-diff --no-textconv --no-color') {
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
      '- warning/high/execution: Shell execution added (packages/dev/src/index.ts:11 @@ -10,0 +11 @@) - Added code appears to run shell commands; confirm preview or confirmation behavior.'
    );
  });

  it('keeps dev commit human output structured and read-only', async () => {
    const result = await executeCli(['dev', 'commit'], {
      commandRunner: (_command, args) => {
        if (
          args.join(' ') === 'diff --cached --name-only -z --no-ext-diff --no-textconv --no-color'
        ) {
          return 'packages/dev/src/index.ts';
        }

        if (
          args.join(' ') === 'diff --cached --numstat -z --no-ext-diff --no-textconv --no-color'
        ) {
          return '1\t0\tpackages/dev/src/index.ts';
        }

        if (args.join(' ') === 'diff --cached --unified=0 --no-ext-diff --no-textconv --no-color') {
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
      '- warning/high/execution: Shell execution added (packages/dev/src/index.ts:11 @@ -10,0 +11 @@) - Added code appears to run shell commands; confirm preview or confirmation behavior.'
    );
    expect(lines).toContain('Execute:');
    expect(lines).toContain('- git diff --cached');
  });

  it('keeps JSON errors machine-readable and stack-free', async () => {
    const result = await executeCli(['doc', 'search', 'missing.md', '', '--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    // We now emit the more specific DOCUMENT_SEARCH_KEYWORD_REQUIRED
    // (instead of the generic TARGET_REQUIRED the old helper produced).
    expect(JSON.parse(result.stderr)).toEqual({
      error: {
        code: 'DOCUMENT_SEARCH_KEYWORD_REQUIRED',
        message: 'Search keyword is required.',
        why: '`zw doc search` needs a non-empty keyword.',
        fix: 'Run `zw doc search README.md install`.',
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
        'Method: local extractive heuristic (first three prose lines)',
        'Lines: 4',
        'Words: 4',
        'Readable output matters.',
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
