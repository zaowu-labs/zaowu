import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AI_DOMAIN, validateAIProviderConfig } from '@zaowu/ai';
import { AUTO_DOMAIN } from '@zaowu/auto';
import {
  CONFIG_DOMAIN,
  findConfigFile,
  getDefaultConfigContent,
  loadResolvedConfig,
  type ResolvedConfig,
} from '@zaowu/config';
import {
  assertOperationPlanFingerprint as assertOperationPlanFingerprintFromCore,
  createOperationPlan,
  findDomainCommand,
  isZaoWuError,
  ZaoWuError,
  type DomainDefinition,
  type OperationPlan,
} from '@zaowu/core';
import { DATA_DOMAIN } from '@zaowu/data';
import { DEV_DOMAIN } from '@zaowu/dev';
import { DOC_DOMAIN } from '@zaowu/doc';
import { PLUGIN_DOMAIN } from '@zaowu/plugin';
import { TEACH_DOMAIN } from '@zaowu/teach';
import { WEB_DOMAIN } from '@zaowu/web';
import { getValue, hasFlag as hasParsedFlag, parseArgs } from './args.js';
import { COMMAND_CONTRACTS } from './command-contracts.js';
import { ACTION_HELP } from './help-text.js';
import { getDomainActionHandler } from './domain-handlers.js';
import { createResult, formatRows } from './output.js';
import type { CliExecutionOptions, CliResult, CommandRunner } from './types.js';
import { getCliVersion } from './version.js';

export const ZAOWU_CLI_VERSION = getCliVersion();
export const DEFAULT_CONFIG_FILE_NAME = 'zw.yml';

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
  schemaVersion: 1;
  status: OverallStatus;
  checks: DoctorCheck[];
  nextSteps: string[];
  operationPlan: OperationPlan;
}

const MINIMUM_NODE_VERSION = '20.19.0';
const MINIMUM_PNPM_VERSION = '10.34.1';
const MAXIMUM_PNPM_MAJOR = 11;
const ADDITIONAL_ROOT_SURFACES_IN_CAPABILITY_MATRIX = 3;
const PNPM_MISSING_FIX = 'Run `corepack enable` or install pnpm.';
const PNPM_VERSION_FIX =
  `Use pnpm ${MINIMUM_PNPM_VERSION} through Corepack: ` +
  `corepack prepare pnpm@${MINIMUM_PNPM_VERSION} --activate.`;

export const DOMAIN_DEFINITIONS: readonly DomainDefinition[] = [
  AI_DOMAIN,
  DEV_DOMAIN,
  DOC_DOMAIN,
  DATA_DOMAIN,
  AUTO_DOMAIN,
  WEB_DOMAIN,
  TEACH_DOMAIN,
  PLUGIN_DOMAIN,
  CONFIG_DOMAIN,
];

const WINDOWS_COMMAND_PART_PATTERN = /^[a-zA-Z0-9._@:/\\=-]+$/;

const toWindowsCommand = (command: string, args: readonly string[]): string => {
  const parts = [command, ...args];

  for (const part of parts) {
    if (!WINDOWS_COMMAND_PART_PATTERN.test(part)) {
      throw new ZaoWuError({
        code: 'WORKFLOW_SHELL_DANGEROUS',
        message: 'Command part contains unsafe characters on Windows.',
        why: `The command part \`${part}\` does not match the allowed safe pattern.`,
        fix: 'Avoid special characters, shell control tokens, or spaces in arguments on Windows.',
      });
    }
  }

  return parts.join(' ');
};

