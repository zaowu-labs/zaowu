import {
  chmod,
  mkdir,
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
import { loadConfig, migrateResolvedConfig, setResolvedConfigValue } from './index';
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
  it('refuses output exceeding the read limit in preview and confirmation', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-config-limit-'));
    const file = path.join(cwd, 'zw.yml');
    const prefix = '#'.repeat(1024 * 1024 - 36);
    const content = prefix + '\nproject:\n  name: small\n';
    try {
      await writeFile(file, content);
      for (const yes of [false, true]) {
        await expect(
          setResolvedConfigValue('project.name', '造物'.repeat(8), { cwd, yes })
        ).rejects.toMatchObject({ code: 'CONFIG_VALUE_INVALID' });
      }
      expect(await readFile(file, 'utf8')).toBe(content);
      await writeFile(file, 'project: {name: "' + 'X'.repeat(1024 * 1024 - 48) + '"}\n');
      await expect(migrateResolvedConfig({ cwd, yes: true })).rejects.toMatchObject({
        code: 'CONFIG_VALUE_INVALID',
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('refuses malformed UTF-8 before a config edit can replace user bytes', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-config-encoding-'));
    const file = path.join(cwd, 'zw.yml');
    const original = Buffer.concat([
      Buffer.from('# '),
      Buffer.from([0xff]),
      Buffer.from('\nproject: {name: old}\n'),
    ]);
    try {
      await writeFile(file, original);
      await expect(
        setResolvedConfigValue('project.name', 'new', { cwd, yes: true })
      ).rejects.toMatchObject({ code: 'CONFIG_PARSE_FAILED' });
      expect(await readFile(file)).toEqual(original);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
  it.skipIf(process.platform === 'win32')(
    'keeps an unavailable local config from redirecting a write to the parent',
    async () => {
      const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-config-scope-'));
      const child = path.join(cwd, 'child');
      const parentConfig = path.join(cwd, 'zw.yml');
      const content = 'project: {name: parent}\n';
      try {
        await writeFile(parentConfig, content);
        await mkdir(child);
        await symlink('unavailable', path.join(child, 'zw.yml'));
        await expect(
          setResolvedConfigValue('project.name', 'child', { cwd: child, yes: true })
        ).rejects.toMatchObject({ code: 'CONFIG_PARSE_FAILED' });
        expect(await readFile(parentConfig, 'utf8')).toBe(content);
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
