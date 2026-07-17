import { constants } from 'node:fs';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import {
  createCapabilityLedger,
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
const CONFIG_KEYS: readonly ConfigKey[] = [
  'version',
  'project.name',
  'ai.provider',
  'defaults.output',
  'paths.workspace',
  'paths.cache',
];

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

export const createDefaultConfig = (): ZaoWuConfig => ({
  version: DEFAULT_CONFIG.version,
  project: {
    ...DEFAULT_CONFIG.project,
  },
  ai: {
    ...DEFAULT_CONFIG.ai,
  },
  defaults: {
    ...DEFAULT_CONFIG.defaults,
  },
  paths: {
    ...DEFAULT_CONFIG.paths,
  },
});

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
    try {
      const content = await readFile(globalPath, 'utf8');
      return parseConfig(content, globalPath);
    } catch {
      // Global config is optional — silently ignore parse errors and fall back to defaults.
      return null;
    }
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
  const lines = content.split(/\r?\n/);
  const parts = key.split('.');

  if (parts.length === 1) {
    const searchKey = parts[0];
    const index = lines.findIndex((l) => new RegExp(`^${searchKey}:\\s*`).test(l.trim()));
    const formattedValue = formatYamlConfigValue(key, value);
    if (index !== -1) {
      lines[index] = `${searchKey}: ${formattedValue}`;
      return lines.join('\n');
    }
  } else if (parts.length === 2) {
    const section = parts[0];
    const subKey = parts[1];

    let inSection = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const indent = line.length - line.trimStart().length;

      if (indent === 0 && trimmed.startsWith(`${section}:`)) {
        inSection = true;
        continue;
      }

      if (inSection && indent === 0 && trimmed && !trimmed.startsWith('#')) {
        break;
      }

      if (inSection && indent > 0 && trimmed.startsWith(`${subKey}:`)) {
        const formattedValue = formatYamlConfigValue(key, value);
        const leadingIndent = ' '.repeat(indent);
        lines[i] = `${leadingIndent}${subKey}: ${formattedValue}`;
        return lines.join('\n');
      }
    }
  }

  return '';
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

const parseConfigObject = (content: string, filePath: string): Record<string, unknown> => {
  const normalizedContent = stripUtf8Bom(content);
  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.json' || path.basename(filePath) === '.zaowurc') {
    try {
      return JSON.parse(normalizedContent) as Record<string, unknown>;
    } catch (error) {
      throw new ZaoWuError({
        code: 'CONFIG_PARSE_FAILED',
        message: 'Could not parse ZaoWu config.',
        why: error instanceof Error ? error.message : 'The JSON parser rejected the file.',
        fix: 'Fix the JSON syntax and run `zw config show` again.',
      });
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
      throw new ZaoWuError({
        code: 'CONFIG_PARSE_FAILED',
        message: 'Could not parse ZaoWu config.',
        why: error instanceof Error ? error.message : 'The YAML parser rejected the file.',
        fix: 'Use the supported simple subset (top-level keys + one level of 2-space indented sections) or switch to JSON (zaowu.config.json).',
      });
    }
  }

  throw new ZaoWuError({
    code: 'CONFIG_FORMAT_UNSUPPORTED',
    message: 'Config format is not supported yet.',
    why: `ZaoWu can find ${path.basename(filePath)}, but this first version reads YAML and JSON only.`,
    fix: 'Use `zw.yml`, `zw.yaml`, `zaowu.config.json`, or `.zaowurc` for now.',
  });
};

const assertNoSecretKeys = (value: unknown, pathParts: readonly string[] = []): void => {
  if (!value || typeof value !== 'object') {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new ZaoWuError({
        code: 'CONFIG_SECRET_KEY_NOT_ALLOWED',
        message: 'Config contains a secret-like key.',
        why: `The key \`${[...pathParts, key].join('.')}\` looks like a secret and should not be stored in ZaoWu config.`,
        fix: 'Move secrets to environment variables or a future explicit secret provider.',
      });
    }

    assertNoSecretKeys(child, [...pathParts, key]);
  }
};

const getObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const getString = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const getOutput = (value: unknown): 'human' | 'json' => (value === 'json' ? 'json' : 'human');

const getVersion = (value: unknown): 1 => {
  if (value === undefined || value === null || value === '' || value === 1 || value === '1') {
    return 1;
  }

  throw new ZaoWuError({
    code: 'CONFIG_VERSION_UNSUPPORTED',
    message: 'Config version is not supported.',
    why: `ZaoWu supports config version 1, but this file declares \`${String(value)}\`.`,
    fix: 'Run a newer ZaoWu version that supports this config, or migrate the file manually.',
  });
};

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

