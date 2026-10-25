import { createHash } from 'node:crypto';
import { lstat, mkdir, readdir, realpath, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  createCapabilityLedger,
  readBoundedFile,
  stripUtf8Bom,
  writeTextFileExclusive,
  ZaoWuError,
  type DomainDefinition,
} from '@zaowu-labs/core';

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
  schemaVersion?: number;
  id: string;
  name?: string;
  version?: string;
  commands?: PluginSourceCommand[];
}

export interface PluginListResult {
  schemaVersion: 1;
  status: 'ok';
  pluginDir: string;
  plugins: PluginManifest[];
}

export interface PluginChangeResult {
  schemaVersion: 1;
  status: 'ok' | 'preview';
  pluginDir: string;
  plugin: PluginManifest;
  wroteFile: boolean;
  removedFile?: boolean;
}

export interface PluginValidationResult {
  schemaVersion: 1;
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
  capabilities: createCapabilityLedger({
    readsFiles: true,
    writesFiles: true,
  }),
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
const SUPPORTED_PLUGIN_SCHEMA_VERSION = 1;

const getPluginDir = (cwd: string): string => path.resolve(cwd, '.zaowu', 'plugins');

const normalizeComparisonPath = (value: string): string => {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};

const throwUnsafePluginPath = (pluginDir: string): never => {
  throw new ZaoWuError({
    code: 'PLUGIN_PATH_UNSAFE',
    message: 'Plugin directory is unsafe.',
    why: `The plugin directory \`${pluginDir}\` is redirected through a symbolic link or junction.`,
    fix: 'Replace the linked `.zaowu` or `.zaowu/plugins` directory with a real directory inside the project.',
  });
};

const rethrowUnlessMissing = (error: unknown): void => {
  if (error instanceof ZaoWuError) {
    throw error;
  }

  if ((error as { code?: string }).code !== 'ENOENT') {
    throw error;
  }
};

const assertSafePluginDir = async (cwd: string, pluginDir: string): Promise<void> => {
  const resolvedCwd = path.resolve(cwd);
  const zaowuDir = path.join(resolvedCwd, '.zaowu');

  for (const candidate of [zaowuDir, pluginDir]) {
    try {
      if ((await lstat(candidate)).isSymbolicLink()) {
        throwUnsafePluginPath(pluginDir);
      }
    } catch (error) {
      rethrowUnlessMissing(error);
    }
  }

  try {
    const [realCwd, realPluginDir] = await Promise.all([
      realpath(resolvedCwd),
      realpath(pluginDir),
    ]);
    const expectedPluginDir = path.join(realCwd, '.zaowu', 'plugins');

    if (normalizeComparisonPath(realPluginDir) !== normalizeComparisonPath(expectedPluginDir)) {
      throwUnsafePluginPath(pluginDir);
    }
  } catch (error) {
    rethrowUnlessMissing(error);
  }
};

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

const MAX_PLUGIN_BYTES = 1024 * 1024;
const readPluginFile = (filePath: string): Promise<Buffer> =>
  readBoundedFile(filePath, MAX_PLUGIN_BYTES, {
    failed: {
      code: 'PLUGIN_READ_FAILED',
      message: 'Could not read plugin manifest.',
      why: `The manifest at \`${filePath}\` is not a readable regular file.`,
      fix: 'Check the path and file permissions.',
    },
    tooLarge: {
      code: 'PLUGIN_SOURCE_INVALID',
      message: 'Plugin manifest is too large.',
      why: 'Plugin manifests are limited to one MiB.',
      fix: 'Reduce the manifest to metadata and command descriptions.',
    },
  });
const readJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(stripUtf8Bom((await readPluginFile(filePath)).toString('utf8')));

export const getPluginTargetSubjects = async (
  id: string,
  options: { cwd?: string } = {}
): Promise<string[]> => {
  assertPluginId(id);
  const cwd = options.cwd ?? process.cwd();
  const pluginDir = getPluginDir(cwd);
  const filePath = getPluginPath(pluginDir, id);
  await assertSafePluginDir(cwd, pluginDir);
  try {
    const info = await lstat(filePath);
    if (!info.isFile() || info.isSymbolicLink())
      throw new ZaoWuError({
        code: 'PLUGIN_PATH_UNSAFE',
        message: 'Plugin manifest path is unsafe.',
        why: 'Installed plugin manifests must be regular files, not links or directories.',
        fix: 'Inspect the plugin path and replace it with a regular local manifest.',
      });
    const buffer = await readPluginFile(filePath);
    return [
      'target-state:exists',
      `target-content-sha256:${createHash('sha256').update(buffer).digest('hex')}`,
      `target-content-length:${buffer.toString('utf8').length}`,
    ];
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return ['target-state:missing'];
    throw error;
  }
};

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

