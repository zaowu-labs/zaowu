import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONFIG_DOMAIN, findConfigFile, loadConfig } from './index';

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
});
