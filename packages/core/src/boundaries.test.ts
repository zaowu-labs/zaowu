import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const domainPackages = ['ai', 'auto', 'config', 'data', 'dev', 'doc', 'plugin', 'teach', 'web'];

describe('package boundary guard', () => {
  it('keeps domain packages from importing each other directly', async () => {
    for (const domain of domainPackages) {
      const sourceDirectory = path.join(rootDirectory, 'packages', domain, 'src');
      const files = await readdir(sourceDirectory);

      for (const file of files.filter((name) => name.endsWith('.ts'))) {
        const content = await readFile(path.join(sourceDirectory, file), 'utf8');
        const forbiddenImports = domainPackages
          .filter((candidate) => candidate !== domain)
          .map((candidate) => `@zaowu/${candidate}`)
          .filter((importName) => content.includes(importName));

        expect(
          forbiddenImports,
          `${domain}/${file} imports ${forbiddenImports.join(', ')}`
        ).toEqual([]);
      }
    }
  });
});
