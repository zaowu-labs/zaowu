import {
  assertExpectedConfigContent,
  MAX_CONFIG_BYTES,
  replaceConfigFile,
  type ConfigWriteOptions,
} from './write.js';
import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import {
  createCapabilityLedger,
  readBoundedFile,
  stripUtf8Bom,
  ZaoWuError,
  type DomainDefinition,
} from '@zaowu-labs/core';

export const CONFIG_FILE_NAMES = ['zw.yml', 'zw.yaml', 'zaowu.config.json', '.zaowurc'] as const;

export interface FindConfigFileOptions {
  cwd?: string;
  names?: readonly string[];
}

export interface LoadedConfig {
  filePath: string;
  content: string;
}

export interface ZaoWuConfig {
  version: 1;
  project: {
    name: string;
  };
  ai: {
    provider: string | null;
  };
  defaults: {
    output: 'human' | 'json';
  };
  paths: {
    workspace: string;
    cache: string;
  };
}

export interface ResolvedConfig {
  schemaVersion: 1;
  filePath: string;
  config: ZaoWuConfig;
}

export type ConfigKey =
  | 'version'
  | 'project.name'
  | 'ai.provider'
  | 'defaults.output'
  | 'paths.workspace'
  | 'paths.cache';

export interface ConfigValidationResult {
  schemaVersion: 1;
  status: 'ok' | 'warning';
  filePath: string;
  config: ZaoWuConfig;
  warnings: string[];
}

export interface ConfigGetResult {
  schemaVersion: 1;
  status: 'ok';
  filePath: string;
  key: ConfigKey;
  value: string | null;
}

export interface ConfigSetResult {
  schemaVersion: 1;
  status: 'ok' | 'preview';
  filePath: string;
  key: ConfigKey;
  oldValue: string | null;
  newValue: string | null;
  content: string;
  wroteFile: boolean;
}

export interface ConfigMigrationResult {
  schemaVersion: 1;
  status: 'ok' | 'preview';
  filePath: string;
  fromVersion: number | null;
  toVersion: 1;
  changed: boolean;
  content: string;
  wroteFile: boolean;
}

export const CONFIG_DOMAIN: DomainDefinition = {
  name: 'config',
  summary: 'Inspect and manage ZaoWu configuration',
  capabilities: createCapabilityLedger({
    readsFiles: true,
    writesFiles: true,
  }),
  commands: [
    {
      name: 'show',
      summary: 'Show resolved ZaoWu configuration',
      status: 'available',
    },
    {
      name: 'path',
      summary: 'Print the resolved configuration file path',
      status: 'available',
    },
    {
      name: 'validate',
      summary: 'Validate the resolved configuration file',
      status: 'available',
    },
    {
      name: 'get',
      summary: 'Read one supported configuration key',
      status: 'available',
    },
    {
      name: 'set',
      summary: 'Preview or write one supported configuration key',
      status: 'available',
      sensitive: true,
    },
    {
      name: 'migrate',
      summary: 'Preview or apply safe config migrations',
      status: 'available',
      sensitive: true,
    },
  ],
};

const SECRET_KEY_PATTERN = /(?:secret|token|password|api[_-]?key|private[_-]?key|recovery)/i;
const SECRET_VALUE_PATTERN = /(?:sk-[a-zA-Z0-9]{12,}|ghp_[a-zA-Z0-9]{12,})/i;

const assertNoSecretValues = (value: string): void => {
  if (SECRET_VALUE_PATTERN.test(value)) {
    throw new ZaoWuError({
      code: 'CONFIG_SECRET_KEY_NOT_ALLOWED',
      message: 'Config value looks like a secret.',
      why: 'You attempted to write a sensitive API token or key directly to configuration. This poses a severe security risk.',
      fix: 'Set this key as an environment variable in your terminal instead (e.g. export OPENAI_API_KEY="your-token").',
    });
  }
};
const DEFAULT_CONFIG: ZaoWuConfig = {
  version: 1,
  project: {
    name: 'zaowu-project',
  },
  ai: {
    provider: 'echo',
  },
  defaults: {
    output: 'human',
  },
  paths: {
    workspace: '.',
    cache: '.zaowu/cache',
  },
};

const cloneConfig = (config: ZaoWuConfig): ZaoWuConfig => ({
  version: config.version,
  project: { ...config.project },
  ai: { ...config.ai },
  defaults: { ...config.defaults },
  paths: { ...config.paths },
});

