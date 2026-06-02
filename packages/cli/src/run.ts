import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { findConfigFile } from '@zaowu/config';
import { isZaoWuError, ZaoWuError } from '@zaowu/core';

export const ZAOWU_CLI_VERSION = '0.0.1';
export const DEFAULT_CONFIG_FILE_NAME = 'zw.yml';

const DEFAULT_CONFIG_CONTENT = `project:
  name: zaowu-project

ai:
  provider: null
`;

type CheckStatus = 'ok' | 'warning' | 'missing';
type OverallStatus = 'ok' | 'warning';

interface DoctorCheck {
  name: string;
  status: CheckStatus;
  version?: string;
  details?: string;
  fix?: string;
}

interface DoctorResult {
  status: OverallStatus;
  checks: DoctorCheck[];
  nextSteps: string[];
}

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string, args: readonly string[]) => string;

export interface CliExecutionOptions {
  cwd?: string;
  nodeVersion?: string;
  commandRunner?: CommandRunner;
}

const createResult = (exitCode: number, stdout = '', stderr = ''): CliResult => ({
  exitCode,
  stdout,
  stderr,
});

const WINDOWS_COMMAND_PART_PATTERN = /^[a-zA-Z0-9._@:/\\-]+$/;

const toWindowsCommand = (command: string, args: readonly string[]): string => {
  const parts = [command, ...args];

  for (const part of parts) {
    if (!WINDOWS_COMMAND_PART_PATTERN.test(part)) {
      throw new Error(`Unsafe command part: ${part}`);
    }
  }

  return parts.join(' ');
};

const runSystemCommand: CommandRunner = (command, args) => {
  const executable = process.platform === 'win32' ? 'cmd.exe' : command;
  const commandArgs =
    process.platform === 'win32' ? ['/d', '/s', '/c', toWindowsCommand(command, args)] : [...args];

  return execFileSync(executable, commandArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
};

const hasFlag = (args: readonly string[], flag: string): boolean => args.includes(flag);

const getCommandArgs = (args: readonly string[]): string[] =>
  args.filter((arg) => !['--json', '--dry-run', '--yes', '--help', '--version'].includes(arg));

const satisfiesMinimumVersion = (version: string, minimum: string): boolean => {
  const parse = (value: string): number[] =>
    value
      .replace(/^v/, '')
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0);
  const actual = parse(version);
  const required = parse(minimum);
  const length = Math.max(actual.length, required.length);

  for (let index = 0; index < length; index += 1) {
    const actualPart = actual[index] ?? 0;
    const requiredPart = required[index] ?? 0;

    if (actualPart > requiredPart) {
      return true;
    }

    if (actualPart < requiredPart) {
      return false;
    }
  }

  return true;
};

const extractVersion = (output: string): string | undefined => {
  const match = output.match(/v?\d+(?:\.\d+)+(?:[-.\w]*)?/);
  return match?.[0];
};

const checkCommand = (
  name: string,
  command: string,
  args: readonly string[],
  fix: string,
  commandRunner: CommandRunner,
  details?: string
): DoctorCheck => {
  try {
    const output = commandRunner(command, args);

    return {
      name,
      status: 'ok',
      version: extractVersion(output),
      details,
    };
  } catch {
    return {
      name,
      status: 'missing',
      fix,
    };
  }
};

const checkPnpm = (commandRunner: CommandRunner): DoctorCheck => {
  const pnpmCheck = checkCommand(
    'pnpm',
    'pnpm',
    ['--version'],
    'Run `corepack enable` or install pnpm.',
    commandRunner
  );

  if (pnpmCheck.status === 'ok') {
    return pnpmCheck;
  }

  const corepackPnpmCheck = checkCommand(
    'pnpm',
    'corepack',
    ['pnpm', '--version'],
    'Run `corepack enable` or install pnpm.',
    commandRunner,
    'via corepack'
  );

  return corepackPnpmCheck.status === 'ok' ? corepackPnpmCheck : pnpmCheck;
};

