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

  it.each(['little', 'big'])('reads %s-endian UTF-16 lesson files', async (endian) => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-teach-encoding-'));
    try {
      const bytes = Buffer.from('\uFEFF# 课程🌱\r\n## 练习\r\n种子会发芽。', 'utf16le');
      await writeFile(path.join(cwd, 'lesson.md'), endian === 'big' ? bytes.swap16() : bytes);
      const plan = await createTeachingPlan('lesson.md', { cwd });
      expect(plan.topic).toBe('课程🌱');
      expect(plan.outline).toContain('Section 1: 练习');
      const quiz = await createTeachingQuiz('lesson.md', { cwd });
      expect(quiz.questions.join(' ')).toContain('种子会发芽');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('requires usable material from a file for both lesson plans and quizzes', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-teach-input-'));
    try {
      const input = path.join(cwd, 'topic.md');
      for (const [content, code] of [
        [Buffer.from([0xff]), 'TEACH_INPUT_READ_FAILED'],
        [Buffer.from([0xff, 0xfe, 0x61]), 'TEACH_INPUT_READ_FAILED'],
        [Buffer.from([0xfe, 0xff, 0xd8, 0x00]), 'TEACH_INPUT_READ_FAILED'],
        [Buffer.from('\uFEFFa\0b', 'utf16le'), 'TEACH_INPUT_READ_FAILED'],
        [Buffer.from('a\0b'), 'TEACH_INPUT_READ_FAILED'],
        [Buffer.from('  \n'), 'TEACH_INPUT_REQUIRED'],
      ] as const) {
        await writeFile(input, content);
        for (const command of [createTeachingPlan, createTeachingQuiz]) {
          await expect(command('topic.md', { cwd })).rejects.toMatchObject({ code });
        }
      }
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