export const createDefaultConfig = (): ZaoWuConfig => cloneConfig(DEFAULT_CONFIG);

interface ConfigKeyDescriptor {
  /** Reads the current value for `zw config get` and YAML serialization. */
  get: (config: ZaoWuConfig) => string | null;
  /** Writes a normalized value onto an already-cloned config. */
  set: (config: ZaoWuConfig, value: string | null) => void;
}

/**
 * Single source of truth for the managed config schema. Adding a key means
 * adding one descriptor here (plus the `ConfigKey` union member and, for a new
 * section or YAML line, one `YAML_CONFIG_LAYOUT` entry) — `CONFIG_KEYS`,
 * `getConfigValue`, `withConfigValue`, `serializeConfig`, and
 * `KNOWN_CONFIG_KEYS` all derive from these tables. The `Record<ConfigKey, …>`
 * type keeps the table compile-time exhaustive.
 */
const CONFIG_KEY_DESCRIPTORS: Record<ConfigKey, ConfigKeyDescriptor> = {
  version: {
    get: (config) => String(config.version),
    set: (config) => {
      config.version = 1;
    },
  },
  'project.name': {
    get: (config) => config.project.name,
    set: (config, value) => {
      config.project.name = value ?? DEFAULT_CONFIG.project.name;
    },
  },
  'ai.provider': {
    get: (config) => config.ai.provider,
    set: (config, value) => {
      config.ai.provider = value;
    },
  },
  'defaults.output': {
    get: (config) => config.defaults.output,
    set: (config, value) => {
      config.defaults.output = value === 'json' ? 'json' : 'human';
    },
  },
  'paths.workspace': {
    get: (config) => config.paths.workspace,
    set: (config, value) => {
      config.paths.workspace = value ?? DEFAULT_CONFIG.paths.workspace;
    },
  },
  'paths.cache': {
    get: (config) => config.paths.cache,
    set: (config, value) => {
      config.paths.cache = value ?? DEFAULT_CONFIG.paths.cache;
    },
  },
};

const CONFIG_KEYS = Object.keys(CONFIG_KEY_DESCRIPTORS) as readonly ConfigKey[];

/**
 * Section-by-section YAML layout. `serializeConfig` emits exactly these lines
 * (the byte layout is contract: `migrateResolvedConfig` compares it against
 * file content), and `KNOWN_CONFIG_KEYS` derives its section map from it.
 */
const YAML_CONFIG_LAYOUT: readonly {
  section: string;
  entries: readonly { key: ConfigKey; yamlKey: string }[];
}[] = [
  { section: 'project', entries: [{ key: 'project.name', yamlKey: 'name' }] },
  { section: 'ai', entries: [{ key: 'ai.provider', yamlKey: 'provider' }] },
  { section: 'defaults', entries: [{ key: 'defaults.output', yamlKey: 'output' }] },
  {
    section: 'paths',
    entries: [
      { key: 'paths.workspace', yamlKey: 'workspace' },
      { key: 'paths.cache', yamlKey: 'cache' },
    ],
  },
];

const isReadableFile = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath, constants.R_OK);
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
};

export const getGlobalConfigPath = (): string => {
  const home = os.homedir();
  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(home, 'AppData', 'Roaming'),
      'zaowu',
      'config.yml'
    );
  }
  return path.join(home, '.config', 'zaowu', 'config.yml');
};

export const loadGlobalConfig = async (): Promise<ZaoWuConfig | null> => {
  const globalPath = getGlobalConfigPath();
  if (await isReadableFile(globalPath)) {
    const loaded = await loadConfig(globalPath);
    return parseConfig(loaded.content, globalPath);
  }
  return null;
};

export const mergeConfigs = (global: ZaoWuConfig, project: ZaoWuConfig): ZaoWuConfig => {
  return {
    version: project.version,
    project: {
      name: project.project.name || global.project.name,
    },
    ai: {
      provider: project.ai.provider !== null ? project.ai.provider : global.ai.provider,
    },
    defaults: {
      output: project.defaults.output || global.defaults.output,
    },
    paths: {
      workspace: project.paths.workspace || global.paths.workspace,
      cache: project.paths.cache || global.paths.cache,
    },
  };
};

const formatYamlConfigValue = (key: ConfigKey, value: string | null): string => {
  if (key === 'version') {
    return '1';
  }

  return value === null ? 'null' : JSON.stringify(value);
};

