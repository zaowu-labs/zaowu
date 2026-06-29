import { createHash } from 'node:crypto';

export interface CapabilityLedger {
  readsFiles: boolean;
  writesFiles: boolean;
  modifiesGit: boolean;
  executesShell: boolean;
  usesNetwork: boolean;
  accessesSecrets: boolean;
  installsDependencies: boolean;
  changesSystem: boolean;
}

export const NO_CAPABILITIES: CapabilityLedger = {
  readsFiles: false,
  writesFiles: false,
  modifiesGit: false,
  executesShell: false,
  usesNetwork: false,
  accessesSecrets: false,
  installsDependencies: false,
  changesSystem: false,
};

export const createCapabilityLedger = (
  overrides: Partial<CapabilityLedger> = {}
): CapabilityLedger => ({
  ...NO_CAPABILITIES,
  ...overrides,
});

export type OperationRisk = 'low' | 'medium' | 'high';
export type OperationPlanFingerprintAlgorithm = 'sha256-v1';

export interface OperationPlan {
  schemaVersion: 1;
  risk: OperationRisk;
  confirmationRequired: boolean;
  subjects: string[];
  reads: string[];
  writes: string[];
  deletes: string[];
  executes: string[];
  network: string[];
  secrets: string[];
  notes: string[];
  fingerprintAlgorithm: OperationPlanFingerprintAlgorithm;
  fingerprint: string;
}

export type OperationPlanOverrides = Partial<
  Omit<OperationPlan, 'schemaVersion' | 'fingerprintAlgorithm' | 'fingerprint'>
>;

type OperationPlanFingerprintInput = Omit<
  OperationPlan,
  'confirmationRequired' | 'fingerprintAlgorithm' | 'fingerprint'
>;

const OPERATION_PLAN_FINGERPRINT_ALGORITHM: OperationPlanFingerprintAlgorithm = 'sha256-v1';

const stableOperationPlanInput = (plan: OperationPlanFingerprintInput): string => {
  const sortArray = (arr: readonly string[]): string[] => [...arr].sort();

  return JSON.stringify({
    schemaVersion: plan.schemaVersion,
    risk: plan.risk,
    subjects: sortArray(plan.subjects),
    reads: sortArray(plan.reads),
    writes: sortArray(plan.writes),
    deletes: sortArray(plan.deletes),
    executes: sortArray(plan.executes),
    network: sortArray(plan.network),
    secrets: sortArray(plan.secrets),
    notes: sortArray(plan.notes),
  });
};

export const fingerprintOperationPlan = (plan: OperationPlanFingerprintInput): string =>
  createHash('sha256').update(stableOperationPlanInput(plan), 'utf8').digest('hex');

export const hashOperationContent = (content: string): string =>
  createHash('sha256').update(content, 'utf8').digest('hex');

export const createContentOperationSubjects = (content: string): string[] => [
  `content-sha256:${hashOperationContent(content)}`,
  `content-length:${content.length}`,
];

export const createOperationPlan = (overrides: OperationPlanOverrides = {}): OperationPlan => {
  const plan = {
    schemaVersion: 1 as const,
    risk: 'low' as OperationRisk,
    confirmationRequired: false,
    subjects: [],
    reads: [],
    writes: [],
    deletes: [],
    executes: [],
    network: [],
    secrets: [],
    notes: [],
    ...overrides,
  };

  return {
    ...plan,
    fingerprintAlgorithm: OPERATION_PLAN_FINGERPRINT_ALGORITHM,
    fingerprint: fingerprintOperationPlan(plan),
  };
};

/**
 * Shared assertion used by the CLI for sensitive commands that accept
 * --plan-fingerprint + --yes.
 *
 * Centralizing it here (in core, next to OperationPlan) removes the previous
 * near-duplicate implementations that lived in packages/cli.
 */
export const assertOperationPlanFingerprint = (
  expectedFingerprint: string | undefined,
  operationPlan: OperationPlan,
  shouldCheck: boolean,
  ZaoWuErrorCtor: typeof import('./errors.js').ZaoWuError
): void => {
  if (!shouldCheck || !expectedFingerprint) {
    return;
  }

  const expected = expectedFingerprint.trim().toLowerCase();

  if (expected === operationPlan.fingerprint) {
    return;
  }

  throw new ZaoWuErrorCtor({
    code: 'OPERATION_PLAN_MISMATCH',
    message: 'Operation plan fingerprint does not match.',
    why:
      `The confirmed operation expected plan fingerprint \`${expected}\`, ` +
      `but the current operation plan is \`${operationPlan.fingerprint}\`.`,
    fix:
      'Re-run the command without `--yes` to preview the current operation plan, ' +
      'then confirm with the new `operationPlan.fingerprint`.',
  });
};