const normalizeConfigValue = (key: ConfigKey, value: string): string | null => {
  const trimmed = value.trim();

  if (key === 'ai.provider' && ['none', 'null'].includes(trimmed.toLowerCase())) {
    return null;
  }

  if (key === 'defaults.output' && !['human', 'json'].includes(trimmed)) {
    throw new ZaoWuError({
      code: 'CONFIG_VALUE_INVALID',
      message: 'Config value is invalid.',
      why: '`defaults.output` must be either `human` or `json`.',
      fix: 'Run `zw config set defaults.output json --yes` or `zw config set defaults.output human --yes`.',
    });
  }

  if (key === 'version' && trimmed !== '1') {
    throw new ZaoWuError({
      code: 'CONFIG_VALUE_INVALID',
      message: 'Config value is invalid.',
      why: '`version` must be `1` in this ZaoWu release.',
      fix: 'Run `zw config migrate` to preview the supported config version.',
    });
  }

  if (!trimmed) {
    throw new ZaoWuError({
      code: 'CONFIG_VALUE_INVALID',
      message: 'Config value is invalid.',
      why: `\`${key}\` cannot be empty.`,
      fix: 'Provide a non-empty value.',
    });
  }

  if (['paths.workspace', 'paths.cache'].includes(key)) {
    return trimmed.replace(/\\/g, '/');
  }

  return trimmed;
};

const getConfigValue = (config: ZaoWuConfig, key: ConfigKey): string | null => {
  switch (key) {
    case 'version':
      return String(config.version);
    case 'project.name':
      return config.project.name;
    case 'ai.provider':
      return config.ai.provider;
    case 'defaults.output':
      return config.defaults.output;
    case 'paths.workspace':
      return config.paths.workspace;
    case 'paths.cache':
      return config.paths.cache;
  }
};

const withConfigValue = (
  config: ZaoWuConfig,
  key: ConfigKey,
  value: string | null
): ZaoWuConfig => {
  const next: ZaoWuConfig = {
    version: config.version,
    project: { ...config.project },
    ai: { ...config.ai },
    defaults: { ...config.defaults },
    paths: { ...config.paths },
  };

  switch (key) {
    case 'version':
      next.version = 1;
      break;
    case 'project.name':
      next.project.name = value ?? DEFAULT_CONFIG.project.name;
      break;
    case 'ai.provider':
      next.ai.provider = value;
      break;
    case 'defaults.output':
      next.defaults.output = value === 'json' ? 'json' : 'human';
      break;
    case 'paths.workspace':
      next.paths.workspace = value ?? DEFAULT_CONFIG.paths.workspace;
      break;
    case 'paths.cache':
      next.paths.cache = value ?? DEFAULT_CONFIG.paths.cache;
      break;
  }

  return next;
};

export const serializeConfig = (config: ZaoWuConfig, filePath: string): string => {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.json' || path.basename(filePath) === '.zaowurc') {
    return `${JSON.stringify(config, null, 2)}\n`;
  }

  return [
    'version: 1',
    '',
    'project:',
    `  name: ${formatYamlConfigValue('project.name', config.project.name)}`,
    '',
    'ai:',
    `  provider: ${formatYamlConfigValue('ai.provider', config.ai.provider)}`,
    '',
    'defaults:',
    `  output: ${formatYamlConfigValue('defaults.output', config.defaults.output)}`,
    '',
    'paths:',
    `  workspace: ${formatYamlConfigValue('paths.workspace', config.paths.workspace)}`,
    `  cache: ${formatYamlConfigValue('paths.cache', config.paths.cache)}`,
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

const getRawConfigVersion = (content: string, filePath: string): number | null => {
  const parsed = parseConfigObject(content, filePath);
  const rawVersion = parsed.version;

  if (rawVersion === undefined || rawVersion === null || rawVersion === '') {
    return null;
  }

  if (rawVersion === 1 || rawVersion === '1') {
    return 1;
  }

  throw new ZaoWuError({
    code: 'CONFIG_VERSION_UNSUPPORTED',
    message: 'Config version is not supported.',
    why: `ZaoWu supports config version 1, but this file declares \`${String(rawVersion)}\`.`,
    fix: 'Run a newer ZaoWu version that supports this config, or migrate the file manually.',
  });
};

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
  options: { cwd?: string; yes?: boolean; global?: boolean } = {}
): Promise<ConfigSetResult> => {
  const configKey = assertConfigKey(key);
  const normalizedValue = normalizeConfigValue(configKey, value);
  assertNoSecretValues(normalizedValue ?? '');

  const filePath = options.global
    ? getGlobalConfigPath()
    : await findConfigPathOrThrow(options.cwd);

  let loadedContent = '';
  let currentConfig = createDefaultConfig();

  if (await isReadableFile(filePath)) {
    const loaded = await loadConfig(filePath);
    loadedContent = loaded.content;
    currentConfig = parseConfig(loadedContent, filePath);
  }

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
    content = serializeConfig(nextConfig, filePath);
  }

  if (options.yes) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');
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
  options: { cwd?: string; yes?: boolean } = {}
): Promise<ConfigMigrationResult> => {
  const filePath = await findConfigPathOrThrow(options.cwd);
  const loaded = await loadConfig(filePath);
  const fromVersion = getRawConfigVersion(loaded.content, loaded.filePath);
  const config = parseConfig(loaded.content, loaded.filePath);
  const content = serializeConfig(config, filePath);
  const changed = fromVersion !== 1 || stripUtf8Bom(loaded.content) !== content;

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
    await writeFile(filePath, content, 'utf8');
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