export const modifyYamlContent = (
  content: string,
  key: ConfigKey,
  value: string | null
): string => {
  const normalized = stripUtf8Bom(content);
  const document = YAML.parseDocument(normalized);
  const node = document.getIn(key.split('.'), true);

  // Replace only the scalar's source range. Line matching can hit nested keys
  // or leave the continuation lines of a block scalar behind.
  if (document.errors.length > 0 || !YAML.isScalar(node) || !node.range) {
    return '';
  }

  const [start, end] = node.range;
  const originalValue = normalized.slice(start, end);
  const trailingNewline = /\r?\n$/.exec(originalValue)?.[0] ?? '';
  const bom = content.startsWith('\uFEFF') ? '\uFEFF' : '';
  const prefix = normalized.slice(0, start);
  const suffix = normalized.slice(end);

  return (
    bom +
    prefix +
    (prefix.endsWith(':') ? ' ' : '') +
    formatYamlConfigValue(key, value) +
    trailingNewline +
    (suffix.startsWith('#') ? ' ' : '') +
    suffix
  );
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
  const content = (
    await readBoundedFile(resolvedPath, MAX_CONFIG_BYTES, {
      failed: {
        code: 'CONFIG_PARSE_FAILED',
        message: 'Could not read ZaoWu config.',
        why: `The configuration at \`${resolvedPath}\` is not a readable regular file.`,
        fix: 'Check the path and file permissions.',
      },
      tooLarge: {
        code: 'CONFIG_PARSE_FAILED',
        message: 'ZaoWu config is too large.',
        why: 'Configuration files are limited to one MiB.',
        fix: 'Reduce the config file to project preferences and move large data to separate files.',
      },
    })
  ).toString('utf8');

  return {
    filePath: resolvedPath,
    content,
  };
};

const configParseError = (error: unknown, fallbackWhy: string, fix: string): ZaoWuError =>
  new ZaoWuError({
    code: 'CONFIG_PARSE_FAILED',
    message: 'Could not parse ZaoWu config.',
    why: error instanceof Error ? error.message : fallbackWhy,
    fix,
  });

const parseConfigObject = (content: string, filePath: string): Record<string, unknown> => {
  const normalizedContent = stripUtf8Bom(content);
  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.json' || path.basename(filePath) === '.zaowurc') {
    try {
      const parsed: unknown = JSON.parse(normalizedContent);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Config must be a JSON object.');
      }
      return parsed as Record<string, unknown>;
    } catch (error) {
      throw configParseError(
        error,
        'The JSON parser rejected the file.',
        'Fix the JSON syntax and run `zw config show` again.'
      );
    }
  }

  if (['.yml', '.yaml', ''].includes(extension)) {
    try {
      const parsed = YAML.parse(normalizedContent);
      if (parsed === null || parsed === undefined) {
        return {};
      }
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Config must be a YAML object.');
      }
      return parsed as Record<string, unknown>;
    } catch (error) {
      throw configParseError(
        error,
        'The YAML parser rejected the file.',
        'Use the supported simple subset (top-level keys + one level of 2-space indented sections) or switch to JSON (zaowu.config.json).'
      );
    }
  }

  throw new ZaoWuError({
    code: 'CONFIG_FORMAT_UNSUPPORTED',
    message: 'Config format is not supported yet.',
    why: `ZaoWu can find ${path.basename(filePath)}, but this first version reads YAML and JSON only.`,
    fix: 'Use `zw.yml`, `zw.yaml`, `zaowu.config.json`, or `.zaowurc` for now.',
  });
};

const assertNoSecretKeys = (
  value: unknown,
  pathParts: readonly string[] = [],
  visited = new WeakSet<object>()
): void => {
  if (!value || typeof value !== 'object' || visited.has(value)) {
    return;
  }

  visited.add(value);

  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new ZaoWuError({
        code: 'CONFIG_SECRET_KEY_NOT_ALLOWED',
        message: 'Config contains a secret-like key.',
        why: `The key \`${[...pathParts, key].join('.')}\` looks like a secret and should not be stored in ZaoWu config.`,
        fix: 'Move secrets to environment variables or a future explicit secret provider.',
      });
    }

    assertNoSecretKeys(child, [...pathParts, key], visited);
  }
};

const getObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const getString = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const getOutput = (value: unknown): 'human' | 'json' => (value === 'json' ? 'json' : 'human');

