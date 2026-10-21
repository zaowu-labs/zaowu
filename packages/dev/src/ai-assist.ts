/**
 * AI-assisted developer workflow logic.
 *
 * These helpers own the domain side of `zw dev commit --ai` and
 * `zw dev review --ai`: prompt construction, diff truncation, and parsing of
 * provider output back into dev result shapes. Provider selection and network
 * confirmation stay in the CLI composition layer, which is the only layer
 * allowed to depend on both `@zaowu-labs/dev` and `@zaowu-labs/ai`.
 */

import { ZaoWuError } from '@zaowu-labs/core';
import {
  isDevFindingCategory,
  isDevFindingPriority,
  isDevFindingSeverity,
  type DevCommitResult,
  type DevCommitSuggestion,
  type DevDiffHunk,
  type DevReviewFinding,
} from './contracts.js';

export const DEV_AI_DIFF_CHARACTER_LIMIT = 100_000;

export const truncateDevAiDiff = (diffText: string): string =>
  diffText.length > DEV_AI_DIFF_CHARACTER_LIMIT
    ? `${diffText.slice(0, DEV_AI_DIFF_CHARACTER_LIMIT)}\n... [truncated] ...`
    : diffText;

export const buildDevAiCommitPrompt = (diffText: string): string =>
  [
    'Generate a Conventional Commit message for the following staged changes.',
    'Follow the Conventional Commits specification (e.g. feat(scope): message).',
    'Respond ONLY with the commit message, including a title and an optional body/footer.',
    '',
    'Changes:',
    truncateDevAiDiff(diffText),
  ].join('\n');

export const buildDevAiReviewPrompt = (diffText: string): string =>
  [
    'Perform a code review of the following Git changes.',
    'Find potential security vulnerabilities, performance issues, architectural flaws, bugs, or test gaps.',
    'Format your review as a JSON array of finding objects, like this:',
    '[',
    '  {',
    '    "severity": "info" | "warning",',
    '    "priority": "low" | "medium" | "high",',
    '    "category": "security" | "performance" | "quality" | "test" | "filesystem" | "network" | "git",',
    '    "title": "Short title",',
    '    "detail": "Detailed explanation of the issue and fix.",',
    '    "filePath": "relative/path/to/file",',
    '    "line": 123,',
    '    "hunkHeader": "@@ ... @@"',
    '  }',
    ']',
    'Respond ONLY with the JSON array. Do not wrap in markdown code blocks.',
    '',
    'Changes:',
    truncateDevAiDiff(diffText),
  ].join('\n');

/**
 * Merge an AI-generated Conventional Commit message into a deterministic
 * commit preview. Returns a new result; the input preview is not mutated.
 */
export const applyDevAiCommitSuggestion = (
  preview: DevCommitResult,
  aiOutput: string
): DevCommitResult => {
  const cleanOutput = aiOutput
    .trim()
    .replace(/^```[^\n]*\r?\n/, '')
    .replace(/\r?\n```$/, '');
  const lines = cleanOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const title = lines[0] ?? '';
  const body = lines.slice(1);
  const match = /^([a-z][a-z0-9-]*)(?:\(([^():\r\n]+)\))?(!)?:\s+(.+)$/i.exec(title);
  if (!match || title.length > 100)
    throw new ZaoWuError({
      code: 'AI_PROVIDER_RESPONSE_INVALID',
      message: 'AI commit suggestion is invalid.',
      why: 'The model did not return a Conventional Commit title of at most 100 characters.',
      fix: 'Retry with a real model, edit the message yourself, or use the local heuristic preview without --ai.',
    });
  const suggestion: DevCommitSuggestion = {
    type: match?.[1] || preview.suggestion.type,
    scope: match[2] ?? '',
    subject: match[4],
    title,
    body: body.length > 0 ? body : preview.suggestion.body,
  };

  return {
    ...preview,
    method: 'ai-assisted',
    suggestion,
    message: title,
  };
};

/**
 * Parse AI review output into typed findings. Accepts the JSON-array shape the
 * review prompt requests (optionally wrapped in a markdown code fence). Any
 * output that is not a JSON array falls back to a single plain-text summary
 * finding so the review never silently loses the provider's response.
 */
export const parseDevAiReviewFindings = (
  aiOutput: string,
  context?: { files: readonly string[]; hunks: readonly DevDiffHunk[] }
): DevReviewFinding[] => {
  let cleanOutput = aiOutput.trim();

  if (cleanOutput.startsWith('```')) {
    cleanOutput = cleanOutput.replace(/^```[a-z]*\r?\n/, '').replace(/\r?\n```$/, '');
  }

  let parsedItems: unknown[] | undefined;

  try {
    const parsed = JSON.parse(cleanOutput);

    if (Array.isArray(parsed)) {
      parsedItems = parsed;
    }
  } catch {
    // Fall through to the plain-text summary finding below.
  }

  if (!parsedItems) {
    return [
      {
        severity: 'info',
        priority: 'medium',
        category: 'quality',
        title: 'AI Code Review Summary',
        detail: aiOutput.trim(),
      },
    ];
  }

  return parsedItems.map((item) => {
    const finding = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    if (
      typeof finding.title !== 'string' ||
      !finding.title.trim() ||
      typeof finding.detail !== 'string' ||
      !finding.detail.trim()
    )
      throw new ZaoWuError({
        code: 'AI_PROVIDER_RESPONSE_INVALID',
        message: 'AI review findings are invalid.',
        why: 'Each structured finding must have a non-empty title and detail; empty or malformed items are not review findings.',
        fix: 'Retry with a real model or use the local review without --ai.',
      });
    const path = typeof finding.filePath === 'string' ? finding.filePath : undefined;
    const locationValid = !context || !path || context.files.includes(path);
    const validLine =
      Number.isInteger(finding.line) &&
      Number(finding.line) > 0 &&
      locationValid &&
      (!context ||
        context.hunks.some(
          (hunk) =>
            hunk.filePath === path &&
            Number(finding.line) >= hunk.startLine &&
            Number(finding.line) <= hunk.endLine
        ));

    return {
      severity: isDevFindingSeverity(finding.severity) ? finding.severity : 'info',
      priority: isDevFindingPriority(finding.priority) ? finding.priority : 'medium',
      category: isDevFindingCategory(finding.category) ? finding.category : 'quality',
      title: typeof finding.title === 'string' ? finding.title : 'AI Review',
      detail:
        finding.detail +
        (!locationValid || (finding.line !== undefined && !validLine)
          ? ' Location could not be verified against this diff.'
          : ''),
      filePath: locationValid ? path : undefined,
      line: validLine ? Number(finding.line) : undefined,
      hunkHeader:
        typeof finding.hunkHeader === 'string' &&
        (!context ||
          context.hunks.some(
            (hunk) => hunk.filePath === path && hunk.header === finding.hunkHeader
          ))
          ? finding.hunkHeader
          : undefined,
    };
  });
};
