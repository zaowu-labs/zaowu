import { constants } from 'node:fs';
import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { DomainDefinition } from '@zaowu/core';

export const CONFIG_FILE_NAMES = [
  'zw.yml',
  'zw.yaml',
  'zaowu.config.json',
  'zaowu.config.js',
  'zaowu.config.mjs',
  'zaowu.config.cjs',
  '.zaowurc',
] as const;

export interface FindConfigFileOptions {
  cwd?: string;
  names?: readonly string[];
}

export interface LoadedConfig {
  filePath: string;
  content: string;
}

export const CONFIG_DOMAIN: DomainDefinition = {
  name: 'config',
  summary: 'Inspect and manage ZaoWu configuration',
  commands: [
    {
      name: 'show',
      summary: 'Show resolved ZaoWu configuration',
      status: 'planned',
    },
    {
      name: 'path',
      summary: 'Print the resolved configuration file path',
      status: 'planned',
    },
  ],
};

const isReadableFile = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath, constants.R_OK);
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
};

export const findConfigFile = async (
  options: FindConfigFileOptions = {}
): Promise<string | null> => {
  const names = options.names ?? CONFIG_FILE_NAMES;
  let currentDirectory = path.resolve(options.cwd ?? process.cwd());

  while (true) {
    for (const name of names) {
      const candidate = path.join(currentDirectory, name);

      if (await isReadableFile(candidate)) {
        return candidate;
      }
    }

    const parentDirectory = path.dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      return null;
    }

    currentDirectory = parentDirectory;
  }
};

export const loadConfig = async (filePath: string): Promise<LoadedConfig> => {
  const resolvedPath = path.resolve(filePath);
  const content = await readFile(resolvedPath, 'utf8');

  return {
    filePath: resolvedPath,
    content,
  };
};
