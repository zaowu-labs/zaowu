import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DomainDefinition } from '@zaowu/core';
import { ZaoWuError } from '@zaowu/core';

export interface PluginManifest {
  id: string;
  source: string;
  installedAt: string | null;
}

export interface PluginListResult {
  status: 'ok';
  pluginDir: string;
  plugins: PluginManifest[];
}

export interface PluginChangeResult {
  status: 'ok' | 'preview';
  pluginDir: string;
  plugin: PluginManifest;
  wroteFile: boolean;
  removedFile?: boolean;
}

export const PLUGIN_DOMAIN: DomainDefinition = {
  name: 'plugin',
  summary: 'Plugin workflows for listing, installing, and removing extensions',
  commands: [
    {
      name: 'list',
      summary: 'List installed or available plugins',
      status: 'available',
    },
    {
      name: 'install',
      summary: 'Install a plugin with compatibility checks',
      status: 'available',
      sensitive: true,
    },
    {
      name: 'remove',
      summary: 'Remove an installed plugin with confirmation',
      status: 'available',
      sensitive: true,
    },
  ],
};

const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

const getPluginDir = (cwd: string): string => path.join(cwd, '.zaowu', 'plugins');

const assertPluginId = (id: string): void => {
  if (!PLUGIN_ID_PATTERN.test(id)) {
    throw new ZaoWuError({
      code: 'PLUGIN_ID_INVALID',
      message: 'Plugin id is invalid.',
      why: 'Plugin ids must start with a lowercase letter or number and may contain lowercase letters, numbers, dots, underscores, and dashes.',
      fix: 'Use an id like `readme-gen` or `team.tools`.',
    });
  }
};

const getPluginPath = (pluginDir: string, id: string): string => path.join(pluginDir, `${id}.json`);

export const listPlugins = async (options: { cwd?: string } = {}): Promise<PluginListResult> => {
  const cwd = options.cwd ?? process.cwd();
  const pluginDir = getPluginDir(cwd);
  let entries: string[] = [];

  try {
    entries = await readdir(pluginDir);
  } catch {
    return {
      status: 'ok',
      pluginDir,
      plugins: [],
    };
  }

  const plugins: PluginManifest[] = [];

  for (const entry of entries.filter((name) => name.endsWith('.json'))) {
    try {
      plugins.push(
        JSON.parse(await readFile(path.join(pluginDir, entry), 'utf8')) as PluginManifest
      );
    } catch {
      plugins.push({
        id: path.basename(entry, '.json'),
        source: 'unreadable',
        installedAt: null,
      });
    }
  }

  return {
    status: 'ok',
    pluginDir,
    plugins,
  };
};

export const installPlugin = async (
  id: string,
  options: { cwd?: string; source?: string; yes?: boolean; installedAt?: string } = {}
): Promise<PluginChangeResult> => {
  assertPluginId(id);

  const cwd = options.cwd ?? process.cwd();
  const pluginDir = getPluginDir(cwd);
  const plugin: PluginManifest = {
    id,
    source: options.source ?? id,
    installedAt: options.yes ? (options.installedAt ?? new Date().toISOString()) : null,
  };

  if (options.yes) {
    await mkdir(pluginDir, { recursive: true });
    await writeFile(getPluginPath(pluginDir, id), `${JSON.stringify(plugin, null, 2)}\n`, 'utf8');
  }

  return {
    status: options.yes ? 'ok' : 'preview',
    pluginDir,
    plugin,
    wroteFile: Boolean(options.yes),
  };
};

export const removePlugin = async (
  id: string,
  options: { cwd?: string; yes?: boolean } = {}
): Promise<PluginChangeResult> => {
  assertPluginId(id);

  const cwd = options.cwd ?? process.cwd();
  const pluginDir = getPluginDir(cwd);
  const plugin: PluginManifest = {
    id,
    source: id,
    installedAt: null,
  };

  if (options.yes) {
    await rm(getPluginPath(pluginDir, id), { force: true });
  }

  return {
    status: options.yes ? 'ok' : 'preview',
    pluginDir,
    plugin,
    wroteFile: false,
    removedFile: Boolean(options.yes),
  };
};
