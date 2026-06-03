import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stripUtf8Bom, type DomainDefinition } from '@zaowu/core';
import { ZaoWuError } from '@zaowu/core';

export interface PluginManifest {
  id: string;
  source: string;
  installedAt: string | null;
}

export interface PluginSourceCommand {
  name: string;
  summary?: string;
}

export interface PluginSourceManifest {
  id: string;
  name?: string;
  version?: string;
  commands?: PluginSourceCommand[];
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

export interface PluginValidationResult {
  status: 'ok' | 'warning';
  target: string;
  manifestPath?: string;
  manifest?: PluginSourceManifest;
  warnings: string[];
  errors: string[];
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
    {
      name: 'validate',
      summary: 'Validate a local plugin manifest or plugin id',
      status: 'available',
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

const isPathLike = (target: string): boolean =>
  target.includes('/') || target.includes('\\') || target.endsWith('.json') || target === '.';

const readJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(stripUtf8Bom(await readFile(filePath, 'utf8'))) as unknown;

const getManifestPath = async (target: string): Promise<string | null> => {
  try {
    const info = await stat(target);

    if (info.isDirectory()) {
      const candidates = [path.join(target, 'zaowu.plugin.json'), path.join(target, 'plugin.json')];

      for (const candidate of candidates) {
        try {
          if ((await stat(candidate)).isFile()) {
            return candidate;
          }
        } catch {
          // Try the next manifest candidate.
        }
      }

      return null;
    }

    return info.isFile() ? target : null;
  } catch {
    return null;
  }
};

const validateSourceManifest = (value: unknown): PluginValidationResult['errors'] => {
  const errors: string[] = [];
  const manifest = value as Partial<PluginSourceManifest>;

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['Manifest must be a JSON object.'];
  }

  if (typeof manifest.id !== 'string' || !PLUGIN_ID_PATTERN.test(manifest.id)) {
    errors.push('Manifest `id` must be a valid plugin id.');
  }

  if (manifest.version !== undefined && typeof manifest.version !== 'string') {
    errors.push('Manifest `version` must be a string when provided.');
  }

  if (manifest.commands !== undefined) {
    if (!Array.isArray(manifest.commands)) {
      errors.push('Manifest `commands` must be an array when provided.');
    } else {
      manifest.commands.forEach((command, index) => {
        if (!command || typeof command !== 'object' || Array.isArray(command)) {
          errors.push(`Command at index ${index} must be an object.`);
          return;
        }

        if (typeof command.name !== 'string' || !PLUGIN_ID_PATTERN.test(command.name)) {
          errors.push(`Command at index ${index} has an invalid name.`);
        }
      });
    }
  }

  return errors;
};

export const validatePluginSource = async (target: string): Promise<PluginValidationResult> => {
  const manifestPath = await getManifestPath(target);

  if (!manifestPath) {
    if (!isPathLike(target)) {
      assertPluginId(target);

      return {
        status: 'warning',
        target,
        warnings: ['No local manifest was read; target was treated as a plugin id.'],
        errors: [],
      };
    }

    return {
      status: 'warning',
      target,
      warnings: [],
      errors: ['No `zaowu.plugin.json` or `plugin.json` manifest was found.'],
    };
  }

  try {
    const manifest = (await readJson(manifestPath)) as PluginSourceManifest;
    const errors = validateSourceManifest(manifest);

    return {
      status: errors.length > 0 ? 'warning' : 'ok',
      target,
      manifestPath,
      manifest,
      warnings: [],
      errors,
    };
  } catch {
    return {
      status: 'warning',
      target,
      manifestPath,
      warnings: [],
      errors: ['Manifest JSON could not be parsed.'],
    };
  }
};

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
  const source = options.source ?? id;
  const sourceValidation = isPathLike(source) ? await validatePluginSource(source) : null;

  if (sourceValidation?.errors.length) {
    throw new ZaoWuError({
      code: 'PLUGIN_SOURCE_INVALID',
      message: 'Plugin source is invalid.',
      why: sourceValidation.errors.join(' '),
      fix: 'Fix the plugin manifest, then run `zw plugin validate <path>` again.',
    });
  }

  if (sourceValidation?.manifest?.id && sourceValidation.manifest.id !== id) {
    throw new ZaoWuError({
      code: 'PLUGIN_SOURCE_ID_MISMATCH',
      message: 'Plugin source id does not match install id.',
      why: `The source manifest id is \`${sourceValidation.manifest.id}\`, but the requested install id is \`${id}\`.`,
      fix: `Run \`zw plugin install ${sourceValidation.manifest.id} --source ${source}\` or update the manifest.`,
    });
  }

  const plugin: PluginManifest = {
    id,
    source,
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