  if (
    manifest.schemaVersion !== undefined &&
    manifest.schemaVersion !== SUPPORTED_PLUGIN_SCHEMA_VERSION
  ) {
    errors.push(
      `Manifest \`schemaVersion\` must be ${SUPPORTED_PLUGIN_SCHEMA_VERSION} when provided.`
    );
  }

  if (manifest.name !== undefined && typeof manifest.name !== 'string') {
    errors.push('Manifest `name` must be a string when provided.');
  }

  if (manifest.version !== undefined && typeof manifest.version !== 'string') {
    errors.push('Manifest `version` must be a string when provided.');
  }

  if (manifest.commands !== undefined) {
    if (!Array.isArray(manifest.commands)) {
      errors.push('Manifest `commands` must be an array when provided.');
    } else {
      const commandNames = new Set<string>();

      manifest.commands.forEach((command, index) => {
        if (!command || typeof command !== 'object' || Array.isArray(command)) {
          errors.push(`Command at index ${index} must be an object.`);
          return;
        }

        if (typeof command.name !== 'string' || !PLUGIN_ID_PATTERN.test(command.name)) {
          errors.push(`Command at index ${index} has an invalid name.`);
        } else if (commandNames.has(command.name)) {
          errors.push(`Command \`${command.name}\` is duplicated.`);
        } else {
          commandNames.add(command.name);
        }

        if (command.summary !== undefined && typeof command.summary !== 'string') {
          errors.push(`Command \`${command.name ?? index}\` summary must be a string.`);
        }
      });
    }
  }

  return errors;
};

export const validatePluginSource = async (
  target: string,
  options: { cwd?: string } = {}
): Promise<PluginValidationResult> => {
  const manifestPath = await getManifestPath(path.resolve(options.cwd ?? process.cwd(), target));

  if (!manifestPath) {
    if (!isPathLike(target)) {
      assertPluginId(target);

      return {
        schemaVersion: 1,
        status: 'warning',
        target,
        warnings: ['No local manifest was read; target was treated as a plugin id.'],
        errors: [],
      };
    }

    return {
      schemaVersion: 1,
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
      schemaVersion: 1,
      status: errors.length > 0 ? 'warning' : 'ok',
      target,
      manifestPath,
      manifest,
      warnings: [],
      errors,
    };
  } catch (error) {
    return {
      schemaVersion: 1,
      status: 'warning',
      target,
      manifestPath,
      warnings: [],
      errors: [
        error instanceof ZaoWuError
          ? `${error.message} ${error.why ?? ''} ${error.fix ?? ''}`
          : 'Manifest JSON could not be parsed.',
      ],
    };
  }
};

