import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { installPlugin, listPlugins, PLUGIN_DOMAIN, removePlugin } from './index';

describe('plugin domain', () => {
  it('declares plugin workflow commands', () => {
    expect(PLUGIN_DOMAIN.name).toBe('plugin');
    expect(PLUGIN_DOMAIN.commands.map((command) => command.name)).toEqual([
      'list',
      'install',
      'remove',
    ]);
  });

  it('previews plugin installation without writing by default', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-plugin-'));

    try {
      await expect(installPlugin('readme-gen', { cwd: root })).resolves.toMatchObject({
        status: 'preview',
        wroteFile: false,
        plugin: {
          id: 'readme-gen',
          source: 'readme-gen',
          installedAt: null,
        },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('installs and lists local plugin manifests when confirmed', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-plugin-'));

    try {
      await installPlugin('readme-gen', {
        cwd: root,
        yes: true,
        installedAt: '2026-06-03T00:00:00.000Z',
      });

      await expect(
        readFile(path.join(root, '.zaowu', 'plugins', 'readme-gen.json'), 'utf8')
      ).resolves.toContain('readme-gen');
      await expect(listPlugins({ cwd: root })).resolves.toMatchObject({
        plugins: [
          {
            id: 'readme-gen',
            installedAt: '2026-06-03T00:00:00.000Z',
          },
        ],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('previews plugin removal without deleting by default', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-plugin-'));

    try {
      await expect(removePlugin('readme-gen', { cwd: root })).resolves.toMatchObject({
        status: 'preview',
        removedFile: false,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
