import { stat } from 'node:fs/promises';
import path from 'node:path';
import {
  createCapabilityLedger,
  readBoundedFile,
  stripUtf8Bom,
  ZaoWuError,
  type DomainDefinition,
} from '@zaowu-labs/core';

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
  questionCount: number;
  questions: string[];
  format?: string;
  content?: string;
}

const DEFAULT_QUIZ_COUNT = 3;
const MAX_QUIZ_COUNT = 20;

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

const readTopicOrFile = async (input: string, cwd = process.cwd()): Promise<string> => {
  if (!input.trim()) {
    throw new ZaoWuError({
      code: 'TEACH_INPUT_REQUIRED',
      message: 'Teaching input is required.',
      why: '`zw teach` needs a topic, text, or readable file path.',
      fix: 'Run `zw teach plan "TypeScript basics"`.',
    });
  }

  const tooLarge = new ZaoWuError({
    code: 'TEACH_INPUT_TOO_LARGE',
    message: 'Teaching input is too large.',
    why: 'Teaching files are limited to one MiB and literal topics to one million characters.',
    fix: 'Choose a smaller text extract or a shorter topic.',
  });
  if (input.length > 1_000_000) throw tooLarge;
  const filePath = path.resolve(cwd, input);
  try {
    if (!(await stat(filePath)).isFile()) return input;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'ENAMETOOLONG' || code === 'EINVAL')
      return input;
    throw new ZaoWuError({
      code: 'TEACH_INPUT_READ_FAILED',
      message: 'Could not read teaching input.',
      why: 'The input path exists but could not be inspected.',
      fix: 'Check the path and file permissions, or supply a literal topic.',
    });
  }
  return stripUtf8Bom(
    (
      await readBoundedFile(filePath, 1024 * 1024, {
        failed: {
          code: 'TEACH_INPUT_READ_FAILED',
          message: 'Could not read teaching input.',
          why: 'The selected file is not readable as a regular text file.',
          fix: 'Check the path and file permissions, or supply a literal topic.',
        },
        tooLarge,
      })
    ).toString('utf8')
  );
};

const HEADING_LINE_PATTERN = /^#{1,6}\s/;

const stripHeadingMarker = (line: string): string => line.replace(/^#+\s*/, '').trim();

const getTopic = (content: string): { topic: string; fromHeading: boolean } => {
  const lines = content.split(/\r?\n/);
  const topic = lines.map(stripHeadingMarker).find(Boolean) ?? 'Untitled topic';

  // The topic counts as heading-derived only when the first non-empty line is
  // itself a heading; a plain-text first line means every heading is a real
  // section.
  const firstNonEmptyLine = lines.map((line) => line.trim()).find(Boolean);

  return {
    topic,
    fromHeading: firstNonEmptyLine ? HEADING_LINE_PATTERN.test(firstNonEmptyLine) : false,
  };
};

const getSentences = (content: string): string[] =>
  content
    // Latin sentence enders only split when followed by whitespace or end of
    // text, so `Node.js`, `3.14`, and `v1.0` stay whole. CJK enders and
    // newlines split anywhere, since CJK text has no inter-word spaces.
    .split(/[.!?]+(?=\s|$)|[。！？]+|\r?\n/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

/**
 * Extract heading lines from markdown-like content.
 * Returns bare heading text without the leading # characters.
 */
const getHeadings = (content: string): string[] =>
  content
    .split(/\r?\n/)
    .filter((line) => HEADING_LINE_PATTERN.test(line))
    .map(stripHeadingMarker)
    .filter(Boolean);

export const createTeachingPlan = async (
  input: string,
  options: { cwd?: string } = {}
): Promise<TeachPlanResult> => {
  const content = await readTopicOrFile(input, options.cwd);
  const { topic, fromHeading } = getTopic(content);
  const headings = getHeadings(content);
  const sectionHeadings = fromHeading ? headings.slice(1) : headings;

  // Build a richer outline when the content has discoverable section headings.
  const outline =
    sectionHeadings.length > 0
      ? [
          `Goal: understand ${topic}.`,
          'Warm-up: ask what the learner already knows.',
          ...sectionHeadings.map((h, i) => `Section ${i + 1}: ${h}`),
          'Practice: complete a short guided exercise.',
          'Check: summarize the key point and one common mistake.',
        ]
      : [
          `Goal: understand ${topic}.`,
          'Warm-up: ask what the learner already knows.',
          'Explain: introduce the core idea with one concrete example.',
          'Practice: complete a short guided exercise.',
          'Check: summarize the key point and one common mistake.',
        ];

  return {
    schemaVersion: 1,
    status: 'ok',
    topic,
    outline,
  };
};

export const createTeachingQuiz = async (
  input: string,
  options: { format?: string; count?: number; cwd?: string } = {}
): Promise<TeachQuizResult> => {
  const rawCount = options.count ?? DEFAULT_QUIZ_COUNT;

  if (!Number.isInteger(rawCount) || rawCount < 1 || rawCount > MAX_QUIZ_COUNT) {
    throw new ZaoWuError({
      code: 'TEACH_INPUT_REQUIRED',
      message: 'Quiz count is out of range.',
      why: `Question count must be a whole number between 1 and ${MAX_QUIZ_COUNT}, but got ${rawCount}.`,
      fix: 'Run `zw teach quiz --count 5 "your topic"` to generate 5 questions.',
    });
  }

  const count = rawCount;
  const content = await readTopicOrFile(input, options.cwd);
  const { topic } = getTopic(content);
  const sentences = getSentences(content).slice(0, count);
  const questions =
    sentences.length > 0
      ? sentences.map(
          (sentence, index) => `Q${index + 1}: Explain this idea in your own words: ${sentence}.`
        )
      : [`Q1: What is the main idea of ${topic}?`];

  const format = options.format === 'canvas-csv' ? 'canvas-csv' : 'text';
  let resultCsv = '';
  if (format === 'canvas-csv') {
    const lines = [
      'Type,Question Text,Points',
      ...questions.map((q) => `E,"${q.replaceAll('"', '""')}",1`),
    ];
    resultCsv = lines.join('\n') + '\n';
  }

  return {
    schemaVersion: 1,
    status: 'ok',
    topic,
    questionCount: questions.length,
    questions,
    format,
    content: format === 'canvas-csv' ? resultCsv : undefined,
  };
};
