import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeCli } from './run';

const args = ['ai', 'ask', 'Summarize', '--stdin', '--json'];
const stdin = (text: string | Buffer) => Readable.from([Buffer.from(text)]);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('zw ai ask --stdin', () => {
  it('accepts UTF-8 across chunks and preserves the piped content', async () => {
    const raw = Buffer.from('  工程\nnext\n');
    const result = await executeCli([...args, '--provider', 'echo'], {
      stdin: Readable.from([raw.subarray(0, 3), raw.subarray(3)]),
    });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: 'ok',
      input: { source: 'prompt+stdin', promptCharacters: 9, stdinCharacters: 10 },
      output: expect.stringContaining('Standard input:\n  工程\nnext\n'),
      operationPlan: { reads: ['standard input (stdin)'], network: [] },
    });
  });

  it('reads only when the option is present and supports a pipe without a prompt', async () => {
    const source = stdin('piped context');
    const promptOnly = await executeCli(['ai', 'ask', 'prompt', '--provider', 'echo', '--json'], {
      stdin: source,
    });
    expect(JSON.parse(promptOnly.stdout).input.source).toBe('prompt');
    const stdinOnly = await executeCli(['ai', 'ask', '--stdin', '--provider', 'echo', '--json'], {
      stdin: source,
    });
    expect(JSON.parse(stdinOnly.stdout).input).toMatchObject({
      source: 'stdin',
      promptCharacters: 0,
      stdinCharacters: 13,
    });
  });

  it.each([
    ['empty', '', 'AI_INPUT_STDIN_REQUIRED'],
    ['blank', ' \n\t', 'AI_INPUT_STDIN_REQUIRED'],
    ['NUL byte', Buffer.from([0]), 'AI_INPUT_STDIN_READ_FAILED'],
    ['invalid UTF-8', Buffer.from([0xff]), 'AI_INPUT_STDIN_READ_FAILED'],
    ['incomplete UTF-8', Buffer.from([0xe5, 0xb7]), 'AI_INPUT_STDIN_READ_FAILED'],
    ['too many characters', 'a'.repeat(200_001), 'AI_INPUT_TOO_LARGE'],
    ['combined limit', 'a'.repeat(200_000), 'AI_INPUT_TOO_LARGE'],
  ])('rejects %s before sending a request', async (_label, text, code) => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    const result = await executeCli([...args, '--provider', 'ollama', '--yes'], {
      stdin: stdin(text),
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr).error.code).toBe(code);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requires a pipe and rejects conflicting input options before reading', async () => {
    const missing = await executeCli([...args, '--provider', 'echo']);
    expect(JSON.parse(missing.stderr).error.code).toBe('AI_INPUT_STDIN_REQUIRED');
    const read = vi.fn();
    const conflict = await executeCli([...args, '--file', 'other.txt', '--provider', 'echo'], {
      stdin: new Readable({ read }),
    });
    expect(JSON.parse(conflict.stderr).error.code).toBe('OPTION_VALUE_INVALID');
    expect(read).not.toHaveBeenCalled();
  });

  it('reports a failed pipe without exposing upstream error details', async () => {
    const source = new Readable({
      read() {
        this.destroy(new Error('private upstream detail'));
      },
    });
    const result = await executeCli([...args, '--provider', 'echo'], { stdin: source });
    expect(JSON.parse(result.stderr).error.code).toBe('AI_INPUT_STDIN_READ_FAILED');
    expect(result.stderr).not.toContain('private upstream detail');
  });

  it('cancels while waiting for input with exit code 130', async () => {
    const controller = new AbortController();
    const source = new Readable({ read: () => queueMicrotask(() => controller.abort()) });
    const result = await executeCli([...args, '--provider', 'echo'], {
      stdin: source,
      signal: controller.signal,
    });
    expect(result.exitCode).toBe(130);
    expect(JSON.parse(result.stderr).error.code).toBe('AI_REQUEST_CANCELLED');
    expect(source.destroyed).toBe(true);
  });

  it('previews, rejects a changed pipe, and sends only the confirmed input', async () => {
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        Response.json({ response: 'model answer', done: true, done_reason: 'stop' })
      );
    const networkArgs = [...args, '--provider', 'ollama'];
    const dryRun = await executeCli([...networkArgs, '--yes', '--dry-run'], {
      stdin: stdin('private test input'),
    });
    const preview = JSON.parse(dryRun.stdout);
    expect(preview).toMatchObject({ status: 'preview', output: null });
    expect(dryRun.stdout).not.toContain('private test input');
    expect(fetcher).not.toHaveBeenCalled();

    const confirmed = [
      ...networkArgs,
      '--yes',
      '--plan-fingerprint',
      preview.operationPlan.fingerprint,
    ];
    const changed = await executeCli(confirmed, { stdin: stdin('changed test input') });
    expect(JSON.parse(changed.stderr).error.code).toBe('OPERATION_PLAN_MISMATCH');
    expect(fetcher).not.toHaveBeenCalled();

    const result = await executeCli(confirmed, { stdin: stdin('private test input') });
    expect(result.exitCode).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).prompt).toBe(
      'Summarize\n\nStandard input:\nprivate test input'
    );
    expect(JSON.parse(result.stdout).output).toBe('model answer');
  });

  it('shows how to supply the same input for confirmation and keeps the output preview unwritten', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-stdin-output-'));
    const outputArgs = ['ai', 'ask', '--stdin', '--provider', 'echo', '--output', 'saved.txt'];
    try {
      const human = await executeCli([...outputArgs, '--yes', '--dry-run'], {
        cwd,
        stdin: stdin('private test input'),
      });
      expect(human.stdout).toContain('Supply the same standard input again');
      expect(human.stdout).toContain('zw ai ask --stdin');
      expect(human.stdout).not.toContain('private test input');
      await expect(readFile(path.join(cwd, 'saved.txt'))).rejects.toHaveProperty('code', 'ENOENT');

      const preview = JSON.parse(
        (await executeCli([...outputArgs, '--json'], { cwd, stdin: stdin('private test input') }))
          .stdout
      );
      const confirmed = await executeCli(
        [...outputArgs, '--yes', '--plan-fingerprint', preview.operationPlan.fingerprint, '--json'],
        { cwd, stdin: stdin('private test input') }
      );
      expect(JSON.parse(confirmed.stdout).wroteFile).toBe(true);
      await expect(readFile(path.join(cwd, 'saved.txt'), 'utf8')).resolves.toContain(
        'private test input'
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
