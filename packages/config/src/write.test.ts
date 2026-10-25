import {
  chmod,
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig, setResolvedConfigValue } from './index';
import { replaceConfigFile } from './write';

describe('complete config file replacement', () => {
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'preserves the original and cleans temporary files when the directory cannot be written',
    async () => {
      const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-config-readonly-'));
      const file = path.join(cwd, 'zw.yml');
      try {
        await writeFile(file, 'original');
        await chmod(cwd, 0o500);
        await expect(replaceConfigFile(file, 'replacement', 'original')).rejects.toMatchObject({
          code: 'CONFIG_WRITE_FAILED',
        });
        expect(await readFile(file, 'utf8')).toBe('original');
        expect(await readdir(cwd)).toEqual(['zw.yml']);
      } finally {
        await chmod(cwd, 0o700);
        await rm(cwd, { recursive: true, force: true });
      }
    }
  );
  it('updates an empty config and preserves file permissions without leftover temporary files', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-config-atomic-'));
    const file = path.join(cwd, 'zw.yml');
    try {
      await writeFile(file, '');
      if (process.platform !== 'win32') await chmod(file, 0o664);
      await setResolvedConfigValue('project.name', 'New project', { cwd, yes: true });
      expect(await readFile(file, 'utf8')).toContain('New project');
      if (process.platform !== 'win32') expect((await stat(file)).mode & 0o777).toBe(0o664);
      expect(await readdir(cwd)).toEqual(['zw.yml']);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
  it('refuses to replace a changed file or clobber a concurrently created global config', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-config-atomic-'));
    const file = path.join(cwd, 'zw.yml');
    try {
      await writeFile(file, 'concurrent edit');
      await expect(replaceConfigFile(file, 'unapproved', 'old')).rejects.toMatchObject({
        code: 'OPERATION_PLAN_MISMATCH',
      });
      await expect(replaceConfigFile(file, 'unapproved', null)).rejects.toMatchObject({
        code: 'OPERATION_PLAN_MISMATCH',
      });
      expect(await readFile(file, 'utf8')).toBe('concurrent edit');
      expect(await readdir(cwd)).toEqual(['zw.yml']);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
  it.skipIf(process.platform === 'win32')(
    'refuses a linked config and preserves its destination',
    async () => {
      const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-config-link-'));
      const source = path.join(cwd, 'original.yml');
      try {
        await writeFile(source, 'project:\n  name: original\n');
        await symlink(source, path.join(cwd, 'zw.yml'));
        await expect(
          setResolvedConfigValue('project.name', 'new', { cwd, yes: true })
        ).rejects.toMatchObject({ code: 'CONFIG_WRITE_FAILED' });
        expect(await readFile(source, 'utf8')).toContain('original');
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    }
  );
  it('bounds config reads before parsing', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-config-large-'));
    const file = path.join(cwd, 'zw.yml');
    try {
      const handle = await open(file, 'w');
      try {
        await handle.truncate(1024 * 1024 + 1);
      } finally {
        await handle.close();
      }
      await expect(loadConfig(file)).rejects.toMatchObject({
        code: 'CONFIG_PARSE_FAILED',
        message: 'ZaoWu config is too large.',
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