const buildDoctorResult = async (options: CliExecutionOptions = {}): Promise<DoctorResult> => {
  const cwd = options.cwd ?? process.cwd();
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const commandRunner = options.commandRunner ?? runSystemCommand;
  const checks: DoctorCheck[] = [];

  checks.push({
    name: 'Node.js',
    status: satisfiesMinimumVersion(nodeVersion, '20.11.0') ? 'ok' : 'warning',
    version: `v${nodeVersion.replace(/^v/, '')}`,
    fix: satisfiesMinimumVersion(nodeVersion, '20.11.0')
      ? undefined
      : 'Install Node.js 20.11.0 or newer.',
  });

  checks.push(
    checkCommand(
      'Git',
      'git',
      ['--version'],
      'Install Git and make sure it is on PATH.',
      commandRunner
    )
  );
  checks.push(checkPnpm(commandRunner));

  const configFile = await findConfigFile({ cwd });
  checks.push(
    configFile
      ? {
          name: 'Config',
          status: 'ok',
          details: path.relative(cwd, configFile) || DEFAULT_CONFIG_FILE_NAME,
        }
      : {
          name: 'Config',
          status: 'missing',
          fix: 'Run `zw init` to preview config creation, then `zw init --yes` to create it.',
        }
  );

  const nextSteps = checks
    .filter((check) => check.status !== 'ok' && check.fix)
    .map((check) => check.fix as string);

  return {
    status: checks.some((check) => check.status !== 'ok') ? 'warning' : 'ok',
    checks,
    nextSteps,
  };
};

const formatDoctorHuman = (doctor: DoctorResult): string => {
  const lines = [
    'ZaoWu Doctor',
    '',
    `Status: ${doctor.status === 'ok' ? 'OK' : 'Warning'}`,
    '',
    'Checks:',
  ];

  for (const check of doctor.checks) {
    const parts = [check.status, check.version, check.details].filter(Boolean);
    const suffix = parts.join(' ');
    lines.push(`- ${check.name}: ${suffix}`);
  }

  if (doctor.nextSteps.length > 0) {
    lines.push('', 'Next steps:');

    doctor.nextSteps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });
  }

  return lines.join('\n');
};

const formatHelp = (): string => `ZaoWu / 造物

Usage:
  zw <command> [options]

Commands:
  zw init            Preview or create a ZaoWu config file
  zw doctor          Check local environment health
  zw help            Show this help

Global options:
  --help             Show help
  --version          Show version
  --json             Output machine-readable JSON
  --dry-run          Preview without applying changes
  --yes              Apply a safe confirmed action

Examples:
  zw doctor
  zw doctor --json
  zw init --dry-run
  zw init --yes`;

const formatInitHelp = (): string => `ZaoWu Init

Usage:
  zw init [options]

Description:
  Preview or create a starter ZaoWu config file.

Options:
  --dry-run          Preview without writing files
  --yes              Create zw.yml
  --json             Output machine-readable JSON
  --help             Show this help

Examples:
  zw init
  zw init --dry-run
  zw init --yes
  zw init --json`;

const formatDoctorHelp = (): string => `ZaoWu Doctor

Usage:
  zw doctor [options]

Description:
  Check local environment health.

Options:
  --json             Output machine-readable JSON
  --help             Show this help

Examples:
  zw doctor
  zw doctor --json`;

const formatInitPreview = (configPath: string): string => `ZaoWu Init

No files were written.

Would create:
  ${path.basename(configPath)}

Preview:
${DEFAULT_CONFIG_CONTENT.trimEnd()
  .split('\n')
  .map((line) => (line ? `  ${line}` : ''))
  .join('\n')}

To create this file, run:
  zw init --yes`;

