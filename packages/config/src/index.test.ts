import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONFIG_DOMAIN,
  findConfigFile,
  findConfigPathOrThrow,
  getResolvedConfigValue,
  loadConfig,
  loadResolvedConfig,
  migrateResolvedConfig,
  parseConfig,
  setResolvedConfigValue,
  validateResolvedConfig,
} from './index';

describe('config utilities', () => {
  it('defines the config domain boundary', () => {
    expect(CONFIG_DOMAIN.name).toBe('config');
    expect(CONFIG_DOMAIN.commands.map((command) => command.name)).toEqual([
      'show',
      'path',
      'validate',
      'get',
      'set',
      'migrate',
    ]);
  });

  it('finds a config file by walking up from the current directory', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-config-'));
    const nested = path.join(root, 'a', 'b');

    await writeFile(path.join(root, 'zw.yml'), 'project:\n  name: test\n', 'utf8');

    try {
      const found = await findConfigFile({ cwd: nested });

      expect(found).toBe(path.join(root, 'zw.yml'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not treat a config-named directory as a config file', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-config-'));

    await mkdir(path.join(root, 'zw.yml'));

    try {
      await expect(findConfigFile({ cwd: root })).resolves.toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('loads config file content without parsing it yet', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-config-'));
    const filePath = path.join(root, 'zw.yml');

    await writeFile(filePath, 'project:\n  name: test\n', 'utf8');

    try {
      await expect(loadConfig(filePath)).resolves.toEqual({
        filePath,
        content: 'project:\n  name: test\n',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('parses supported YAML config with defaults', () => {
    expect(parseConfig(`project:\n  name: demo\n\nai:\n  provider: echo\n`, 'zw.yml')).toEqual({
      version: 1,
      project: {
        name: 'demo',
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
    });
  });

  it('parses config files with a UTF-8 BOM', () => {
    expect(parseConfig('\uFEFFproject:\n  name: demo\n', 'zw.yml').project.name).toBe('demo');
    expect(
      parseConfig('\uFEFF{"project":{"name":"json-demo"}}', 'zaowu.config.json').project.name
    ).toBe('json-demo');
  });

  it('rejects unsupported config versions', () => {
    expect(() => parseConfig('version: 2\nproject:\n  name: demo\n', 'zw.yml')).toThrow(
      'Config version is not supported.'
    );
  });

  it('rejects secret-like keys in config', () => {
    expect(() => parseConfig('ai:\n  apiKey: should-not-live-here\n', 'zw.yml')).toThrow(
      'Config contains a secret-like key.'
    );
  });

  it('loads and resolves the nearest config', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-config-'));
    const nested = path.join(root, 'nested');

    await mkdir(nested);
    await writeFile(path.join(root, 'zw.yml'), 'project:\n  name: resolved\n', 'utf8');

    try {
      await expect(loadResolvedConfig(nested)).resolves.toMatchObject({
        filePath: path.join(root, 'zw.yml'),
        config: {
          project: {
            name: 'resolved',
          },
        },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns an actionable error when no config exists', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-config-'));

    try {
      await expect(findConfigPathOrThrow(root)).rejects.toThrow('ZaoWu config not found.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('validates resolved config and reports warnings', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-config-'));

    await writeFile(path.join(root, 'zw.yml'), 'project:\n  name: resolved\n', 'utf8');

    try {
      await expect(validateResolvedConfig(root)).resolves.toMatchObject({
        schemaVersion: 1,
        status: 'warning',
        warnings: ['AI provider is not set; ZaoWu will use the local echo provider by default.'],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('gets supported config keys', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-config-'));

    await writeFile(path.join(root, 'zw.yml'), 'project:\n  name: resolved\n', 'utf8');

    try {
      await expect(getResolvedConfigValue('project.name', root)).resolves.toMatchObject({
        status: 'ok',
        key: 'project.name',
        value: 'resolved',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('previews config set without writing by default', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-config-'));
    const filePath = path.join(root, 'zw.yml');

    await writeFile(filePath, 'project:\n  name: old\n', 'utf8');

    try {
      await expect(setResolvedConfigValue('project.name', 'new', { cwd: root })).resolves.toEqual({
        status: 'preview',
        filePath,
        key: 'project.name',
        oldValue: 'old',
        newValue: 'new',
        content:
          'version: 1\n' +
          '\n' +
          'project:\n' +
          '  name: new\n' +
          '\n' +
          'ai:\n' +
          '  provider: null\n' +
          '\n' +
          'defaults:\n' +
          '  output: human\n' +
          '\n' +
          'paths:\n' +
          '  workspace: .\n' +
          '  cache: .zaowu/cache\n',
        wroteFile: false,
      });
      await expect(loadResolvedConfig(root)).resolves.toMatchObject({
        config: {
          project: {
            name: 'old',
          },
        },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('writes config set when confirmed', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-config-'));

    await writeFile(path.join(root, 'zaowu.config.json'), '{"project":{"name":"old"}}', 'utf8');

    try {
      await expect(
        setResolvedConfigValue('defaults.output', 'json', { cwd: root, yes: true })
      ).resolves.toMatchObject({
        status: 'ok',
        key: 'defaults.output',
        oldValue: 'human',
        newValue: 'json',
        wroteFile: true,
      });
      await expect(loadResolvedConfig(root)).resolves.toMatchObject({
        config: {
          defaults: {
            output: 'json',
          },
        },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('previews migration from legacy config to versioned canonical config', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-config-'));
    const filePath = path.join(root, 'zw.yml');

    await writeFile(filePath, 'project:\n  name: legacy\n', 'utf8');

    try {
      await expect(migrateResolvedConfig({ cwd: root })).resolves.toMatchObject({
        status: 'preview',
        filePath,
        fromVersion: null,
        toVersion: 1,
        changed: true,
        wroteFile: false,
        content: expect.stringContaining('version: 1'),
      });
      await expect(loadConfig(filePath)).resolves.toMatchObject({
        content: 'project:\n  name: legacy\n',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('writes migrated config when confirmed', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-config-'));
    const filePath = path.join(root, 'zw.yml');

    await writeFile(filePath, 'project:\n  name: legacy\n', 'utf8');

    try {
      await expect(migrateResolvedConfig({ cwd: root, yes: true })).resolves.toMatchObject({
        status: 'ok',
        changed: true,
        wroteFile: true,
      });
      await expect(loadConfig(filePath)).resolves.toMatchObject({
        content: expect.stringContaining('version: 1'),
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects unsupported config keys and invalid values', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-config-'));

    await writeFile(path.join(root, 'zw.yml'), 'project:\n  name: resolved\n', 'utf8');

    try {
      await expect(getResolvedConfigValue('ai.apiKey', root)).rejects.toThrow(
        'Config key looks like a secret.'
      );
      await expect(setResolvedConfigValue('defaults.output', 'xml', { cwd: root })).rejects.toThrow(
        'Config value is invalid.'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
