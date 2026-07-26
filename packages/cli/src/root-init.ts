import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getDefaultConfigContent } from '@zaowu-labs/config';
import {
  assertOperationPlanFingerprint,
  createContentOperationSubjects,
  createOperationPlan,
  ZaoWuError,
} from '@zaowu-labs/core';
import { getValue, hasFlag, type ParsedArgs } from './args.js';
import { formatOperationPlan } from './handler-utils.js';
import { createResult } from './output.js';
import type { CliExecutionOptions, CliResult } from './types.js';

export const DEFAULT_CONFIG_FILE_NAME = 'zw.yml';

const formatInitPreview = (
  configPath: string,
  content: string,
  operationPlan: ReturnType<typeof createOperationPlan>
): string => `ZaoWu Init

No files were written.

Would create:
  ${path.basename(configPath)}

${formatOperationPlan(operationPlan)}

Preview:
${content
  .trimEnd()
  .split('\n')
  .map((line) => (line ? `  ${line}` : ''))
  .join('\n')}

To create exactly this file, run:
  zw init --yes --plan-fingerprint ${operationPlan.fingerprint}`;

export const handleInit = async (
  parsed: ParsedArgs,
  options: CliExecutionOptions,
  json: boolean
): Promise<CliResult> => {
  const cwd = options.cwd ?? process.cwd();
  const dryRun = hasFlag(parsed, '--dry-run');
  const yes = hasFlag(parsed, '--yes');
  const configPath = path.join(cwd, DEFAULT_CONFIG_FILE_NAME);
  const content = getDefaultConfigContent(configPath);
  const operationPlan = createOperationPlan({
    risk: 'medium',
    confirmationRequired: !yes || dryRun,
    subjects: [`init:${configPath}`, ...createContentOperationSubjects(content)],
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

  assertOperationPlanFingerprint(
    getValue(parsed, '--plan-fingerprint'),
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
