import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  installPlugin,
  listPlugins,
  PLUGIN_DOMAIN,
  removePlugin,
  validatePluginSource,
} from './index';

describe('plugin domain', () => {
  it('declares plugin workflow commands', () => {
    expect(PLUGIN_DOMAIN.name).toBe('plugin');
    expect(PLUGIN_DOMAIN.commands.map((command) => command.name)).toEqual([
      'list',
      'install',
      'remove',
      'validate',
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

  it('validates a local plugin manifest', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-plugin-'));

    await writeFile(
      path.join(root, 'zaowu.plugin.json'),
      JSON.stringify({
        id: 'readme-gen',
        version: '0.1.0',
        commands: [
          {
            name: 'generate',
          },
        ],
      }),
      'utf8'
    );

    try {
      await expect(validatePluginSource(root)).resolves.toMatchObject({
        status: 'ok',
        manifest: {
          id: 'readme-gen',
        },
        errors: [],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports invalid local plugin manifests', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-plugin-'));

    await writeFile(path.join(root, 'zaowu.plugin.json'), JSON.stringify({ id: 'Bad Id' }), 'utf8');

    try {
      await expect(validatePluginSource(root)).resolves.toMatchObject({
        status: 'warning',
        errors: ['Manifest `id` must be a valid plugin id.'],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('previews installation from a local source directory', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-plugin-'));
    const source = path.join(root, 'source');

    await mkdir(source);
    await writeFile(
      path.join(source, 'zaowu.plugin.json'),
      JSON.stringify({ id: 'local-tool' }),
      'utf8'
    );

    try {
      await expect(installPlugin('local-tool', { cwd: root, source })).resolves.toMatchObject({
        status: 'preview',
        plugin: {
          id: 'local-tool',
          source,
        },
        wroteFile: false,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
