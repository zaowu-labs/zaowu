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

  it('refuses to overwrite an installed plugin manifest', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-plugin-'));

    try {
      await installPlugin('readme-gen', {
        cwd: root,
        yes: true,
        installedAt: '2026-06-03T00:00:00.000Z',
      });

      await expect(installPlugin('readme-gen', { cwd: root, yes: true })).rejects.toThrow(
        'Plugin is already installed.'
      );
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

  it('removes an installed plugin and rejects confirmed removal of missing plugins', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-plugin-'));
    const pluginPath = path.join(root, '.zaowu', 'plugins', 'readme-gen.json');

    try {
      await installPlugin('readme-gen', {
        cwd: root,
        yes: true,
        installedAt: '2026-06-03T00:00:00.000Z',
      });
      await expect(removePlugin('readme-gen', { cwd: root, yes: true })).resolves.toMatchObject({
        status: 'ok',
        removedFile: true,
      });
      await expect(readFile(pluginPath, 'utf8')).rejects.toThrow();
      await expect(removePlugin('readme-gen', { cwd: root, yes: true })).rejects.toThrow(
        'Plugin is not installed.'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('validates a local plugin manifest', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-plugin-'));

    await writeFile(
      path.join(root, 'zaowu.plugin.json'),
      JSON.stringify({
        schemaVersion: 1,
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

  it('reports unsupported plugin schema versions and duplicate commands', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-plugin-'));

    await writeFile(
      path.join(root, 'zaowu.plugin.json'),
      JSON.stringify({
        schemaVersion: 2,
        id: 'local-tool',
        name: 123,
        commands: [
          {
            name: 'generate',
            summary: 'Generate output',
          },
          {
            name: 'generate',
            summary: 123,
          },
        ],
      }),
      'utf8'
    );

    try {
      await expect(validatePluginSource(root)).resolves.toMatchObject({
        status: 'warning',
        errors: [
          'Manifest `schemaVersion` must be 1 when provided.',
          'Manifest `name` must be a string when provided.',
          'Command `generate` is duplicated.',
          'Command `generate` summary must be a string.',
        ],
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
