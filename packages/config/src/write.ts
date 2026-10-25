import { randomUUID } from 'node:crypto';
import { link, lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { readBoundedFile, ZaoWuError } from '@zaowu-labs/core';

export const MAX_CONFIG_BYTES = 1024 * 1024;

const changedConfig = (): ZaoWuError =>
  new ZaoWuError({
    code: 'OPERATION_PLAN_MISMATCH',
    message: 'Config changed after plan verification.',
    why: 'The configuration no longer matches the content authorized by the operation plan. The existing file was preserved.',
    fix: 'Run the preview again, review the current content, and confirm its new fingerprint.',
  });

export interface ConfigWriteOptions {
  cwd?: string;
  yes?: boolean;
  expectedContent?: string;
  expectedInputContent?: string | null;
  /** Capture the exact source used to prepare a confirmation plan. */
  onInput?: (content: string | null) => void;
}

export const assertExpectedConfigContent = (
  content: string | null,
  expected?: string | null
): void => {
  if (expected !== undefined && expected !== content) throw changedConfig();
};

const writeFailed = (filePath: string): ZaoWuError =>
  new ZaoWuError({
    code: 'CONFIG_WRITE_FAILED',
    message: 'Could not write ZaoWu config.',
    why: `ZaoWu could not safely replace \`${filePath}\` as a regular configuration file.`,
    fix: 'Check directory permissions and available disk space. Replace symbolic links with a regular config file, then preview again.',
  });

/** Complete-file replacement with a final content check and create-only handling. */
export const replaceConfigFile = async (
  filePath: string,
  content: string,
  original: string | null
): Promise<void> => {
  const temporary = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${randomUUID()}.tmp`
  );
  let created = false;
  const assertCurrent = async () => {
    try {
      const info = await lstat(filePath);
      if (!info.isFile() || info.isSymbolicLink()) throw writeFailed(filePath);
      if (original === null) throw changedConfig();
      const current = await readBoundedFile(filePath, MAX_CONFIG_BYTES, {
        failed: writeFailed(filePath),
        tooLarge: changedConfig(),
      });
      if (current.toString('utf8') !== original) throw changedConfig();
      return info;
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
      if (original !== null) throw changedConfig();
      return undefined;
    }
  };
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    const current = await assertCurrent();
    const file = await open(temporary, 'wx', current ? current.mode & 0o777 : 0o600);
    created = true;
    try {
      if (current) await file.chmod(current.mode & 0o777);
      await file.writeFile(content, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    await assertCurrent();
    if (original === null) {
      try {
        await link(temporary, filePath);
      } catch (error) {
        if ((error as { code?: string }).code === 'EEXIST') throw changedConfig();
        throw error;
      }
    } else await rename(temporary, filePath);
  } catch (error) {
    if (error instanceof ZaoWuError) throw error;
    throw writeFailed(filePath);
  } finally {
    if (created) await unlink(temporary).catch(() => {});
  }
};
