import path from 'node:path';
import { validateAIProviderConfig } from '@zaowu-labs/ai';
import {
  findConfigFile,
  loadOptionalResolvedConfig,
  loadResolvedConfig,
  type ResolvedConfig,
} from '@zaowu-labs/config';
import { createOperationPlan, isZaoWuError, type OperationPlan } from '@zaowu-labs/core';
import { ADDITIONAL_ROOT_SURFACES, COMMAND_CONTRACTS } from './command-contracts.js';
import { runSystemCommand } from './system-command.js';
import type { CliExecutionOptions, CommandRunner } from './types.js';

type CheckStatus = 'ok' | 'warning' | 'missing';
type OverallStatus = 'ok' | 'warning';

interface DoctorCheck {
  name: string;
  status: CheckStatus;
  version?: string;
  details?: string;
  fix?: string;
  required?: boolean;
}

export interface DoctorResult {
  schemaVersion: 1;
  status: OverallStatus;
  checks: DoctorCheck[];
  nextSteps: string[];
  operationPlan: OperationPlan;
}

const MINIMUM_NODE_VERSION = '20.19.0';
const MINIMUM_PNPM_VERSION = '10.34.1';
const MAXIMUM_PNPM_MAJOR = 11;
const PNPM_MISSING_FIX = 'Run `corepack enable` or install pnpm.';
const PNPM_VERSION_FIX =
  `Use pnpm ${MINIMUM_PNPM_VERSION} through Corepack: ` +
  `corepack prepare pnpm@${MINIMUM_PNPM_VERSION} --activate.`;

const diagnosticOptions = (command: string) => ({
  timeout: 5_000,
  ...(command === 'corepack' || command === 'pnpm'
    ? {
        env: {
          COREPACK_ENABLE_NETWORK: '0',
          COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
          COREPACK_ENABLE_AUTO_PIN: '0',
        },
      }
    : {}),
});

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
    const output = commandRunner(command, args, diagnosticOptions(command));

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
    const output = commandRunner(command, args, diagnosticOptions(command));
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
        details: path.relative(cwd, resolvedConfig.filePath) || 'zw.yml',
      },
      resolvedConfig,
      checkedInvalidConfig: false,
    };
  } catch (error) {
    return {
      check: {
        name: 'Config',
        status: 'warning',
        details: path.relative(cwd, configFile) || 'zw.yml',
        fix: isZaoWuError(error)
          ? error.fix
          : 'Run `zw config validate` to inspect and repair the config file.',
      },
      checkedInvalidConfig: true,
    };
  }
};

const checkAIProvider = async (
  resolvedConfig: ResolvedConfig | undefined,
  checkedInvalidConfig: boolean,
  cwd: string
): Promise<DoctorCheck> => {
  if (!resolvedConfig && checkedInvalidConfig) {
    return {
      name: 'AI provider',
      status: 'warning',
      details: 'not checked because config is invalid',
      fix: 'Run `zw config validate` before enabling provider-backed AI commands.',
    };
  }

  try {
    const effectiveConfig = resolvedConfig ?? (await loadOptionalResolvedConfig(cwd));
    const validation = validateAIProviderConfig(effectiveConfig?.config.ai.provider);
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
  details: `${COMMAND_CONTRACTS.length + ADDITIONAL_ROOT_SURFACES.length} command surface(s) tracked`,
});

export const buildDoctorResult = async (
  options: CliExecutionOptions = {}
): Promise<DoctorResult> => {
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
  const pnpm = checkPnpm(commandRunner);
  checks.push({
    ...pnpm,
    required: false,
    details: [pnpm.details, 'optional for CLI use; required for repository development']
      .filter(Boolean)
      .join('; '),
  });

  const config = await getConfigCheck(cwd);
  checks.push(config.check);
  checks.push(
    await checkAIProvider(config.resolvedConfig, config.checkedInvalidConfig ?? false, cwd)
  );
  checks.push(checkCommandMatrix());

  const nextSteps = checks
    .filter((check) => check.required !== false && check.status !== 'ok' && check.fix)
    .map((check) => check.fix as string);

  return {
    schemaVersion: 1,
    status: checks.some((check) => check.required !== false && check.status !== 'ok')
      ? 'warning'
      : 'ok',
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
      notes: [
        'Doctor runs fixed local diagnostics and does not write files.',
        'Each diagnostic has a five-second timeout; Corepack network access, download prompts, and auto-pinning are disabled.',
      ],
    }),
  };
};

export const formatDoctorHuman = (doctor: DoctorResult): string => {
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
