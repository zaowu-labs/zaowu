import { constants } from 'node:fs';
import { access, open, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ZaoWuError, type ZaoWuErrorOptions } from './errors.js';
import { stripUtf8Bom } from './text.js';

/** Read at most maxBytes from one regular-file handle, including files that grow. */
export const readBoundedFile = async (
  filePath: string,
  maxBytes: number,
  errors: { failed: ZaoWuErrorOptions; tooLarge: ZaoWuErrorOptions }
): Promise<Buffer> => {
  let file;
  try {
    file = await open(filePath, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
    const stat = await file.stat();
    if (!stat.isFile()) throw new ZaoWuError(errors.failed);
    if (stat.size > maxBytes) throw new ZaoWuError(errors.tooLarge);
    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
      const chunk = Buffer.alloc(Math.min(64 * 1024, maxBytes + 1 - total));
      const { bytesRead } = await file.read(chunk);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > maxBytes) throw new ZaoWuError(errors.tooLarge);
      chunks.push(chunk.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks, total);
  } catch (error) {
    if (error instanceof ZaoWuError) throw error;
    throw new ZaoWuError(errors.failed);
  } finally {
    await file?.close();
  }
};

/**
 * Returns true if the given file path exists and is accessible.
 * Returns false for any access error (not found, permission denied, etc.).
 */
export const pathExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    // File does not exist or is not accessible — treat as missing.
    return false;
  }
};

/**
 * Read a UTF-8 text file, mapping any read failure to the provided
 * domain-specific ZaoWuError. Set `stripBom` when the caller treats the
 * content as text a user may have saved with a UTF-8 BOM.
 */
export const readTextFileOrThrow = async (
  filePath: string,
  error: ZaoWuErrorOptions,
  options: { stripBom?: boolean } = {}
): Promise<string> => {
  try {
    const content = await readFile(filePath, 'utf8');

    return options.stripBom ? stripUtf8Bom(content) : content;
  } catch {
    throw new ZaoWuError(error);
  }
};

/**
 * Write a UTF-8 text file with the exclusive `wx` flag so an existing file is
 * never silently overwritten. `errors.exists` is thrown when the target
 * already exists; `errors.failed` for any other file-system rejection.
 */
export const writeTextFileExclusive = async (
  filePath: string,
  content: string,
  errors: { exists: ZaoWuErrorOptions; failed: ZaoWuErrorOptions }
): Promise<void> => {
  try {
    await writeFile(filePath, content, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error instanceof ZaoWuError) {
      throw error;
    }

    throw new ZaoWuError(
      (error as { code?: string }).code === 'EEXIST' ? errors.exists : errors.failed
    );
  }
};

/**
 * Guard for preview-first output writes: refuse to write onto the input file
 * and refuse to overwrite an existing output file. Error text stays with the
 * calling domain so messages keep their command-specific fix guidance.
 */
export const assertSafeOutputPath = async (
  inputPath: string,
  outputPath: string,
  errors: { inputConflict: ZaoWuErrorOptions; alreadyExists: ZaoWuErrorOptions }
): Promise<void> => {
  if (path.resolve(inputPath) === path.resolve(outputPath)) {
    throw new ZaoWuError(errors.inputConflict);
  }

  if (await pathExists(outputPath)) {
    throw new ZaoWuError(errors.alreadyExists);
  }
};

/**
 * True when `target` resolves outside `baseDirectory`. A target equal to the
 * base directory itself is NOT escaping; callers that additionally require a
 * non-empty relative path (a file strictly inside) must check that separately.
 */
export const isPathEscapingDirectory = (baseDirectory: string, target: string): boolean => {
  const relative = path.relative(baseDirectory, target);

  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
};
