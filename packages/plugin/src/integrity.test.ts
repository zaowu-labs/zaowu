import { chmod, mkdir, mkdtemp, open, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { installPlugin, listPlugins, removePlugin, validatePluginSource } from './index';

describe('installed plugin metadata integrity', () => {
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'reports directory read/removal failures without claiming an empty list or success',
    async () => {
      const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-plugin-permission-'));
      const directory = path.join(cwd, '.zaowu', 'plugins');
      try {
        await installPlugin('expected', { cwd, yes: true });
        await chmod(directory, 0o500);
        await expect(removePlugin('expected', { cwd, yes: true })).rejects.toMatchObject({
          code: 'PLUGIN_WRITE_FAILED',
        });
        expect(await readFile(path.join(directory, 'expected.json'), 'utf8')).toContain('expected');
        await chmod(directory, 0o100);
        await expect(listPlugins({ cwd })).rejects.toMatchObject({ code: 'PLUGIN_READ_FAILED' });
      } finally {
        await chmod(directory, 0o700);
        await rm(cwd, { recursive: true, force: true });
      }
    }
  );
  it.each(['null', '[]', '42', '{"id":"wrong","source":"private","installedAt":null}'])(
    'does not emit invalid installed JSON: %s',
    async (content) => {
      const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-plugin-integrity-'));
      try {
        await mkdir(path.join(cwd, '.zaowu', 'plugins'), { recursive: true });
        await writeFile(path.join(cwd, '.zaowu', 'plugins', 'expected.json'), content);
        expect((await listPlugins({ cwd })).plugins).toEqual([
          { id: 'expected', source: 'unreadable', installedAt: null },
        ]);
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    }
  );
  it('resolves relative plugin sources from the supplied project and strips unknown installed fields', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-plugin-source-'));
    try {
      await writeFile(path.join(cwd, 'plugin.json'), '{"id":"expected"}');
      const result = await installPlugin('expected', { cwd, source: './plugin.json', yes: true });
      expect(result.plugin.source).toBe(path.join(cwd, 'plugin.json'));
      await writeFile(
        path.join(result.pluginDir, 'expected.json'),
        '{"id":"expected","source":"local","installedAt":null,"private":"never expose"}'
      );
      expect((await listPlugins({ cwd })).plugins).toEqual([
        { id: 'expected', source: 'local', installedAt: null },
      ]);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
  it('bounds source metadata before parsing', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-plugin-large-'));
    const file = path.join(cwd, 'plugin.json');
    try {
      const handle = await open(file, 'w');
      try {
        await handle.truncate(1024 * 1024 + 1);
      } finally {
        await handle.close();
      }
      const result = await validatePluginSource(file);
      expect(result.status).toBe('warning');
      expect(result.errors.join(' ')).toContain('one MiB');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
  it.skipIf(process.platform === 'win32')('does not follow installed manifest links', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-plugin-file-link-'));
    try {
      const directory = path.join(cwd, '.zaowu', 'plugins');
      await mkdir(directory, { recursive: true });
      const outside = path.join(cwd, 'private.json');
      await writeFile(outside, '{"id":"expected","source":"private","installedAt":null}');
      await symlink(outside, path.join(directory, 'expected.json'));
      expect((await listPlugins({ cwd })).plugins).toEqual([
        { id: 'expected', source: 'unreadable', installedAt: null },
      ]);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
