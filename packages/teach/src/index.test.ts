import { describe, expect, it } from 'vitest';
import { createTeachingPlan, createTeachingQuiz, TEACH_DOMAIN } from './index';

describe('teach domain', () => {
  it('declares teaching workflow commands', () => {
    expect(TEACH_DOMAIN.name).toBe('teach');
    expect(TEACH_DOMAIN.commands.map((command) => command.name)).toEqual(['plan', 'quiz']);
  });

  it('creates a teaching plan from a topic', async () => {
    await expect(createTeachingPlan('TypeScript basics')).resolves.toMatchObject({
      status: 'ok',
      topic: 'TypeScript basics',
      outline: expect.arrayContaining(['Goal: understand TypeScript basics.']),
    });
  });

  it('creates a content-aware plan from markdown with multiple headings', async () => {
    const md = '# TypeScript\n\n## Variables\n\n## Functions\n\nSome text here.';
    const result = await createTeachingPlan(md);
    expect(result.status).toBe('ok');
    expect(result.topic).toBe('TypeScript');
    // Should include sections derived from the headings
    expect(result.outline).toContain('Section 1: Variables');
    expect(result.outline).toContain('Section 2: Functions');
  });

  it('creates quiz questions from material', async () => {
    await expect(
      createTeachingQuiz('Variables store values. Functions group behavior.')
    ).resolves.toMatchObject({
      status: 'ok',
      questionCount: 2,
      questions: [
        'Q1: Explain this idea in your own words: Variables store values.',
        'Q2: Explain this idea in your own words: Functions group behavior.',
      ],
    });
  });

  it('respects the --count option for quiz', async () => {
    const content = 'A. B. C. D. E. F.';
    const result = await createTeachingQuiz(content, { count: 2 });
    expect(result.questionCount).toBe(2);
    expect(result.questions).toHaveLength(2);
  });

  it('rejects invalid count values', async () => {
    await expect(createTeachingQuiz('some topic', { count: 0 })).rejects.toMatchObject({
      code: 'TEACH_INPUT_REQUIRED',
    });
    await expect(createTeachingQuiz('some topic', { count: 21 })).rejects.toMatchObject({
      code: 'TEACH_INPUT_REQUIRED',
    });
  });

  it('creates quiz in canvas-csv format', async () => {
    await expect(
      createTeachingQuiz('Variables store values. Functions group behavior.', {
        format: 'canvas-csv',
      })
    ).resolves.toMatchObject({
      status: 'ok',
      format: 'canvas-csv',
      content: [
        'Type,Question Text,Points',
        'E,"Q1: Explain this idea in your own words: Variables store values.",1',
        'E,"Q2: Explain this idea in your own words: Functions group behavior.",1',
        '',
      ].join('\n'),
    });
  });
});
