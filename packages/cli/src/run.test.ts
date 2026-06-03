import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG_FILE_NAME, executeCli } from './run';

describe('executeCli', () => {
  it('shows help when no command is provided', async () => {
    const result = await executeCli([]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('zw doctor');
  });

  it('shows version output', async () => {
    const result = await executeCli(['--version']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('0.0.1');
  });

  it('shows version output as JSON', async () => {
    const result = await executeCli(['--version', '--json']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      status: 'ok',
      version: '0.0.1',
    });
  });

  it('shows command-specific init help', async () => {
    const result = await executeCli(['init', '--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('zw init [options]');
    expect(result.stdout).toContain('zw init --yes');
  });

  it('shows command-specific doctor help', async () => {
    const result = await executeCli(['doctor', '--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('zw doctor [options]');
    expect(result.stdout).toContain('zw doctor --json');
  });

  it('returns a formatted error for unknown commands', async () => {
    const result = await executeCli(['unknown']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Error: Unknown command: unknown.');
    expect(result.stderr).toContain('How to fix:');
  });

  it('returns a JSON error for unknown commands', async () => {
    const result = await executeCli(['unknown', '--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({
      error: {
        code: 'UNKNOWN_COMMAND',
        message: 'Unknown command: unknown.',
        why: 'ZaoWu does not have a command named `zw unknown`.',
        fix: 'Run `zw --help` to see available commands.',
        exitCode: 1,
      },
    });
  });

  it('checks local environment health as JSON', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    try {
      await executeCli(['init', '--yes'], { cwd: root });

      const result = await executeCli(['doctor', '--json'], {
        cwd: root,
        nodeVersion: '20.19.0',
        commandRunner: (command) => {
          if (command === 'git') {
            return 'git version 2.44.0';
          }

          if (command === 'pnpm') {
            return '9.15.0';
          }

          throw new Error('unexpected command');
        },
      });

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        status: 'ok',
        checks: [
          {
            name: 'Node.js',
            status: 'ok',
            version: 'v20.19.0',
          },
          {
            name: 'Git',
            status: 'ok',
            version: '2.44.0',
          },
          {
            name: 'pnpm',
            status: 'ok',
            version: '9.15.0',
          },
          {
            name: 'Config',
            status: 'ok',
            details: DEFAULT_CONFIG_FILE_NAME,
          },
        ],
        nextSteps: [],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('shows missing doctor checks as actionable next steps', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    try {
      const result = await executeCli(['doctor'], {
        cwd: root,
        nodeVersion: '18.0.0',
        commandRunner: () => {
          throw new Error('missing');
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Status: Warning');
      expect(result.stdout).toContain('- Git: missing');
      expect(result.stdout).toContain('- pnpm: missing');
      expect(result.stdout).toContain('- Config: missing');
      expect(result.stdout).toContain('Install Node.js 20.19.0 or newer.');
      expect(result.stdout).toContain('Run `corepack enable` or install pnpm.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('accepts pnpm provided through corepack', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    try {
      const result = await executeCli(['doctor', '--json'], {
        cwd: root,
        nodeVersion: '20.19.0',
        commandRunner: (command, args) => {
          if (command === 'git') {
            return 'git version 2.44.0';
          }

          if (command === 'pnpm') {
            throw new Error('pnpm shim missing');
          }

          if (command === 'corepack' && args.join(' ') === 'pnpm --version') {
            return '11.5.1';
          }

          throw new Error('unexpected command');
        },
      });

      const payload = JSON.parse(result.stdout);
      const pnpmCheck = payload.checks.find((check: { name: string }) => check.name === 'pnpm');

      expect(pnpmCheck).toEqual({
        name: 'pnpm',
        status: 'ok',
        version: '11.5.1',
        details: 'via corepack',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('previews init by default without writing files', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    try {
      const result = await executeCli(['init'], { cwd: root });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No files were written.');
      await expect(readFile(path.join(root, DEFAULT_CONFIG_FILE_NAME), 'utf8')).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('previews init as JSON without writing files', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    try {
      const result = await executeCli(['init', '--json'], { cwd: root });
      const payload = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(payload.status).toBe('ok');
      expect(payload.dryRun).toBe(true);
      expect(payload.wouldCreate).toBe(path.join(root, DEFAULT_CONFIG_FILE_NAME));
      await expect(readFile(path.join(root, DEFAULT_CONFIG_FILE_NAME), 'utf8')).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('creates config when init is confirmed', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));
    const nested = path.join(root, 'nested');

    try {
      await mkdir(nested);
      const result = await executeCli(['init', '--yes'], { cwd: root });

      expect(result.exitCode).toBe(0);
      await expect(readFile(path.join(root, DEFAULT_CONFIG_FILE_NAME), 'utf8')).resolves.toContain(
        'project:'
      );

      const doctor = await executeCli(['doctor'], {
        cwd: nested,
        nodeVersion: '20.19.0',
        commandRunner: () => '1.0.0',
      });

      expect(doctor.stdout).toContain('Config: ok');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not overwrite an existing config', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    try {
      await executeCli(['init', '--yes'], { cwd: root });
      const result = await executeCli(['init', '--yes'], { cwd: root });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Error: ZaoWu config already exists.');
      expect(result.stderr).toContain('How to fix:');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