/**
 * Returns 1 for a supported declared version, null when no version is
 * declared, and throws for anything else.
 */
const parseSupportedConfigVersion = (value: unknown): 1 | null => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (value === 1 || value === '1') {
    return 1;
  }

  throw new ZaoWuError({
    code: 'CONFIG_VERSION_UNSUPPORTED',
    message: 'Config version is not supported.',
    why: `ZaoWu supports config version 1, but this file declares \`${String(value)}\`.`,
    fix: 'Run a newer ZaoWu version that supports this config, or migrate the file manually.',
  });
};

const getVersion = (value: unknown): 1 => parseSupportedConfigVersion(value) ?? 1;

const assertConfigKey = (key: string): ConfigKey => {
  if (SECRET_KEY_PATTERN.test(key)) {
    throw new ZaoWuError({
      code: 'CONFIG_SECRET_KEY_NOT_ALLOWED',
      message: 'Config key looks like a secret.',
      why: `The key \`${key}\` looks like a secret and should not be stored in ZaoWu config.`,
      fix: 'Use environment variables or a future explicit secret provider for sensitive values.',
    });
  }

  if (!CONFIG_KEYS.includes(key as ConfigKey)) {
    throw new ZaoWuError({
      code: 'CONFIG_KEY_UNSUPPORTED',
      message: 'Config key is not supported.',
      why: `This version can manage these keys: ${CONFIG_KEYS.join(', ')}.`,
      fix: 'Use one of the supported keys, or extend `packages/config` before adding a new key.',
    });
  }

  return key as ConfigKey;
};

const configValueInvalidError = (why: string, fix: string): ZaoWuError =>
  new ZaoWuError({
    code: 'CONFIG_VALUE_INVALID',
    message: 'Config value is invalid.',
    why,
    fix,
  });

const normalizeConfigValue = (key: ConfigKey, value: string): string | null => {
  const trimmed = value.trim();

  if (key === 'ai.provider' && ['none', 'null'].includes(trimmed.toLowerCase())) {
    return null;
  }

  if (key === 'defaults.output' && !['human', 'json'].includes(trimmed)) {
    throw configValueInvalidError(
      '`defaults.output` must be either `human` or `json`.',
      'Run `zw config set defaults.output json --yes` or `zw config set defaults.output human --yes`.'
    );
  }

  if (key === 'version' && trimmed !== '1') {
    throw configValueInvalidError(
      '`version` must be `1` in this ZaoWu release.',
      'Run `zw config migrate` to preview the supported config version.'
    );
  }

  if (!trimmed) {
    throw configValueInvalidError(`\`${key}\` cannot be empty.`, 'Provide a non-empty value.');
  }

  if (['paths.workspace', 'paths.cache'].includes(key)) {
    return trimmed.replace(/\\/g, '/');
  }

  return trimmed;
};

const getConfigValue = (config: ZaoWuConfig, key: ConfigKey): string | null =>
  CONFIG_KEY_DESCRIPTORS[key].get(config);

const withConfigValue = (
  config: ZaoWuConfig,
  key: ConfigKey,
  value: string | null
): ZaoWuConfig => {
  const next = cloneConfig(config);

  CONFIG_KEY_DESCRIPTORS[key].set(next, value);

  return next;
};

export const serializeConfig = (config: ZaoWuConfig, filePath: string): string => {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.json' || path.basename(filePath) === '.zaowurc') {
    return `${JSON.stringify(config, null, 2)}\n`;
  }

  return [
    'version: 1',
    ...YAML_CONFIG_LAYOUT.flatMap(({ section, entries }) => [
      '',
      `${section}:`,
      ...entries.map(
        ({ key, yamlKey }) =>
          `  ${yamlKey}: ${formatYamlConfigValue(key, CONFIG_KEY_DESCRIPTORS[key].get(config))}`
      ),
    ]),
    '',
  ].join('\n');
};

export const getDefaultConfigContent = (filePath = 'zw.yml'): string =>
  serializeConfig(createDefaultConfig(), filePath);

const getValidationWarnings = (config: ZaoWuConfig): string[] => {
  const warnings: string[] = [];

  if (!config.ai.provider) {
    warnings.push('AI provider is not set; ZaoWu will use the local echo provider by default.');
  }

  if (!config.paths.workspace.trim()) {
    warnings.push('Workspace path is empty.');
  }

  if (!config.paths.cache.trim()) {
    warnings.push('Cache path is empty.');
  }

  return warnings;
};

