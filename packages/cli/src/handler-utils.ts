/**
 * Shared utilities used across all domain handler modules.
 *
 * Extracted from the original monolithic domain-handlers.ts to enable
 * per-domain handler files while sharing common helper logic.
 */

import {
  assertOperationPlanFingerprint as assertOperationPlanFingerprintFromCore,
  createContentOperationSubjects,
  createOperationPlan,
  hashOperationContent,
  ZaoWuError,
  type OperationPlan,
} from '@zaowu/core';
import { getValue, hasFlag, type ParsedArgs } from './args.js';
import { createResult, stringifyJSON } from './output.js';
import type { CliResult, CommandRunner } from './types.js';

export {
  createContentOperationSubjects,
  createOperationPlan,
  hashOperationContent,
  ZaoWuError,
  type OperationPlan,
};
export { getValue, hasFlag };

export interface DomainHandlerContext {
  cwd: string;
  json: boolean;
  dryRun: boolean;
  expectedPlanFingerprint?: string;
  yes: boolean;
  parsed: ParsedArgs;
  commandRunner: CommandRunner;
  onChunk?: (chunk: string) => void;
}

export type DomainActionHandler = (
  args: readonly string[],
  context: DomainHandlerContext
) => Promise<CliResult>;

export const requireTarget = (args: readonly string[], command: string): string => {
  const target = args[0];

  if (!target) {
    throw new ZaoWuError({
      code: 'TARGET_REQUIRED',
      message: 'Target is required.',
      why: `\`${command}\` needs a target argument.`,
      fix: `Run \`${command} --help\` to see the expected usage.`,
    });
  }

  return target;
};

export const requireSecondTarget = (
  args: readonly string[],
  command: string,
  name: string
): string => {
  const target = args[1];

  if (!target) {
    throw new ZaoWuError({
      code: 'TARGET_REQUIRED',
      message: `${name} is required.`,
      why: `\`${command}\` needs ${name} as its second argument.`,
      fix: `Run \`${command} --help\` to see the expected usage.`,
    });
  }

  return target;
};

export const result = (context: DomainHandlerContext, payload: unknown, human: string): CliResult =>
  createResult(0, context.json ? stringifyJSON(payload) : human);

export const formatObject = (value: unknown): string => JSON.stringify(value, null, 2);

export const withOperationPlan = <T extends object>(
  payload: T,
  operationPlan: OperationPlan
): T & { operationPlan: OperationPlan } => ({
  ...payload,
  operationPlan,
});

// Thin adapter so handler code can keep using the (context, plan) call
// style while delegating to the shared core implementation.
export const assertOperationPlanFingerprint = (
  context: DomainHandlerContext,
  operationPlan: OperationPlan
): void => {
  assertOperationPlanFingerprintFromCore(
    context.expectedPlanFingerprint,
    operationPlan,
    context.yes,
    ZaoWuError
  );
};

export const formatList = (items: readonly string[]): string =>
  items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- none';

export const formatCounts = (items: Record<string, number>): string => {
  const lines = Object.entries(items)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => `- ${name}: ${count}`);

  return lines.length > 0 ? lines.join('\n') : '- none';
};

export const formatPolicy = (policy: {
  shell: string;
  fileWrites: string;
  network: string;
}): string =>
  [
    `- shell: ${policy.shell}`,
    `- fileWrites: ${policy.fileWrites}`,
    `- network: ${policy.network}`,
  ].join('\n');

export const formatSandbox = (sandbox: {
  root: string;
  workflowDirectory?: string;
  shellCommands: string;
  fileWrites: string;
  network: string;
}): string =>
  [
    `- root: ${sandbox.root}`,
    ...(sandbox.workflowDirectory ? [`- workflowDirectory: ${sandbox.workflowDirectory}`] : []),
    `- shellCommands: ${sandbox.shellCommands}`,
    `- fileWrites: ${sandbox.fileWrites}`,
    `- network: ${sandbox.network}`,
  ].join('\n');

export const formatFinding = (finding: {
  severity: string;
  priority?: string;
  category?: string;
  title: string;
  detail: string;
  filePath?: string;
  hunkHeader?: string;
  line?: number;
}): string => {
  const fileLocation =
    finding.filePath && finding.line !== undefined
      ? `${finding.filePath}:${finding.line}`
      : finding.filePath;
  const location = [fileLocation, finding.hunkHeader].filter(Boolean).join(' ');
  const risk = [finding.severity, finding.priority, finding.category].filter(Boolean).join('/');

  return `- ${risk}: ${finding.title}${location ? ` (${location})` : ''} - ${finding.detail}`;
};

export const formatOperationPlan = (plan: OperationPlan): string =>
  [
    'Operation plan:',
    `Risk: ${plan.risk}`,
    `Confirmation required: ${plan.confirmationRequired ? 'yes' : 'no'}`,
    `Fingerprint: ${plan.fingerprint}`,
    ...(plan.confirmationRequired
      ? [`Base confirmation flags: --yes --plan-fingerprint ${plan.fingerprint}`]
      : []),
    '',
    'Subjects:',
    formatList(plan.subjects),
    '',
    'Read:',
    formatList(plan.reads),
    '',
    'Write:',
    formatList(plan.writes),
    '',
    'Delete:',
    formatList(plan.deletes),
    '',
    'Execute:',
    formatList(plan.executes),
    '',
    'Network:',
    formatList(plan.network),
    '',
    'Secrets:',
    formatList(plan.secrets),
    '',
    'Notes:',
    formatList(plan.notes),
  ].join('\n');

export const parsePositiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
