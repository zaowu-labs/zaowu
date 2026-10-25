import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTeachingPlan, createTeachingQuiz } from './index';

describe('teaching file input integrity', () => {
  it('resolves files against the supplied working directory and strips a UTF-8 BOM', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-teach-cwd-'));
    try {
      await writeFile(
        path.join(cwd, 'lesson.md'),
        '\uFEFF# Course\n\n## Variables\nVariables store values.'
      );
      const result = await createTeachingPlan('lesson.md', { cwd });
      expect(result.topic).toBe('Course');
      expect(result.outline).toContain('Section 1: Variables');
      expect((await createTeachingQuiz('lesson.md', { cwd })).topic).toBe('Course');
      expect((await createTeachingPlan('A missing topic', { cwd })).topic).toBe('A missing topic');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
  it('rejects oversized files and topics instead of treating a failed read as a topic', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-teach-large-'));
    try {
      const handle = await open(path.join(cwd, 'large.md'), 'w');
      try {
        await handle.truncate(1024 * 1024 + 1);
      } finally {
        await handle.close();
      }
      await expect(createTeachingPlan('large.md', { cwd })).rejects.toMatchObject({
        code: 'TEACH_INPUT_TOO_LARGE',
      });
      await expect(createTeachingQuiz('x'.repeat(1_000_001), { cwd })).rejects.toMatchObject({
        code: 'TEACH_INPUT_TOO_LARGE',
      });
      await expect(createTeachingPlan('', { cwd })).rejects.toMatchObject({
        code: 'TEACH_INPUT_REQUIRED',
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