export const parseConfig = (content: string, filePath = 'zw.yml'): ZaoWuConfig => {
  const parsed = parseConfigObject(content, filePath);
  assertNoSecretKeys(parsed);

  const project = getObject(parsed.project);
  const ai = getObject(parsed.ai);
  const defaults = getObject(parsed.defaults);
  const paths = getObject(parsed.paths);
  const provider = ai.provider;

  return {
    version: getVersion(parsed.version),
    project: {
      name: getString(project.name, DEFAULT_CONFIG.project.name),
    },
    ai: {
      provider: typeof provider === 'string' && provider.trim() ? provider.trim() : null,
    },
    defaults: {
      output: getOutput(defaults.output),
    },
    paths: {
      workspace: getString(paths.workspace, DEFAULT_CONFIG.paths.workspace),
      cache: getString(paths.cache, DEFAULT_CONFIG.paths.cache),
    },
  };
};

const KNOWN_CONFIG_KEYS: Record<string, readonly string[] | null> = {
  version: null,
  ...Object.fromEntries(
    YAML_CONFIG_LAYOUT.map(({ section, entries }) => [
      section,
      entries.map((entry) => entry.yamlKey),
    ])
  ),
};

const collectUnknownConfigKeys = (parsed: Record<string, unknown>): string[] => {
  const unknownKeys: string[] = [];

  for (const [key, value] of Object.entries(parsed)) {
    if (!Object.hasOwn(KNOWN_CONFIG_KEYS, key)) {
      unknownKeys.push(key);
      continue;
    }

    const allowedSubKeys = KNOWN_CONFIG_KEYS[key];

    if (allowedSubKeys && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const subKey of Object.keys(value as Record<string, unknown>)) {
        if (!allowedSubKeys.includes(subKey)) {
          unknownKeys.push(`${key}.${subKey}`);
        }
      }
    }
  }

  return unknownKeys;
};

/**
 * Guards against silent data loss. A full canonical re-serialization only emits
 * the documented schema fields, so any unrecognized key the user placed in the
 * file would be dropped. When such a rewrite is unavoidable (JSON files, or YAML
 * whose target section is missing so the surgical edit fails), refuse instead of
 * discarding the user's keys.
 */
const assertNoUnknownConfigKeysOnRewrite = (content: string, filePath: string): void => {
  const parsed = parseConfigObject(content, filePath);
  const unknownKeys = collectUnknownConfigKeys(parsed);

  if (unknownKeys.length === 0) {
    return;
  }

  const keyLabel = unknownKeys.length === 1 ? 'key' : 'keys';

  throw new ZaoWuError({
    code: 'CONFIG_KEY_UNSUPPORTED',
    message: `Config file contains ${keyLabel} ZaoWu does not recognize.`,
    why:
      `Writing \`${filePath}\` would drop the unrecognized ${keyLabel}: ${unknownKeys.join(', ')}. ` +
      'ZaoWu only serializes documented configuration fields.',
    fix: 'Remove the unrecognized keys from the config file (or keep only documented ZaoWu keys), then run the command again.',
  });
};

export const findConfigPathOrThrow = async (cwd?: string): Promise<string> => {
  const filePath = await findConfigFile({ cwd });

  if (!filePath) {
    throw new ZaoWuError({
      code: 'CONFIG_NOT_FOUND',
      message: 'ZaoWu config not found.',
      why: 'ZaoWu could not find `zw.yml` or another supported config file in this folder or its parents.',
      fix: 'Run `zw init` to preview config creation, then `zw init --yes` to create it.',
    });
  }

  return filePath;
};

export const loadResolvedConfig = async (cwd?: string): Promise<ResolvedConfig> => {
  const filePath = await findConfigPathOrThrow(cwd);
  const loaded = await loadConfig(filePath);
  const projectConfig = parseConfig(loaded.content, loaded.filePath);

  const globalConfig = await loadGlobalConfig();
  const mergedConfig = globalConfig ? mergeConfigs(globalConfig, projectConfig) : projectConfig;

  return {
    schemaVersion: 1,
    filePath,
    config: mergedConfig,
  };
};

/** Optional preferences for commands that also work outside a configured project. */
export const loadOptionalResolvedConfig = async (cwd?: string): Promise<ResolvedConfig | null> => {
  if (await findConfigFile({ cwd })) return await loadResolvedConfig(cwd);
  const global = await loadGlobalConfig();
  return global ? { schemaVersion: 1, filePath: getGlobalConfigPath(), config: global } : null;
};

