import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
    expect(result.stdout).toContain('zw dev');
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

  it('shows domain help for a scaffolded domain', async () => {
    const result = await executeCli(['dev', '--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ZaoWu Dev Domain');
    expect(result.stdout).toContain('zw dev commit');
    expect(result.stdout).toContain('available, sensitive');
    expect(result.stdout).toContain('zw dev review');
  });

  it('shows domain help as JSON', async () => {
    const result = await executeCli(['doc', '--help', '--json']);
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(payload.status).toBe('ok');
    expect(payload.domain.name).toBe('doc');
    expect(payload.domain.commands.map((command: { name: string }) => command.name)).toEqual([
      'summary',
      'extract',
      'convert',
    ]);
  });

  it('runs available domain commands through handlers', async () => {
    const result = await executeCli(['dev', 'commit', '--json'], {
      commandRunner: (_command, args) => {
        if (args.join(' ') === 'diff --cached --name-only') {
          return 'packages/dev/src/index.ts';
        }

        if (args.join(' ') === 'diff --cached --numstat') {
          return '3\t1\tpackages/dev/src/index.ts';
        }

        throw new Error('unexpected command');
      },
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: 'ok',
      source: 'staged',
      message: 'feat: update dev',
    });
  });

  it('runs config path after init', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    try {
      await executeCli(['init', '--yes'], { cwd: root });
      const result = await executeCli(['config', 'path', '--json'], { cwd: root });

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        status: 'ok',
        path: path.join(root, DEFAULT_CONFIG_FILE_NAME),
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('runs the local AI ask command', async () => {
    const result = await executeCli(['ai', 'ask', 'Explain', 'ZaoWu', '--json']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: 'ok',
      provider: {
        id: 'echo',
      },
      output: expect.stringContaining('Explain ZaoWu'),
    });
  });

  it('runs document summary from CLI', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));
    const filePath = path.join(root, 'note.md');

    await writeFile(filePath, '# Note\n\nUseful content.\n', 'utf8');

    try {
      const result = await executeCli(['doc', 'summary', filePath, '--json']);

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        status: 'ok',
        title: 'Note',
        summary: 'Useful content.',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('runs data inspect from CLI', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));
    const filePath = path.join(root, 'data.csv');

    await writeFile(filePath, 'name,amount\nA,10\n', 'utf8');

    try {
      const result = await executeCli(['data', 'inspect', filePath, '--json']);

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        status: 'ok',
        rowCount: 1,
        columns: ['name', 'amount'],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('previews sensitive plugin and web commands by default', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    try {
      const plugin = await executeCli(['plugin', 'install', 'readme-gen', '--json'], { cwd: root });
      const web = await executeCli(['web', 'inspect', 'https://example.com', '--json']);

      expect(JSON.parse(plugin.stdout)).toMatchObject({
        status: 'preview',
        wroteFile: false,
      });
      expect(JSON.parse(web.stdout)).toMatchObject({
        status: 'preview',
        url: 'https://example.com/',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns a JSON error for unknown domain actions', async () => {
    const result = await executeCli(['doc', 'unknown', '--json']);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({
      error: {
        code: 'UNKNOWN_DOMAIN_ACTION',
        message: 'Unknown command: zw doc unknown.',
        why: 'ZaoWu has the `doc` domain, but it does not have an action named `unknown`.',
        fix: 'Run `zw doc --help` to see commands for this domain.',
        exitCode: 1,
      },
    });
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
            return '10.34.1';
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
            version: '10.34.1',
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
            return '10.34.1';
          }

          throw new Error('unexpected command');
        },
      });

      const payload = JSON.parse(result.stdout);
      const pnpmCheck = payload.checks.find((check: { name: string }) => check.name === 'pnpm');

      expect(pnpmCheck).toEqual({
        name: 'pnpm',
        status: 'ok',
        version: '10.34.1',
        details: 'via corepack',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('warns when pnpm is outside the supported range', async () => {
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
            return '11.5.1';
          }

          throw new Error('unexpected command');
        },
      });

      const payload = JSON.parse(result.stdout);
      const pnpmCheck = payload.checks.find((check: { name: string }) => check.name === 'pnpm');

      expect(payload.status).toBe('warning');
      expect(pnpmCheck).toEqual({
        name: 'pnpm',
        status: 'warning',
        version: '11.5.1',
        fix: 'Use pnpm 10.34.1 through Corepack: corepack prepare pnpm@10.34.1 --activate.',
      });
      expect(payload.nextSteps).toContain(
        'Use pnpm 10.34.1 through Corepack: corepack prepare pnpm@10.34.1 --activate.'
      );
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
