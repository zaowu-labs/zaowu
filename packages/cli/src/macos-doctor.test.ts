import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { checkAppleGit, checkMacEnvironment } from './macos-doctor';
import { executeCli } from './run';

const diagnostics = (translation = '0') =>
  vi.fn((command: string) => {
    if (command === '/usr/bin/sw_vers') return '15.7.1';
    if (command === '/usr/bin/arch') return translation;
    throw new Error(`Unexpected diagnostic ${command}`);
  });

describe('macOS doctor', () => {
  it.each([
    ['arm64', '0', 'ok', 'Apple Silicon · Node.js arm64'],
    ['x64', '', 'ok', 'Intel Mac · Node.js x64'],
    ['x64', '1', 'warning', 'Apple Silicon · Node.js x64 via Rosetta'],
  ] as const)(
    'describes a %s runtime with translation result %s',
    async (architecture, translated, status, details) => {
      const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-mac-runtime-'));
      const commandRunner = diagnostics(translated);
      try {
        const result = await checkMacEnvironment({
          cwd,
          searchPath: 'absent',
          architecture,
          nodePath: '/opt/node/bin/node',
          runningVersion: '1.2.1',
          commandRunner,
        });
        expect(result.checks[0]).toMatchObject({
          name: 'macOS',
          status,
          required: false,
          version: '15.7.1',
          details: `${details} · /opt/node/bin/node`,
        });
        if (architecture === 'x64') {
          expect(commandRunner).toHaveBeenCalledWith(
            '/usr/bin/arch',
            ['-x86_64', '/usr/sbin/sysctl', '-in', 'sysctl.proc_translated'],
            { timeout: 5000 }
          );
        } else {
          expect(commandRunner).toHaveBeenCalledTimes(1);
        }
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    }
  );

  it.skipIf(process.platform === 'win32')(
    'finds the first executable on PATH and inspects npm links without running them',
    async () => {
      const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-路径-'));
      const commandRunner = diagnostics();
      try {
        const bin = path.join(cwd, 'custom bin');
        const installed = path.join(cwd, 'npm', 'node_modules', '@zaowu-labs', 'cli');
        const entry = path.join(installed, 'dist', 'index.js');
        await mkdir(bin, { recursive: true });
        await mkdir(path.dirname(entry), { recursive: true });
        await writeFile(entry, '#!/usr/bin/env node\nthrow new Error("do not execute");\n', {
          mode: 0o755,
        });
        await writeFile(
          path.join(installed, 'package.json'),
          '{"name":"@zaowu-labs/cli","version":"1.1.0"}'
        );
        await symlink(entry, path.join(bin, 'zw'));
        await writeFile(path.join(bin, 'brew'), '#!/bin/sh\nexit 9\n', { mode: 0o755 });
        await mkdir(path.join(cwd, 'zw'));
        const result = await checkMacEnvironment({
          cwd,
          searchPath: `.${path.delimiter}custom bin`,
          architecture: 'arm64',
          nodePath: '/node',
          runningVersion: '1.2.1',
          commandRunner,
        });
        expect(result.checks).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'Homebrew',
              status: 'ok',
              details: path.join(bin, 'brew'),
            }),
            expect.objectContaining({
              name: 'zw on PATH',
              status: 'warning',
              version: '1.1.0',
              required: false,
              details: `${path.join(bin, 'zw')} · running build 1.2.1`,
              fix: expect.stringContaining('type -a zw'),
            }),
          ])
        );
        expect(commandRunner).toHaveBeenCalledTimes(1);
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    }
  );

  it('only checks the developer tools selection for the Apple Git stub', async () => {
    const run = vi.fn(() => {
      throw new Error('No selected developer directory');
    });
    await expect(checkAppleGit('/opt/homebrew/bin/git', run)).resolves.toBeUndefined();
    expect(run).not.toHaveBeenCalled();
    await expect(checkAppleGit('/usr/bin/git', run)).resolves.toMatchObject({
      name: 'Git',
      status: 'missing',
      fix: expect.stringContaining('xcode-select --install'),
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('/usr/bin/xcode-select', ['-p'], { timeout: 5000 });
  });

  it.skipIf(process.platform === 'win32')(
    'checks that the selected developer directory provides executable Git',
    async () => {
      const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-Apple tools-'));
      try {
        const git = path.join(cwd, 'usr', 'bin', 'git');
        await mkdir(path.dirname(git), { recursive: true });
        await expect(checkAppleGit('/usr/bin/git', () => cwd)).resolves.toMatchObject({
          status: 'missing',
        });
        await writeFile(git, '#!/bin/sh\nexit 9\n', { mode: 0o755 });
        await expect(checkAppleGit('/usr/bin/git', () => cwd)).resolves.toBeUndefined();
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    }
  );

  it.skipIf(process.platform !== 'darwin')(
    'does not launch Apple Git from doctor when the developer tools are missing',
    async () => {
      vi.stubEnv('PATH', '/usr/bin');
      const commandRunner = diagnostics();
      try {
        const result = await executeCli(['doctor', '--json'], { commandRunner });
        const payload = JSON.parse(result.stdout);
        expect(payload.checks).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: 'Git', status: 'missing' }),
            expect.objectContaining({ name: 'macOS', version: '15.7.1' }),
          ])
        );
        expect(payload.operationPlan.executes).toContain('/usr/bin/xcode-select -p');
        expect(payload.operationPlan.executes).not.toContain('git --version');
        expect(commandRunner.mock.calls.flat()).not.toContain('git');
      } finally {
        vi.unstubAllEnvs();
      }
    }
  );
});
