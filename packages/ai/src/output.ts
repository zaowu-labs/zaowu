import { constants } from 'node:fs';
import { access, link, lstat, open, realpath, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ZaoWuError } from '@zaowu-labs/core';
import { assertAIRequestActive } from './transport.js';

const conflict = (): ZaoWuError =>
  new ZaoWuError({
    code: 'AI_OUTPUT_CONFLICT',
    message: 'AI output target already exists.',
    why: 'ZaoWu only creates new answer files and never overwrites files, links, or directories. A target can also appear during generation.',
    fix: 'Preserve the existing target and choose a new --output path. If generation already completed, the request was not retried.',
  });
const writeFailure = (): ZaoWuError =>
  new ZaoWuError({
    code: 'AI_OUTPUT_WRITE_FAILED',
    message: 'Could not save the AI answer.',
    why: 'The output directory must already exist and be writable, and complete-file creation must succeed.',
    fix: 'Check the output directory, permissions, and disk space, then preview a new target. If generation already completed, the provider may have billed the request; ZaoWu did not resend it.',
  });

/** Resolve the physical parent and reject unusable destinations before generation. */
export const prepareAIOutputPath = async (outputPath: string): Promise<string> => {
  try {
    const absolute = path.resolve(outputPath);
    const parent = await realpath(path.dirname(absolute));
    const target = path.join(parent, path.basename(absolute));
    try {
      await lstat(target);
      throw conflict();
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
    }
    await access(parent, constants.W_OK);
    if (!(await lstat(parent)).isDirectory()) throw writeFailure();
    return target;
  } catch (error) {
    if (error instanceof ZaoWuError) throw error;
    throw writeFailure();
  }
};

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
    if ((error as { code?: string }).code === 'EEXIST') throw conflict();
    throw writeFailure();
  } finally {
    if (created) await unlink(temporary).catch(() => {});
  }
};
