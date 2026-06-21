import { constants } from 'node:fs';
import { access } from 'node:fs/promises';

/**
 * Returns true if the given file path exists and is accessible.
 * Returns false for any access error (not found, permission denied, etc.).
 *
 * This is the shared implementation used by doc and data packages
 * to avoid duplicating the try/catch access pattern.
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