export const listPlugins = async (options: { cwd?: string } = {}): Promise<PluginListResult> => {
  const cwd = options.cwd ?? process.cwd();
  const pluginDir = getPluginDir(cwd);
  let entries: string[] = [];

  await assertSafePluginDir(cwd, pluginDir);

  try {
    entries = await readdir(pluginDir);
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT')
      throw new ZaoWuError({
        code: 'PLUGIN_READ_FAILED',
        message: 'Could not list plugin manifests.',
        why: 'The plugin directory could not be read.',
        fix: 'Check the plugin directory permissions, then try again.',
      });
    return {
      schemaVersion: 1,
      status: 'ok',
      pluginDir,
      plugins: [],
    };
  }

  const plugins: PluginManifest[] = [];

  for (const entry of entries.filter((name) => name.endsWith('.json'))) {
    try {
      // readJson strips a UTF-8 BOM, matching how validate reads manifests.
      const id = path.basename(entry, '.json');
      const info = await lstat(path.join(pluginDir, entry));
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('Unsafe installed manifest');
      const manifest = (await readJson(
        path.join(pluginDir, entry)
      )) as Partial<PluginManifest> | null;
      if (
        !manifest ||
        Array.isArray(manifest) ||
        !PLUGIN_ID_PATTERN.test(id) ||
        manifest.id !== id ||
        typeof manifest.source !== 'string' ||
        !manifest.source.trim() ||
        !(manifest.installedAt === null || typeof manifest.installedAt === 'string')
      )
        throw new Error('Invalid installed manifest');
      plugins.push({ id, source: manifest.source, installedAt: manifest.installedAt });
    } catch {
      plugins.push({
        id: path.basename(entry, '.json'),
        source: 'unreadable',
        installedAt: null,
      });
    }
  }

  return {
    schemaVersion: 1,
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
  const requestedSource = options.source ?? id;
  const source = isPathLike(requestedSource) ? path.resolve(cwd, requestedSource) : requestedSource;
  const pluginPath = getPluginPath(pluginDir, id);
  const sourceValidation = isPathLike(source) ? await validatePluginSource(source) : null;

  await assertSafePluginDir(cwd, pluginDir);

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
    await assertSafePluginDir(cwd, pluginDir);

    // No pre-existence check here: the exclusive `wx` write is the single
    // authoritative guard, so there is no check-to-write race window.
    await writeTextFileExclusive(pluginPath, `${JSON.stringify(plugin, null, 2)}\n`, {
      exists: {
        code: 'PLUGIN_ALREADY_INSTALLED',
        message: 'Plugin is already installed.',
        why: `ZaoWu will not silently overwrite \`${pluginPath}\`.`,
        fix: 'Remove the plugin first with `zw plugin remove <id> --yes`, then install it again.',
      },
      failed: {
        code: 'PLUGIN_WRITE_FAILED',
        message: 'Could not write plugin manifest.',
        why: `ZaoWu tried to write \`${pluginPath}\`, but the file system rejected the write.`,
        fix: 'Check the plugin directory permissions, then run the command again.',
      },
    });
  }

  return {
    schemaVersion: 1,
    status: options.yes ? 'ok' : 'preview',
    pluginDir,
    plugin,
    wroteFile: Boolean(options.yes),
  };
};

export const removePlugin = async (
  id: string,
  options: { cwd?: string; yes?: boolean; expectedTargetSubjects?: readonly string[] } = {}
): Promise<PluginChangeResult> => {
  assertPluginId(id);

  const cwd = options.cwd ?? process.cwd();
  const pluginDir = getPluginDir(cwd);
  const pluginPath = getPluginPath(pluginDir, id);
  const plugin: PluginManifest = {
    id,
    source: id,
    installedAt: null,
  };

  await assertSafePluginDir(cwd, pluginDir);

  if (options.yes) {
    const subjects = await getPluginTargetSubjects(id, { cwd });
    if (
      options.expectedTargetSubjects &&
      (options.expectedTargetSubjects.length !== subjects.length ||
        options.expectedTargetSubjects.some((value, index) => subjects[index] !== value))
    )
      throw new ZaoWuError({
        code: 'OPERATION_PLAN_MISMATCH',
        message: 'Plugin manifest changed after plan verification.',
        why: 'The manifest selected for removal no longer matches the confirmed content. No file was removed.',
        fix: 'Inspect the current manifest, preview again, and confirm the new fingerprint.',
      });
    if (subjects.includes('target-state:missing')) {
      throw new ZaoWuError({
        code: 'PLUGIN_NOT_INSTALLED',
        message: 'Plugin is not installed.',
        why: `ZaoWu could not find \`${pluginPath}\`.`,
        fix: 'Run `zw plugin list` to see installed plugin manifests.',
      });
    }

    try {
      await rm(pluginPath);
    } catch {
      throw new ZaoWuError({
        code: 'PLUGIN_WRITE_FAILED',
        message: 'Could not remove plugin manifest.',
        why: 'The file system rejected removal of the confirmed plugin manifest.',
        fix: 'Check plugin directory permissions and whether another program is using the file, then preview again.',
      });
    }
  }

  return {
    schemaVersion: 1,
    status: options.yes ? 'ok' : 'preview',
    pluginDir,
    plugin,
    wroteFile: false,
    removedFile: Boolean(options.yes),
  };
};