const getRawConfigVersion = (content: string, filePath: string): number | null =>
  parseSupportedConfigVersion(parseConfigObject(content, filePath).version);

export const validateResolvedConfig = async (cwd?: string): Promise<ConfigValidationResult> => {
  const resolved = await loadResolvedConfig(cwd);
  const warnings = getValidationWarnings(resolved.config);

  return {
    schemaVersion: 1,
    status: warnings.length > 0 ? 'warning' : 'ok',
    filePath: resolved.filePath,
    config: resolved.config,
    warnings,
  };
};

export const getResolvedConfigValue = async (
  key: string,
  cwd?: string
): Promise<ConfigGetResult> => {
  const configKey = assertConfigKey(key);
  const resolved = await loadResolvedConfig(cwd);

  return {
    schemaVersion: 1,
    status: 'ok',
    filePath: resolved.filePath,
    key: configKey,
    value: getConfigValue(resolved.config, configKey),
  };
};

export const setResolvedConfigValue = async (
  key: string,
  value: string,
  options: ConfigWriteOptions & { global?: boolean } = {}
): Promise<ConfigSetResult> => {
  const configKey = assertConfigKey(key);
  const normalizedValue = normalizeConfigValue(configKey, value);
  assertNoSecretValues(normalizedValue ?? '');

  const filePath = options.global
    ? getGlobalConfigPath()
    : await findConfigPathOrThrow(options.cwd);

  let loadedContent = '';
  let originalContent: string | null = null;
  let currentConfig = createDefaultConfig();

  if (await isReadableFile(filePath)) {
    const loaded = await loadConfig(filePath);
    loadedContent = loaded.content;
    originalContent = loaded.content;
  }
  options.onInput?.(originalContent);
  if (options.yes) assertExpectedConfigContent(originalContent, options.expectedInputContent);
  if (originalContent !== null) currentConfig = parseConfig(loadedContent, filePath);

  const nextConfig = withConfigValue(currentConfig, configKey, normalizedValue);

  let content = '';
  const extension = path.extname(filePath).toLowerCase();

  if (loadedContent && ['.yml', '.yaml', ''].includes(extension)) {
    const modified = modifyYamlContent(loadedContent, configKey, normalizedValue);
    if (modified) {
      content = modified;
    }
  }

  if (!content) {
    if (loadedContent) {
      assertNoUnknownConfigKeysOnRewrite(loadedContent, filePath);
    }

    content = serializeConfig(nextConfig, filePath);
  }

  if (options.yes) {
    assertExpectedConfigContent(content, options.expectedContent);
    await replaceConfigFile(filePath, content, originalContent);
  }

  return {
    schemaVersion: 1,
    status: options.yes ? 'ok' : 'preview',
    filePath,
    key: configKey,
    oldValue: getConfigValue(currentConfig, configKey),
    newValue: getConfigValue(nextConfig, configKey),
    content,
    wroteFile: Boolean(options.yes),
  };
};

export const migrateResolvedConfig = async (
  options: ConfigWriteOptions = {}
): Promise<ConfigMigrationResult> => {
  const filePath = await findConfigPathOrThrow(options.cwd);
  const loaded = await loadConfig(filePath);
  options.onInput?.(loaded.content);
  if (options.yes) assertExpectedConfigContent(loaded.content, options.expectedInputContent);
  const fromVersion = getRawConfigVersion(loaded.content, loaded.filePath);
  const config = parseConfig(loaded.content, loaded.filePath);
  assertNoUnknownConfigKeysOnRewrite(loaded.content, filePath);
  const content = serializeConfig(config, filePath);
  const changed = fromVersion !== 1 || stripUtf8Bom(loaded.content) !== content;

  if (options.yes) assertExpectedConfigContent(content, options.expectedContent);
  if (!changed) {
    return {
      schemaVersion: 1,
      status: 'ok',
      filePath,
      fromVersion,
      toVersion: 1,
      changed: false,
      content,
      wroteFile: false,
    };
  }

  if (options.yes) {
    await replaceConfigFile(filePath, content, loaded.content);
  }

  return {
    schemaVersion: 1,
    status: options.yes ? 'ok' : 'preview',
    filePath,
    fromVersion,
    toVersion: 1,
    changed,
    content,
    wroteFile: Boolean(options.yes),
  };
};
