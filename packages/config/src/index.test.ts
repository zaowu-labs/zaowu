import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONFIG_DOMAIN,
  findConfigFile,
  findConfigPathOrThrow,
  loadConfig,
  loadResolvedConfig,
  parseConfig,
} from './index';

describe('config utilities', () => {
  it('defines the config domain boundary', () => {
    expect(CONFIG_DOMAIN.name).toBe('config');
    expect(CONFIG_DOMAIN.commands.map((command) => command.name)).toEqual(['show', 'path']);
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
});
