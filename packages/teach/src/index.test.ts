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

  it('creates quiz questions from material', async () => {
    await expect(
      createTeachingQuiz('Variables store values. Functions group behavior.')
    ).resolves.toMatchObject({
      status: 'ok',
      questions: [
        'Q1: Explain this idea in your own words: Variables store values.',
        'Q2: Explain this idea in your own words: Functions group behavior.',
      ],
    });
  });
});