const handleInit = async (
  args: readonly string[],
  options: CliExecutionOptions,
  json: boolean
): Promise<CliResult> => {
  const cwd = options.cwd ?? process.cwd();
  const dryRun = hasFlag(args, '--dry-run');
  const yes = hasFlag(args, '--yes');
  const configPath = path.join(cwd, DEFAULT_CONFIG_FILE_NAME);

  if (existsSync(configPath)) {
    throw new ZaoWuError({
      code: 'CONFIG_ALREADY_EXISTS',
      message: 'ZaoWu config already exists.',
      why: `${DEFAULT_CONFIG_FILE_NAME} already exists in the current directory.`,
      fix: 'Open the existing config file or run `zw doctor` to check it.',
    });
  }

  if (dryRun || !yes) {
    const payload = {
      status: 'ok',
      dryRun: true,
      wouldCreate: configPath,
      content: DEFAULT_CONFIG_CONTENT,
    };

    return createResult(0, json ? JSON.stringify(payload) : formatInitPreview(configPath));
  }

  try {
    await writeFile(configPath, DEFAULT_CONFIG_CONTENT, { encoding: 'utf8', flag: 'wx' });
  } catch {
    throw new ZaoWuError({
      code: 'CONFIG_WRITE_FAILED',
      message: 'Could not write ZaoWu config.',
      why:
        `ZaoWu tried to create ${DEFAULT_CONFIG_FILE_NAME} in the current directory, ` +
        'but the file system rejected the write.',
      fix: 'Check directory permissions and make sure the config file does not already exist.',
    });
  }

  const payload = {
    status: 'ok',
    created: configPath,
  };

  return createResult(
    0,
    json
      ? JSON.stringify(payload)
      : `ZaoWu Init\n\nCreated:\n  ${path.basename(configPath)}\n\nNext step:\n  zw doctor`
  );
};

const handleError = (error: unknown, json: boolean): CliResult => {
  const zaowuError = isZaoWuError(error)
    ? error
    : new ZaoWuError({
        code: 'INTERNAL_ERROR',
        message: 'Unexpected internal error.',
        why: 'ZaoWu hit an error that is not yet handled as a user-facing case.',
        fix: 'Re-run with --verbose once debug output is implemented, or report this issue.',
      });

  return createResult(
    zaowuError.exitCode,
    '',
    json ? zaowuError.formatJSON() : zaowuError.formatHuman()
  );
};

export const executeCli = async (
  args: readonly string[],
  options: CliExecutionOptions = {}
): Promise<CliResult> => {
  const json = hasFlag(args, '--json');
  const wantsHelp = hasFlag(args, '--help');
  const wantsVersion = hasFlag(args, '--version');
  const commandArgs = getCommandArgs(args);
  const command = commandArgs[0];

  try {
    if (wantsVersion || command === 'version') {
      return createResult(
        0,
        json ? JSON.stringify({ status: 'ok', version: ZAOWU_CLI_VERSION }) : ZAOWU_CLI_VERSION
      );
    }

    if (!command || command === 'help') {
      return createResult(
        0,
        json ? JSON.stringify({ status: 'ok', help: formatHelp() }) : formatHelp()
      );
    }

    if (wantsHelp) {
      if (command === 'init') {
        return createResult(
          0,
          json ? JSON.stringify({ status: 'ok', help: formatInitHelp() }) : formatInitHelp()
        );
      }

      if (command === 'doctor') {
        return createResult(
          0,
          json ? JSON.stringify({ status: 'ok', help: formatDoctorHelp() }) : formatDoctorHelp()
        );
      }
    }

    if (command === 'doctor') {
      const doctor = await buildDoctorResult(options);
      return createResult(0, json ? JSON.stringify(doctor) : formatDoctorHuman(doctor));
    }

    if (command === 'init') {
      return await handleInit(args, options, json);
    }

    throw new ZaoWuError({
      code: 'UNKNOWN_COMMAND',
      message: `Unknown command: ${command}.`,
      why: `ZaoWu does not have a command named \`zw ${command}\`.`,
      fix: 'Run `zw --help` to see available commands.',
    });
  } catch (error) {
    return handleError(error, json);
  }
};

export const runCli = async (args: readonly string[]): Promise<number> => {
  const result = await executeCli(args);

  if (result.stdout) {
    process.stdout.write(`${result.stdout}\n`);
  }

  if (result.stderr) {
    process.stderr.write(`${result.stderr}\n`);
  }

  return result.exitCode;
};
