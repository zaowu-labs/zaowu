import { mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as ai from '@zaowu-labs/ai';
import { ZaoWuError } from '@zaowu-labs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeCli } from './run';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const fixture = async () => ({
  ...(await ai.askAI({ prompt: 'fixture', provider: 'echo' })),
  output: 'Complete 造物\nAnswer.\n',
});

describe('saved AI answers', () => {
  it.each([{ flags: [] }, { flags: ['--yes', '--dry-run'] }])(
    'previews local output without generating or writing: %s',
    async ({ flags }) => {
      const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-answer-preview-'));
      const ask = vi.spyOn(ai, 'askAI');
      try {
        const response = await executeCli(
          [
            'ai',
            'ask',
            'Explain',
            '--provider',
            'echo',
            '--output',
            'answer.md',
            '--json',
            ...flags,
          ],
          { cwd }
        );
        expect(response.exitCode).toBe(0);
        expect(JSON.parse(response.stdout)).toMatchObject({
          status: 'preview',
          output: null,
          outputPath: path.join(await realpath(cwd), 'answer.md'),
          wroteFile: false,
          operationPlan: {
            confirmationRequired: true,
            writes: [path.join(await realpath(cwd), 'answer.md')],
          },
        });
        expect(ask).not.toHaveBeenCalled();
        expect(await readdir(cwd)).toEqual([]);
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    }
  );
  it('confirms a complete clean answer and binds the output destination', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-answer-save-'));
    const answer = await fixture();
    const ask = vi.spyOn(ai, 'askAI').mockResolvedValue(answer);
    const args = ['ai', 'ask', 'Explain', '--provider', 'echo', '--output', 'answer.md', '--json'];
    try {
      const preview = JSON.parse((await executeCli(args, { cwd })).stdout);
      const stale = await executeCli(
        [
          ...args.map((v) => (v === 'answer.md' ? 'other.md' : v)),
          '--yes',
          '--plan-fingerprint',
          preview.operationPlan.fingerprint,
        ],
        { cwd }
      );
      expect(stale.exitCode).toBe(1);
      expect(JSON.parse(stale.stderr).error.code).toBe('OPERATION_PLAN_MISMATCH');
      expect(ask).not.toHaveBeenCalled();
      const response = await executeCli(
        [...args, '--yes', '--plan-fingerprint', preview.operationPlan.fingerprint],
        { cwd }
      );
      expect(response.exitCode).toBe(0);
      expect(JSON.parse(response.stdout)).toMatchObject({
        status: 'ok',
        output: answer.output,
        wroteFile: true,
      });
      expect(await readFile(path.join(cwd, 'answer.md'), 'utf8')).toBe(answer.output);
      expect(await readdir(cwd)).toEqual(['answer.md']);
      if (process.platform !== 'win32')
        expect((await stat(path.join(cwd, 'answer.md'))).mode & 0o777).toBe(0o600);
      expect(ask).toHaveBeenCalledTimes(1);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
  it.each(['existing', 'missing-parent', 'input-target'])(
    'rejects unusable %s output before a provider call',
    async (kind) => {
      const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-answer-conflict-'));
      vi.stubEnv('OPENAI_API_KEY', 'fixture');
      const ask = vi.spyOn(ai, 'askAI');
      try {
        await writeFile(path.join(cwd, 'input.md'), 'original');
        const output =
          kind === 'missing-parent'
            ? 'missing/answer.md'
            : kind === 'input-target'
              ? 'input.md'
              : 'answer.md';
        if (kind === 'existing') await writeFile(path.join(cwd, output), 'preserve');
        const response = await executeCli(
          [
            'ai',
            'ask',
            'Explain',
            '--file',
            'input.md',
            '--provider',
            'openai',
            '--output',
            output,
            '--yes',
            '--json',
          ],
          { cwd }
        );
        expect(JSON.parse(response.stderr).error.code).toBe(
          kind === 'missing-parent' ? 'AI_OUTPUT_WRITE_FAILED' : 'AI_OUTPUT_CONFLICT'
        );
        expect(ask).not.toHaveBeenCalled();
        expect(await readFile(path.join(cwd, 'input.md'), 'utf8')).toBe('original');
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    }
  );
  it('preserves a target created during generation', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-answer-race-'));
    const answer = await fixture();
    try {
      const ask = vi.spyOn(ai, 'askAI').mockImplementation(async () => {
        await writeFile(path.join(cwd, 'answer.md'), 'concurrent');
        return answer;
      });
      const response = await executeCli(
        ['ai', 'ask', 'Explain', '--output', 'answer.md', '--yes', '--json'],
        { cwd }
      );
      expect(JSON.parse(response.stderr).error.code).toBe('AI_OUTPUT_CONFLICT');
      expect(ask).toHaveBeenCalledTimes(1);
      expect(await readFile(path.join(cwd, 'answer.md'), 'utf8')).toBe('concurrent');
      expect(await readdir(cwd)).toEqual(['answer.md']);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
  it.each(['AI_PROVIDER_RESPONSE_INVALID', 'AI_REQUEST_CANCELLED'] as const)(
    'leaves no output after %s',
    async (code) => {
      const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-answer-failed-'));
      const ask = vi
        .spyOn(ai, 'askAI')
        .mockRejectedValue(new ZaoWuError({ code, message: 'fixture failure' }));
      try {
        const response = await executeCli(
          ['ai', 'ask', 'Explain', '--output', 'answer.md', '--yes', '--json'],
          { cwd }
        );
        expect(JSON.parse(response.stderr).error.code).toBe(code);
        expect(ask).toHaveBeenCalledTimes(1);
        expect(await readdir(cwd)).toEqual([]);
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    }
  );
});

describe('trustworthy CLI boundaries', () => {
  it('rejects contradictory review scope before reading Git', async () => {
    const runner = vi.fn();
    const result = await executeCli(['dev', 'review', '--staged', '--worktree', '--json'], {
      commandRunner: runner,
    });
    expect(JSON.parse(result.stderr).error.code).toBe('OPTION_VALUE_INVALID');
    expect(runner).not.toHaveBeenCalled();
  });
  it('rejects unsafe row counts rather than silently using five rows', async () => {
    const result = await executeCli([
      'data',
      'sample',
      'missing.csv',
      '--rows',
      '9'.repeat(400),
      '--json',
    ]);
    expect(JSON.parse(result.stderr).error.code).toBe('OPTION_VALUE_INVALID');
  });
  it('escapes terminal controls in human output while preserving JSON', async () => {
    const prompt = 'Visible\u001b[2J\u009d52;clipboard\u0007\rhidden';
    const human = await executeCli(['ai', 'ask', prompt, '--provider', 'echo']);
    expect(
      [...human.stdout].some((character) => [7, 27, 157, 13].includes(character.charCodeAt(0)))
    ).toBe(false);
    expect(human.stdout).toContain('\\x1b[2J');
    const json = JSON.parse(
      (await executeCli(['ai', 'ask', prompt, '--provider', 'echo', '--json'])).stdout
    );
    expect(json.output).toContain(prompt);
  });
});

it('streams safe human text while saving the original completed answer', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-answer-stream-'));
  const answer = { ...(await fixture()), output: 'Hello\u001b[2J\u009d52;clipboard\u0007\n造物' };
  const chunks: string[] = [];
  vi.spyOn(ai, 'askAI').mockImplementation(async (request) => {
    request.onChunk?.(answer.output.slice(0, 6));
    request.onChunk?.(answer.output.slice(6));
    return answer;
  });
  try {
    const response = await executeCli(
      ['ai', 'ask', 'Explain', '--provider', 'echo', '--output', 'answer.md', '--yes'],
      { cwd, onChunk: (text) => chunks.push(text) }
    );
    expect(response.exitCode).toBe(0);
    expect(chunks.join('')).toContain('\\x1b[2J');
    expect(chunks.join('')).toContain('Saved answer:');
    expect(chunks.join('')).not.toContain('\u001b');
    expect(await readFile(path.join(cwd, 'answer.md'), 'utf8')).toBe(answer.output);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

it('requires a prompt or file even when an output was provided', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-answer-input-'));
  try {
    const response = await executeCli(
      ['ai', 'ask', '--provider', 'echo', '--output', 'answer.md', '--json'],
      { cwd }
    );
    expect(JSON.parse(response.stderr).error.code).toBe('AI_PROMPT_REQUIRED');
    expect(await readdir(cwd)).toEqual([]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
