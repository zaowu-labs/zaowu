import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrateResolvedConfig, parseConfig, setResolvedConfigValue } from './index';

describe('config editing regressions', () => {
  it.each([
    'project:\n  name: |\n    old multiline\n    value\ncustom:\n  keep: me\n',
    'project: {name: old}\ncustom: {keep: me}\n',
    'project:\n  nested:\n    name: untouched\n  name: old # keep this comment\n',
    '\uFEFFproject:\r\n  name: old\r\n',
    'project:\n  name:\n',
    'project:\n  name: # keep this comment\n',
  ])('updates the intended scalar without corrupting YAML: %s', async (content) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-config-edit-'));
    const file = path.join(root, 'zw.yml');
    try {
      await writeFile(file, content);
      const preview = await setResolvedConfigValue('project.name', 'new', { cwd: root });
      expect(parseConfig(preview.content).project.name).toBe('new');
      if (content.includes('keep')) expect(preview.content).toContain('keep');
      if (content.includes('untouched')) expect(preview.content).toContain('name: untouched');
      if (content.includes('# keep')) expect(preview.content).toContain('# keep this comment');
      expect(await readFile(file, 'utf8')).toBe(content);
      const confirmed = await setResolvedConfigValue('project.name', 'new', {
        cwd: root,
        yes: true,
      });
      expect(confirmed.content).toBe(preview.content);
      expect(parseConfig(await readFile(file, 'utf8')).project.name).toBe('new');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not mistake a nested version for the root config version', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-config-edit-'));
    const content = 'custom:\n  version: 9\nversion: 1\n';
    try {
      await writeFile(path.join(root, 'zw.yml'), content);
      const result = await setResolvedConfigValue('version', '1', { cwd: root });
      expect(result.content).toBe(content);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(['constructor', 'toString', '__proto__'])('does not drop unknown key %s', async (key) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-config-edit-'));
    const content = `{"${key}":{"keep":true},"project":{"name":"old"}}`;
    const file = path.join(root, 'zaowu.config.json');
    try {
      await writeFile(file, content);
      await expect(
        setResolvedConfigValue('project.name', 'new', { cwd: root, yes: true })
      ).rejects.toMatchObject({ code: 'CONFIG_KEY_UNSUPPORTED' });
      await expect(migrateResolvedConfig({ cwd: root, yes: true })).rejects.toMatchObject({
        code: 'CONFIG_KEY_UNSUPPORTED',
      });
      expect(await readFile(file, 'utf8')).toBe(content);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(['null', '[]', 'true', '42', '"text"'])(
    'rejects a non-object JSON root: %s',
    (content) => {
      expect(() => parseConfig(content, 'zaowu.config.json')).toThrow(
        'Could not parse ZaoWu config.'
      );
    }
  );

  it('handles recursive YAML aliases without overflowing the stack', () => {
    expect(
      parseConfig('custom: &self\n  child: *self\nproject:\n  name: demo\n').project.name
    ).toBe('demo');
    expect(() => parseConfig('custom: &self\n  child: *self\n  token: hidden\n')).toThrow(
      'Config contains a secret-like key.'
    );
  });
});
