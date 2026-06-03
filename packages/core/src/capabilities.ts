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

export interface OperationPlan {
  risk: OperationRisk;
  confirmationRequired: boolean;
  reads: string[];
  writes: string[];
  executes: string[];
  network: string[];
  secrets: string[];
  notes: string[];
}

export const createOperationPlan = (overrides: Partial<OperationPlan> = {}): OperationPlan => ({
  risk: 'low',
  confirmationRequired: false,
  reads: [],
  writes: [],
  executes: [],
  network: [],
  secrets: [],
  notes: [],
  ...overrides,
});