const runSystemCommand: CommandRunner = (command, args, options) => {
  const executable = process.platform === 'win32' ? 'cmd.exe' : command;
  const commandArgs =
    process.platform === 'win32' ? ['/d', '/s', '/c', toWindowsCommand(command, args)] : [...args];

  return execFileSync(executable, commandArgs, {
    cwd: options?.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
};

const hasFlag = (args: readonly string[], flag: string): boolean => args.includes(flag);

const findDomain = (name: string): DomainDefinition | undefined =>
  DOMAIN_DEFINITIONS.find((domain) => domain.name === name);

const toTitleCase = (value: string): string => `${value.charAt(0).toUpperCase()}${value.slice(1)}`;

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

const getMajorVersion = (version: string): number =>
  Number.parseInt(version.replace(/^v/, '').split('.')[0] ?? '', 10) || 0;

const satisfiesPnpmVersion = (version?: string): boolean =>
  Boolean(
    version &&
    satisfiesMinimumVersion(version, MINIMUM_PNPM_VERSION) &&
    getMajorVersion(version) < MAXIMUM_PNPM_MAJOR
  );

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

const checkPnpmCommand = (
  command: string,
  args: readonly string[],
  commandRunner: CommandRunner,
  details?: string
): DoctorCheck => {
  try {
    const output = commandRunner(command, args);
    const version = extractVersion(output);
    const isSupported = satisfiesPnpmVersion(version);

    return {
      name: 'pnpm',
      status: isSupported ? 'ok' : 'warning',
      version,
      details,
      fix: isSupported ? undefined : PNPM_VERSION_FIX,
    };
  } catch {
    return {
      name: 'pnpm',
      status: 'missing',
      fix: PNPM_MISSING_FIX,
    };
  }
};

const checkPnpm = (commandRunner: CommandRunner): DoctorCheck => {
  const pnpmCheck = checkPnpmCommand('pnpm', ['--version'], commandRunner);

  if (pnpmCheck.status === 'ok') {
    return pnpmCheck;
  }

  const corepackPnpmCheck = checkPnpmCommand(
    'corepack',
    ['pnpm', '--version'],
    commandRunner,
    'via corepack'
  );

  if (corepackPnpmCheck.status === 'ok') {
    return corepackPnpmCheck;
  }

  if (pnpmCheck.status !== 'missing') {
    return pnpmCheck;
  }

  return corepackPnpmCheck.status !== 'missing' ? corepackPnpmCheck : pnpmCheck;
};

const getConfigCheck = async (
  cwd: string
): Promise<{
  check: DoctorCheck;
  resolvedConfig?: ResolvedConfig;
  checkedInvalidConfig?: boolean;
}> => {
  const configFile = await findConfigFile({ cwd });

  if (!configFile) {
    return {
      check: {
        name: 'Config',
        status: 'missing',
        fix: 'Run `zw init` to preview config creation, then `zw init --yes` to create it.',
      },
      checkedInvalidConfig: false,
    };
  }

  try {
    const resolvedConfig = await loadResolvedConfig(cwd);

    return {
      check: {
        name: 'Config',
        status: 'ok',
        details: path.relative(cwd, resolvedConfig.filePath) || DEFAULT_CONFIG_FILE_NAME,
      },
      resolvedConfig,
      checkedInvalidConfig: false,
    };
  } catch (error) {
    return {
      check: {
        name: 'Config',
        status: 'warning',
        details: path.relative(cwd, configFile) || DEFAULT_CONFIG_FILE_NAME,
        fix: isZaoWuError(error)
          ? error.fix
          : 'Run `zw config validate` to inspect and repair the config file.',
      },
      checkedInvalidConfig: true,
    };
  }
};

const checkAIProvider = (
  resolvedConfig: ResolvedConfig | undefined,
  checkedInvalidConfig: boolean
): DoctorCheck => {
  if (!resolvedConfig && checkedInvalidConfig) {
    return {
      name: 'AI provider',
      status: 'warning',
      details: 'not checked because config is invalid',
      fix: 'Run `zw config validate` before enabling provider-backed AI commands.',
    };
  }

  try {
    const validation = validateAIProviderConfig(resolvedConfig?.config.ai.provider);
    const provider = validation.provider;
    const location = provider.network ? 'network' : 'local';
    const configStatus = provider.configured ? 'configured' : 'missing config';

    return {
      name: 'AI provider',
      status: validation.status,
      details: `${provider.id} (${location}, ${configStatus})`,
      fix: validation.warnings[0],
    };
  } catch (error) {
    return {
      name: 'AI provider',
      status: 'warning',
      details: String(resolvedConfig?.config.ai.provider ?? 'default'),
      fix: isZaoWuError(error)
        ? error.fix
        : 'Run `zw ai providers --json` to inspect supported AI providers.',
    };
  }
};

const checkCommandMatrix = (): DoctorCheck => ({
  name: 'Command matrix',
  status: 'ok',
  details: `${COMMAND_CONTRACTS.length + ADDITIONAL_ROOT_SURFACES_IN_CAPABILITY_MATRIX} command surface(s) tracked`,
});

const buildDoctorResult = async (options: CliExecutionOptions = {}): Promise<DoctorResult> => {
  const cwd = options.cwd ?? process.cwd();
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const commandRunner = options.commandRunner ?? runSystemCommand;
  const checks: DoctorCheck[] = [];

  checks.push({
    name: 'Node.js',
    status: satisfiesMinimumVersion(nodeVersion, MINIMUM_NODE_VERSION) ? 'ok' : 'warning',
    version: `v${nodeVersion.replace(/^v/, '')}`,
    fix: satisfiesMinimumVersion(nodeVersion, MINIMUM_NODE_VERSION)
      ? undefined
      : `Install Node.js ${MINIMUM_NODE_VERSION} or newer.`,
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

  const config = await getConfigCheck(cwd);
  checks.push(config.check);
  checks.push(checkAIProvider(config.resolvedConfig, config.checkedInvalidConfig ?? false));
  checks.push(checkCommandMatrix());

  const nextSteps = checks
    .filter((check) => check.status !== 'ok' && check.fix)
    .map((check) => check.fix as string);

  return {
    schemaVersion: 1,
    status: checks.some((check) => check.status !== 'ok') ? 'warning' : 'ok',
    checks,
    nextSteps,
    operationPlan: createOperationPlan({
      risk: 'low',
      reads: [
        'nearest ZaoWu config path',
        'resolved ZaoWu config',
        'AI provider environment variable presence',
        'command contract registry',
      ],
      executes: ['git --version', 'pnpm --version', 'corepack pnpm --version'],
      notes: ['Doctor runs fixed local diagnostics and does not write files.'],
    }),
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

const formatHelp = (): string => {
  const commands = formatRows([
    ['zw init', 'Preview or create a ZaoWu config file'],
    ['zw doctor', 'Check local environment health'],
    ['zw help', 'Show this help'],
  ]);
  const domains = formatRows(
    DOMAIN_DEFINITIONS.map((domain) => [`zw ${domain.name}`, domain.summary])
  );

  return `ZaoWu / 造物

Usage:
  zw <command> [options]

Commands:
${commands}

Domains:
${domains}

Global options:
  --help             Show help
  --version          Show version
  --json             Output machine-readable JSON
  --dry-run          Preview without applying changes
  --yes              Apply a safe confirmed action
  --plan-fingerprint <hash>
                     Require confirmed actions to match a previewed plan

Examples:
  zw doctor
  zw doctor --json
  zw init --dry-run
  zw init --yes
  zw dev --help`;
};

const formatDomainHelp = (domain: DomainDefinition): string => {
  const commands = formatRows(
    domain.commands.map((command) => {
      const flags = [command.status, command.sensitive ? 'sensitive' : undefined]
        .filter(Boolean)
        .join(', ');

      return [`zw ${domain.name} ${command.name}`, `${flags} - ${command.summary}`];
    })
  );
  const capabilities = domain.capabilities
    ? Object.entries(domain.capabilities)
        .filter(([, enabled]) => enabled)
        .map(([name]) => `- ${name}`)
        .join('\n') || '- none'
    : '- none';

  return `ZaoWu ${toTitleCase(domain.name)} Domain

Usage:
  zw ${domain.name} <action> [target] [options]

Description:
  ${domain.summary}

Commands:
${commands}

Capabilities:
${capabilities}

Global options:
  --help             Show help
  --json             Output machine-readable JSON
  --dry-run          Preview without applying changes
  --yes              Apply a safe confirmed action`;
};

// ACTION_HELP is imported from './help-text.js' above.

const formatActionHelp = (domain: DomainDefinition, action: string): string =>
  ACTION_HELP[domain.name]?.[action] ??
  `ZaoWu ${toTitleCase(domain.name)} ${toTitleCase(action)}

Usage:
  zw ${domain.name} ${action} [target] [options]

Options:
  --help             Show help
  --json             Output machine-readable JSON`;

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

const formatInlineOperationPlan = (plan: OperationPlan): string =>
  [
    'Operation plan:',
    `Risk: ${plan.risk}`,
    `Confirmation required: ${plan.confirmationRequired ? 'yes' : 'no'}`,
    `Fingerprint: ${plan.fingerprint}`,
    `Subjects: ${plan.subjects.length > 0 ? plan.subjects.join(', ') : 'none'}`,
    `Writes: ${plan.writes.length > 0 ? plan.writes.join(', ') : 'none'}`,
    `Deletes: ${plan.deletes.length > 0 ? plan.deletes.join(', ') : 'none'}`,
  ].join('\n');

const formatInitPreview = (
  configPath: string,
  content: string,
  operationPlan: OperationPlan
): string => `ZaoWu Init

No files were written.

Would create:
  ${path.basename(configPath)}

${formatInlineOperationPlan(operationPlan)}

Preview:
${content
  .trimEnd()
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
  const content = getDefaultConfigContent(configPath);
  const operationPlan = createOperationPlan({
    risk: 'medium',
    confirmationRequired: !yes || dryRun,
    subjects: [`init:${configPath}`],
    writes: [configPath],
    notes: ['Init creates a config file only when --yes is provided and --dry-run is absent.'],
  });

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
      schemaVersion: 1,
      status: 'ok',
      dryRun: true,
      wouldCreate: configPath,
      content,
      operationPlan,
    };

    return createResult(
      0,
      json ? JSON.stringify(payload) : formatInitPreview(configPath, content, operationPlan)
    );
  }

  assertOperationPlanFingerprintFromCore(
    getValue(parseArgs(args), '--plan-fingerprint'),
    operationPlan,
    yes && !dryRun,
    ZaoWuError
  );

  try {
    await writeFile(configPath, content, { encoding: 'utf8', flag: 'wx' });
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
    schemaVersion: 1,
    status: 'ok',
    created: configPath,
    operationPlan: {
      ...operationPlan,
      confirmationRequired: false,
    },
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
        fix: 'Report this issue at https://github.com/zaowu-labs/zaowu/issues with the command you ran.',
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
  const parsed = parseArgs(args);
  const json = hasParsedFlag(parsed, '--json');
  const wantsHelp = hasParsedFlag(parsed, '--help');
  const wantsVersion = hasParsedFlag(parsed, '--version');
  const commandArgs = parsed.positionals;
  const command = commandArgs[0];
  const domain = command ? findDomain(command) : undefined;
  const cwd = options.cwd ?? process.cwd();
  const commandRunner = options.commandRunner ?? runSystemCommand;

  try {
    if (wantsVersion || command === 'version') {
      return createResult(
        0,
        json
          ? JSON.stringify({ schemaVersion: 1, status: 'ok', version: ZAOWU_CLI_VERSION })
          : ZAOWU_CLI_VERSION
      );
    }

    if (!command || command === 'help') {
      return createResult(
        0,
        json ? JSON.stringify({ schemaVersion: 1, status: 'ok', help: formatHelp() }) : formatHelp()
      );
    }

    if (wantsHelp) {
      if (command === 'init') {
        return createResult(
          0,
          json
            ? JSON.stringify({ schemaVersion: 1, status: 'ok', help: formatInitHelp() })
            : formatInitHelp()
        );
      }

      if (command === 'doctor') {
        return createResult(
          0,
          json
            ? JSON.stringify({ schemaVersion: 1, status: 'ok', help: formatDoctorHelp() })
            : formatDoctorHelp()
        );
      }

      if (domain) {
        const action = commandArgs[1];

        if (action) {
          const domainCommand = findDomainCommand(domain, action);

          if (!domainCommand) {
            throw new ZaoWuError({
              code: 'UNKNOWN_DOMAIN_ACTION',
              message: `Unknown command: zw ${domain.name} ${action}.`,
              why: `ZaoWu has the \`${domain.name}\` domain, but it does not have an action named \`${action}\`.`,
              fix: `Run \`zw ${domain.name} --help\` to see commands for this domain.`,
            });
          }

          return createResult(
            0,
            json
              ? JSON.stringify({
                  schemaVersion: 1,
                  status: 'ok',
                  domain: domain.name,
                  action,
                  help: formatActionHelp(domain, action),
                })
              : formatActionHelp(domain, action)
          );
        }

        return createResult(
          0,
          json
            ? JSON.stringify({
                schemaVersion: 1,
                status: 'ok',
                domain,
                help: formatDomainHelp(domain),
              })
            : formatDomainHelp(domain)
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

    if (domain) {
      const action = commandArgs[1];

      if (!action) {
        return createResult(
          0,
          json
            ? JSON.stringify({
                schemaVersion: 1,
                status: 'ok',
                domain,
                help: formatDomainHelp(domain),
              })
            : formatDomainHelp(domain)
        );
      }

      const domainCommand = findDomainCommand(domain, action);

      if (!domainCommand) {
        throw new ZaoWuError({
          code: 'UNKNOWN_DOMAIN_ACTION',
          message: `Unknown command: zw ${domain.name} ${action}.`,
          why: `ZaoWu has the \`${domain.name}\` domain, but it does not have an action named \`${action}\`.`,
          fix: `Run \`zw ${domain.name} --help\` to see commands for this domain.`,
        });
      }

      if (domainCommand.status === 'planned') {
        throw new ZaoWuError({
          code: 'COMMAND_NOT_IMPLEMENTED',
          message: `Command not implemented yet: zw ${domain.name} ${domainCommand.name}.`,
          why:
            `The \`${domain.name}\` domain is scaffolded, but \`${domainCommand.name}\` ` +
            'is still planned and has no implementation yet.',
          fix:
            'Create or update the related experience spec under `docs/experience/`, ' +
            `then implement it inside the \`packages/${domain.name}\` package.`,
        });
      }

      const handler = getDomainActionHandler(domain.name, domainCommand.name);

      if (handler) {
        return await handler(commandArgs.slice(2), {
          commandRunner,
          cwd,
          dryRun: hasParsedFlag(parsed, '--dry-run'),
          expectedPlanFingerprint: getValue(parsed, '--plan-fingerprint'),
          json,
          parsed,
          yes: hasParsedFlag(parsed, '--yes') && !hasParsedFlag(parsed, '--dry-run'),
          onChunk: options.onChunk,
        });
      }

      throw new ZaoWuError({
        code: 'COMMAND_HANDLER_MISSING',
        message: `Command handler missing: zw ${domain.name} ${domainCommand.name}.`,
        why:
          `The \`${domain.name}\` domain marks \`${domainCommand.name}\` as available, ` +
          'but the CLI has no handler wired for it.',
        fix: 'Wire the command handler through `packages/cli` without moving domain logic into CLI.',
      });
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
  const result = await executeCli(args, {
    onChunk: (chunk) => {
      process.stdout.write(chunk);
    },
  });

  if (result.stdout) {
    process.stdout.write(`${result.stdout}\n`);
  }

  if (result.stderr) {
    process.stderr.write(`${result.stderr}\n`);
  }

  return result.exitCode;
};
