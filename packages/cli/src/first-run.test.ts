import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG_FILE_NAMES, getGlobalConfigPath } from '@zaowu-labs/config';
import { executeCli } from './run';

let scratch: string;
let cwd: string;

beforeEach(async () => {
  scratch = await mkdtemp(path.join(os.tmpdir(), 'zaowu-first-use-'));
  cwd = path.join(scratch, 'project');
  await mkdir(cwd);
  vi.spyOn(os, 'homedir').mockReturnValue(scratch);
  vi.stubEnv('APPDATA', path.join(scratch, 'appdata'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(scratch, { recursive: true, force: true });
});

const writeGlobal = async (content: string): Promise<void> => {
  const filePath = getGlobalConfigPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
};

describe('help discovery', () => {
  it.each([['init'], ['doctor'], ['data'], ['data', 'schema'], ['ai', 'ask']])(
    'resolves a help query for %j without running the command',
    async (...target) => {
      const runner = vi.fn(() => {
        throw new Error('Help must not run diagnostics');
      });
      const queried = await executeCli(['help', ...target, '--json'], {
        cwd,
        commandRunner: runner,
      });
      const direct = await executeCli([...target, '--help', '--json'], {
        cwd,
        commandRunner: runner,
      });
      expect(queried).toEqual(direct);
      expect(runner).not.toHaveBeenCalled();
    }
  );

  it.each([['-h'], ['data', 'schema', '-h']])('supports short help: %j', async (...args) => {
    const result = await executeCli(args, { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
  });

  it('keeps -V equivalent to --version', async () => {
    expect(await executeCli(['-V', '--json'])).toEqual(await executeCli(['--version', '--json']));
  });

  it('preserves short help tokens after the literal separator', async () => {
    const result = await executeCli(['ai', 'ask', '--provider', 'echo', '--json', '--', '-h'], {
      cwd,
    });
    expect(JSON.parse(result.stdout).output).toContain('Prompt received:\n-h');
  });

  it('reports an unknown help target instead of showing unrelated root help', async () => {
    const result = await executeCli(['help', 'data', 'unknown', '--json'], { cwd });
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).error.code).toBe('UNKNOWN_DOMAIN_ACTION');
  });
});

describe('input mistakes never authorize work', () => {
  it.each(['--yes=false', '--yes=0', '--yes=true', '--dry-run=false', '--help=false'])(
    'rejects assigned boolean flag %s without writing',
    async (flag) => {
      const result = await executeCli(['init', '--yes', flag, '--json'], { cwd });
      expect(result.exitCode).toBe(1);
      expect(JSON.parse(result.stderr).error.code).toBe('OPTION_VALUE_INVALID');
      expect(await readdir(cwd)).not.toContain('zw.yml');
    }
  );

  it.each([
    ['init', 'unexpected', '--yes'],
    ['doctor', 'unexpected'],
    ['dev', 'sync', 'unexpected', '--yes'],
    ['data', 'clean', 'input.csv', 'output.csv', '--yes'],
    ['config', 'set', 'project.name', 'demo', 'extra', '--yes'],
    ['ai', 'providers', 'unexpected'],
    ['plugin', 'list', 'unexpected'],
  ])('rejects extra targets before command execution: %j', async (...args) => {
    const runner = vi.fn(() => {
      throw new Error('Invalid input must not execute');
    });
    const result = await executeCli([...args, '--json'], { cwd, commandRunner: runner });
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).error.code).toBe('ARGUMENT_UNEXPECTED');
    expect(runner).not.toHaveBeenCalled();
    expect(await readdir(cwd)).not.toContain('zw.yml');
  });

  it('keeps free-text prompts variadic', async () => {
    const result = await executeCli(['ai', 'ask', 'Explain', 'this', 'project', '--json'], { cwd });
    expect(JSON.parse(result.stdout).output).toContain('Explain this project');
  });

  it('does not silently ignore a root option typo', async () => {
    const result = await executeCli(['--jsoon'], { cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Option is not supported');
  });
});

describe('configuration discovery and recovery', () => {
  it.each(CONFIG_FILE_NAMES)('does not shadow existing %s', async (name) => {
    await writeFile(path.join(cwd, name), 'existing user config');
    const result = await executeCli(['init', '--yes', '--json'], { cwd });
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).error).toMatchObject({
      code: 'CONFIG_ALREADY_EXISTS',
      why: expect.stringContaining(name),
    });
    expect(await readFile(path.join(cwd, name), 'utf8')).toBe('existing user config');
    if (name !== 'zw.yml') expect(await readdir(cwd)).not.toContain('zw.yml');
  });

  it('does not shadow an alternate config name occupied by a directory', async () => {
    await mkdir(path.join(cwd, 'zw.yaml'));
    expect(
      JSON.parse((await executeCli(['init', '--yes', '--json'], { cwd })).stderr).error.code
    ).toBe('CONFIG_ALREADY_EXISTS');
  });

  it.skipIf(process.platform === 'win32')('does not shadow a dangling config symlink', async () => {
    await symlink(path.join(cwd, 'absent'), path.join(cwd, 'zw.yaml'));
    expect(
      JSON.parse((await executeCli(['init', '--yes', '--json'], { cwd })).stderr).error.code
    ).toBe('CONFIG_ALREADY_EXISTS');
  });

  it('allows a child project to initialize its own config', async () => {
    await writeFile(path.join(scratch, 'zw.yml'), 'version: 1');
    const result = await executeCli(['init', '--yes', '--json'], { cwd });
    expect(result.exitCode).toBe(0);
    expect(await readFile(path.join(cwd, 'zw.yml'), 'utf8')).toContain('version: 1');
  });

  it('reports a malformed project config instead of selecting Echo', async () => {
    await writeFile(path.join(cwd, 'zw.yml'), 'version: [');
    const result = await executeCli(['ai', 'ask', 'Explain', '--json'], { cwd });
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).error.code).toBe('CONFIG_PARSE_FAILED');
  });

  it('honors an explicit provider even when the optional config is malformed', async () => {
    await writeFile(path.join(cwd, 'zw.yml'), 'version: [');
    const result = await executeCli(['ai', 'ask', 'Explain', '--provider', 'echo', '--json'], {
      cwd,
    });
    expect(JSON.parse(result.stdout).provider.id).toBe('echo');
  });

  it('uses global-only provider preferences without sending a request', async () => {
    await writeGlobal('version: 1\nai:\n  provider: openai\n');
    const result = await executeCli(['ai', 'ask', 'Explain', '--json'], { cwd });
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: 'preview',
      provider: { id: 'openai' },
      output: null,
    });
  });

  it('reports malformed global config rather than silently ignoring it', async () => {
    await writeGlobal('version: [');
    const result = await executeCli(['ai', 'ask', 'Explain', '--json'], { cwd });
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).error.code).toBe('CONFIG_PARSE_FAILED');
  });

  it('uses the same global provider in doctor and AI previews', async () => {
    await writeGlobal('version: 1\nai:\n  provider: openai\n');
    const result = await executeCli(['doctor', '--json'], {
      cwd,
      commandRunner: (command) => (command === 'git' ? 'git version 2.44.0' : '10.34.1'),
    });
    const provider = JSON.parse(result.stdout).checks.find(
      (check: { name: string }) => check.name === 'AI provider'
    );
    expect(provider.details).toContain('openai');
  });

  it('keeps pnpm optional for users of the published CLI', async () => {
    await executeCli(['init', '--yes'], { cwd });
    const result = await executeCli(['doctor', '--json'], {
      cwd,
      nodeVersion: '20.19.0',
      commandRunner: (command) => {
        if (command === 'git') return 'git version 2.44.0';
        throw new Error('pnpm is not installed');
      },
    });
    const payload = JSON.parse(result.stdout);
    expect(payload.status).toBe('ok');
    expect(payload.checks.find((check: { name: string }) => check.name === 'pnpm')).toMatchObject({
      status: 'missing',
      required: false,
    });
    expect(payload.nextSteps).toEqual([]);
  });

  it('keeps diagnostic subprocesses bounded and Corepack offline', async () => {
    const runner = vi.fn((command: string) => {
      if (command === 'git') return 'git version 2.44.0';
      throw new Error('tool not available');
    });
    await executeCli(['doctor'], { cwd, commandRunner: runner });
    expect(runner).toHaveBeenCalledWith('git', ['--version'], { timeout: 5000 });
    expect(runner).toHaveBeenCalledWith('pnpm', ['--version'], {
      timeout: 5000,
      env: {
        COREPACK_ENABLE_NETWORK: '0',
        COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
        COREPACK_ENABLE_AUTO_PIN: '0',
      },
    });
    expect(runner).toHaveBeenCalledWith('corepack', ['pnpm', '--version'], {
      timeout: 5000,
      env: {
        COREPACK_ENABLE_NETWORK: '0',
        COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
        COREPACK_ENABLE_AUTO_PIN: '0',
      },
    });
  });

  it('keeps dry-run dominant over valid confirmation flags', async () => {
    const result = await executeCli(['init', '--yes', '--dry-run', '--json'], { cwd });
    expect(JSON.parse(result.stdout).dryRun).toBe(true);
    expect(await readdir(cwd)).not.toContain('zw.yml');
  });
});
