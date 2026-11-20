import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeCli } from './run';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('zw ai ask --raw', () => {
  it('returns the exact successful answer without streaming or extra text', async () => {
    const output = '  Answer\u001b[31m\n\n';
    const onChunk = vi.fn();
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ response: output, done: true, done_reason: 'stop' }));
    const result = await executeCli(
      ['ai', 'ask', 'Read this', '--stdin', '--raw', '--provider', 'ollama', '--yes'],
      { stdin: Readable.from(['sample']), onChunk }
    );
    expect(result).toEqual({ exitCode: 0, stdout: output, stderr: '', rawStdout: true });
    expect(onChunk).not.toHaveBeenCalled();
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).stream).toBe(false);
  });

  it('keeps previews on stderr and retains raw mode in the confirmation command', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    const result = await executeCli([
      'ai',
      'ask',
      'Explain',
      '--raw',
      '--provider',
      'ollama',
      '--yes',
      '--dry-run',
    ]);
    expect(result).toMatchObject({ exitCode: 0, stdout: '' });
    expect(result.stderr).toContain('Status: preview');
    expect(result.stderr).toContain('zw ai ask --raw');
    expect(result.stderr).toContain('--plan-fingerprint');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps stdout empty for incomplete output', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ response: 'partial answer', done: false })
    );
    const result = await executeCli([
      'ai',
      'ask',
      'Explain',
      '--raw',
      '--provider',
      'ollama',
      '--yes',
    ]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('did not complete a text answer');
  });

  it('rejects conflicting raw and JSON output before reading from stdin', async () => {
    const read = vi.fn();
    const result = await executeCli(['ai', 'ask', '--raw', '--json', '--stdin'], {
      stdin: new Readable({ read }),
    });
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr).error.code).toBe('OPTION_VALUE_INVALID');
    expect(read).not.toHaveBeenCalled();
  });
});
