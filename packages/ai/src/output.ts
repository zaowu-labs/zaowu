import { link, open, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { prepareExclusiveOutputPath, ZaoWuError } from '@zaowu-labs/core';
import { assertAIRequestActive } from './transport.js';

const conflict = {
  code: 'AI_OUTPUT_CONFLICT',
  message: 'AI output target already exists.',
  why: 'ZaoWu only creates new answer files and never overwrites files, links, or directories. A target can also appear during generation.',
  fix: 'Preserve the existing target and choose a new --output path. If generation already completed, the request was not retried.',
} as const;
const writeFailure = {
  code: 'AI_OUTPUT_WRITE_FAILED',
  message: 'Could not save the AI answer.',
  why: 'The output directory must already exist and be writable, and complete-file creation must succeed.',
  fix: 'Check the output directory, permissions, and disk space, then preview a new target. If generation already completed, the provider may have billed the request; ZaoWu did not resend it.',
} as const;

/** Resolve the physical parent and reject unusable destinations before generation. */
export const prepareAIOutputPath = (outputPath: string): Promise<string> =>
  prepareExclusiveOutputPath(outputPath, { exists: conflict, failed: writeFailure });

/** Publish only a complete private file; link() refuses concurrent target creation. */
export const saveAIAnswer = async (
  outputPath: string,
  content: string,
  signal?: AbortSignal
): Promise<void> => {
  assertAIRequestActive(signal);
  const temporary = path.join(path.dirname(outputPath), `.zaowu-answer-${randomUUID()}.tmp`);
  let created = false;
  try {
    const file = await open(temporary, 'wx', 0o600);
    created = true;
    try {
      await file.writeFile(content, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    assertAIRequestActive(signal);
    await link(temporary, outputPath);
  } catch (error) {
    if (error instanceof ZaoWuError) throw error;
    throw new ZaoWuError(
      (error as NodeJS.ErrnoException).code === 'EEXIST' ? conflict : writeFailure
    );
  } finally {
    if (created) await unlink(temporary).catch(() => {});
  }
};
