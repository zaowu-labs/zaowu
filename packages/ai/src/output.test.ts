import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { prepareAIOutputPath, saveAIAnswer } from './output';

describe('complete answer file creation', () => {
  it('preserves an existing target and leaves no temporary file', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-answer-existing-'));
    const file = path.join(cwd, 'answer.md');
    try {
      await writeFile(file, 'original');
      await expect(saveAIAnswer(file, 'different')).rejects.toMatchObject({
        code: 'AI_OUTPUT_CONFLICT',
      });
      expect(await readFile(file, 'utf8')).toBe('original');
      expect(await readdir(cwd)).toEqual(['answer.md']);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
  it('does not create a file after cancellation or a missing-parent failure', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-answer-cancel-'));
    try {
      const controller = new AbortController();
      controller.abort();
      await expect(
        saveAIAnswer(path.join(cwd, 'answer.md'), 'text', controller.signal)
      ).rejects.toMatchObject({ code: 'AI_REQUEST_CANCELLED' });
      await expect(
        saveAIAnswer(path.join(cwd, 'missing', 'answer.md'), 'text')
      ).rejects.toMatchObject({ code: 'AI_OUTPUT_WRITE_FAILED' });
      expect(await readdir(cwd)).toEqual([]);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
  it.skipIf(process.platform === 'win32')(
    'rejects dangling target links and resolves linked parent directories',
    async () => {
      const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-answer-links-'));
      try {
        await symlink(path.join(cwd, 'missing'), path.join(cwd, 'answer.md'));
        await expect(prepareAIOutputPath(path.join(cwd, 'answer.md'))).rejects.toMatchObject({
          code: 'AI_OUTPUT_CONFLICT',
        });
        await mkdir(path.join(cwd, 'real'));
        await symlink(path.join(cwd, 'real'), path.join(cwd, 'alias'));
        expect(await prepareAIOutputPath(path.join(cwd, 'alias', 'new.md'))).toMatch(
          /[/\\]real[/\\]new.md$/
        );
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    }
  );
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'rejects unwritable parents before generation and maps write failures',
    async () => {
      const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-answer-readonly-'));
      try {
        await chmod(cwd, 0o500);
        await expect(prepareAIOutputPath(path.join(cwd, 'answer.md'))).rejects.toMatchObject({
          code: 'AI_OUTPUT_WRITE_FAILED',
        });
        await expect(saveAIAnswer(path.join(cwd, 'answer.md'), 'text')).rejects.toMatchObject({
          code: 'AI_OUTPUT_WRITE_FAILED',
        });
        expect(await readdir(cwd)).toEqual([]);
      } finally {
        await chmod(cwd, 0o700);
        await rm(cwd, { recursive: true, force: true });
      }
    }
  );
});
