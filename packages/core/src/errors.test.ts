import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isKnownZaoWuErrorCode, ZAOWU_ERROR_CODES, ZaoWuError } from './index';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const readSourceFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, {
    withFileTypes: true,
  });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await readSourceFiles(entryPath)));
      continue;
    }

    if (entry.name.endsWith('.ts')) {
      files.push(entryPath);
    }
  }

  return files;
};

describe('ZaoWuError', () => {
  it('formats expected errors for human-readable output', () => {
    const error = new ZaoWuError({
      code: 'NO_STAGED_CHANGES',
      message: 'No staged changes found.',
      why: '`zw dev commit` reads staged Git changes by default.',
      fix: 'Run `git add .` and try again.',
    });

    expect(error.formatHuman()).toBe(`Error: No staged changes found.

Why:
\`zw dev commit\` reads staged Git changes by default.

How to fix:
Run \`git add .\` and try again.`);
  });

  it('formats expected errors for JSON output', () => {
    const error = new ZaoWuError({
      code: 'NO_STAGED_CHANGES',
      message: 'No staged changes found.',
      exitCode: 2,
    });

    expect(JSON.parse(error.formatJSON())).toEqual({
      error: {
        code: 'NO_STAGED_CHANGES',
        message: 'No staged changes found.',
        why: null,
        fix: null,
        exitCode: 2,
      },
    });
  });

  it('keeps a registry of stable error codes', () => {
    expect(isKnownZaoWuErrorCode('NO_STAGED_CHANGES')).toBe(true);
    expect(isKnownZaoWuErrorCode('NOT_A_REAL_CODE')).toBe(false);
  });

  it('registers every expected error code used in source', async () => {
    const files = await readSourceFiles(path.join(rootDirectory, 'packages'));
    const usedCodes = new Set<string>();

    for (const file of files) {
      const content = await readFile(file, 'utf8');

      for (const match of content.matchAll(/\bcode:\s*'([A-Z0-9_]+)'/g)) {
        usedCodes.add(match[1]);
      }
    }

    expect([...usedCodes].sort()).toEqual(
      [...ZAOWU_ERROR_CODES].filter((code) => usedCodes.has(code)).sort()
    );
  });

  it('keeps error code documentation synchronized with the registry', async () => {
    const documentation = await readFile(
      path.join(rootDirectory, 'docs', 'ERROR_CODES.md'),
      'utf8'
    );
    const documentedCodes = [
      ...new Set([...documentation.matchAll(/\|\s+`([A-Z0-9_]+)`/g)].map((match) => match[1])),
    ].sort();

    expect(documentedCodes).toEqual([...ZAOWU_ERROR_CODES].sort());
  });
});
