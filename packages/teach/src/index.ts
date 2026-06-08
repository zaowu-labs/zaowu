import { readFile } from 'node:fs/promises';
import { createCapabilityLedger, type DomainDefinition } from '@zaowu/core';
import { ZaoWuError } from '@zaowu/core';

export interface TeachPlanResult {
  schemaVersion: 1;
  status: 'ok';
  topic: string;
  outline: string[];
}

export interface TeachQuizResult {
  schemaVersion: 1;
  status: 'ok';
  topic: string;
  questions: string[];
}

export const TEACH_DOMAIN: DomainDefinition = {
  name: 'teach',
  summary: 'Teaching workflows for lesson planning and practice materials',
  capabilities: createCapabilityLedger({
    readsFiles: true,
  }),
  commands: [
    {
      name: 'plan',
      summary: 'Create a teaching plan',
      status: 'available',
    },
    {
      name: 'quiz',
      summary: 'Create practice questions from provided material',
      status: 'available',
    },
  ],
};

const readTopicOrFile = async (input: string): Promise<string> => {
  if (!input.trim()) {
    throw new ZaoWuError({
      code: 'TEACH_INPUT_REQUIRED',
      message: 'Teaching input is required.',
      why: '`zw teach` needs a topic, text, or readable file path.',
      fix: 'Run `zw teach plan "TypeScript basics"`.',
    });
  }

  try {
    return await readFile(input, 'utf8');
  } catch {
    return input;
  }
};

const getTopic = (content: string): string => {
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .find(Boolean);

  return firstLine ?? 'Untitled topic';
};

const getSentences = (content: string): string[] =>
  content
    .split(/[.!?\n。！？]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

export const createTeachingPlan = async (input: string): Promise<TeachPlanResult> => {
  const content = await readTopicOrFile(input);
  const topic = getTopic(content);

  return {
    schemaVersion: 1,
    status: 'ok',
    topic,
    outline: [
      `Goal: understand ${topic}.`,
      'Warm-up: ask what the learner already knows.',
      'Explain: introduce the core idea with one concrete example.',
      'Practice: complete a short guided exercise.',
      'Check: summarize the key point and one common mistake.',
    ],
  };
};

export const createTeachingQuiz = async (input: string): Promise<TeachQuizResult> => {
  const content = await readTopicOrFile(input);
  const topic = getTopic(content);
  const sentences = getSentences(content).slice(0, 3);

  return {
    schemaVersion: 1,
    status: 'ok',
    topic,
    questions:
      sentences.length > 0
        ? sentences.map(
            (sentence, index) => `Q${index + 1}: Explain this idea in your own words: ${sentence}.`
          )
        : [`Q1: What is the main idea of ${topic}?`],
  };
};
