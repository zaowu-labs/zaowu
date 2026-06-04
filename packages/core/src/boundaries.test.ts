import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const sharedPackages = ['ai', 'config', 'core'];
const featurePackages = ['auto', 'data', 'dev', 'doc', 'plugin', 'teach', 'web'];
const workspacePackages = ['cli', ...sharedPackages, ...featurePackages];

const readSourceFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
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

const getForbiddenWorkspaceImports = (packageName: string): string[] => {
  if (packageName === 'cli') {
    return [];
  }

  const forbidden = ['cli'];

  if (featurePackages.includes(packageName)) {
    forbidden.push(...featurePackages.filter((candidate) => candidate !== packageName));
  }

  if (packageName === 'core') {
    forbidden.push('ai', 'config', ...featurePackages);
  }

  if (packageName === 'ai' || packageName === 'config') {
    forbidden.push(...featurePackages);
  }

  return forbidden.map((candidate) => `@zaowu/${candidate}`);
};

const readPackageDependencies = async (packageName: string): Promise<string[]> => {
  const packageJsonPath = path.join(rootDirectory, 'packages', packageName, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  return [
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ].filter((dependency) => dependency.startsWith('@zaowu/'));
};

describe('package boundary guard', () => {
  it('keeps feature packages from importing each other or the CLI', async () => {
    for (const packageName of workspacePackages) {
      const sourceDirectory = path.join(rootDirectory, 'packages', packageName, 'src');
      const files = await readSourceFiles(sourceDirectory);
      const forbiddenImports = getForbiddenWorkspaceImports(packageName);

      for (const file of files) {
        const content = await readFile(file, 'utf8');
        const actualForbiddenImports = forbiddenImports.filter((importName) =>
          content.includes(importName)
        );

        expect(
          actualForbiddenImports,
          `${path.relative(rootDirectory, file)} imports ${actualForbiddenImports.join(', ')}`
        ).toEqual([]);
      }
    }
  });

  it('keeps package dependency declarations aligned with boundaries', async () => {
    for (const packageName of workspacePackages) {
      const dependencies = await readPackageDependencies(packageName);
      const forbiddenDependencies = getForbiddenWorkspaceImports(packageName).filter((dependency) =>
        dependencies.includes(dependency)
      );

      expect(
        forbiddenDependencies,
        `packages/${packageName}/package.json depends on ${forbiddenDependencies.join(', ')}`
      ).toEqual([]);
    }
  });
});
