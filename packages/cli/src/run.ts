import { findDomainCommand, isZaoWuError, ZaoWuError } from '@zaowu-labs/core';
import { getValue, hasFlag, parseArgs } from './args.js';
import { getDomainActionHandler } from './domain-handlers.js';
import { DOMAIN_DEFINITIONS, findDomain } from './domains.js';
import {
  assertNoMissingOptionValues,
  assertSupportedOptions,
  assertValidOptionValues,
} from './option-validation.js';
import { createResult } from './output.js';
import { buildDoctorResult, formatDoctorHuman } from './root-doctor.js';
import {
  formatActionHelp,
  formatDoctorHelp,
  formatDomainHelp,
  formatHelp,
  formatInitHelp,
} from './root-help.js';
import { DEFAULT_CONFIG_FILE_NAME, handleInit } from './root-init.js';
import { runSystemCommand } from './system-command.js';
import type { CliExecutionOptions, CliResult } from './types.js';
import { getCliVersion } from './version.js';

export const ZAOWU_CLI_VERSION = getCliVersion();
export { DEFAULT_CONFIG_FILE_NAME, DOMAIN_DEFINITIONS };

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

const createHelpResult = (help: string, json: boolean, details = {}): CliResult =>
  createResult(
    0,
    json ? JSON.stringify({ schemaVersion: 1, status: 'ok', ...details, help }) : help
  );

export const executeCli = async (
  args: readonly string[],
  options: CliExecutionOptions = {}
): Promise<CliResult> => {
  const parsed = parseArgs(args);
  const json = hasFlag(parsed, '--json');
  const wantsHelp = hasFlag(parsed, '--help');
  const wantsVersion = hasFlag(parsed, '--version');
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
      return createHelpResult(formatHelp(), json);
    }

    if (wantsHelp) {
      if (command === 'init') {
        return createHelpResult(formatInitHelp(), json);
      }

      if (command === 'doctor') {
        return createHelpResult(formatDoctorHelp(), json);
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

          return createHelpResult(formatActionHelp(domain, action), json, {
            domain: domain.name,
            action,
          });
        }

        return createHelpResult(formatDomainHelp(domain), json, {
          domain: domain.name,
          commands: domain.commands,
        });
      }
    }

    // Resolve the command surface before validating options, so an unknown
    // command or action reports UNKNOWN_COMMAND / UNKNOWN_DOMAIN_ACTION instead
    // of a misleading OPTION_UNSUPPORTED for whatever options were passed.
    if (!domain && command !== 'doctor' && command !== 'init') {
      throw new ZaoWuError({
        code: 'UNKNOWN_COMMAND',
        message: `Unknown command: ${command}.`,
        why: `ZaoWu does not have a command named \`zw ${command}\`.`,
        fix: 'Run `zw --help` to see available commands.',
      });
    }

    if (domain && commandArgs[1] && !findDomainCommand(domain, commandArgs[1])) {
      throw new ZaoWuError({
        code: 'UNKNOWN_DOMAIN_ACTION',
        message: `Unknown command: zw ${domain.name} ${commandArgs[1]}.`,
        why: `ZaoWu has the \`${domain.name}\` domain, but it does not have an action named \`${commandArgs[1]}\`.`,
        fix: `Run \`zw ${domain.name} --help\` to see commands for this domain.`,
      });
    }

    assertNoMissingOptionValues(parsed.missingValues);
    assertSupportedOptions(parsed, commandArgs);
    assertValidOptionValues(parsed, commandArgs);

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
        return createHelpResult(formatDomainHelp(domain), json, {
          domain: domain.name,
          commands: domain.commands,
        });
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
          dryRun: hasFlag(parsed, '--dry-run'),
          expectedPlanFingerprint: getValue(parsed, '--plan-fingerprint'),
          json,
          parsed,
          yes: hasFlag(parsed, '--yes') && !hasFlag(parsed, '--dry-run'),
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
