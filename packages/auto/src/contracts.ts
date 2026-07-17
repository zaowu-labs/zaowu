import type { OperationPlan } from '@zaowu-labs/core';

export interface AutomationStep {
  name: string;
  message?: string;
  run?: string;
  writeFile?: { path: string; content: string };
}

export type AutomationPermissionMode = 'blocked' | 'prompt';
export type AutomationPermissionName = 'shell' | 'fileWrites' | 'network';

export interface AutomationWorkflowPermissions {
  shell: AutomationPermissionMode;
  fileWrites: AutomationPermissionMode;
  network: AutomationPermissionMode;
}

export interface AutomationExecutionPolicy extends AutomationWorkflowPermissions {
  schemaVersion: 1;
}

export interface AutomationExecutionSandbox {
  schemaVersion: 1;
  root: 'workflow-directory';
  workflowDirectory: string;
  shellCommands: 'blocked';
  fileWrites: 'blocked' | 'workflow-directory';
  network: 'blocked';
}

export interface AutomationWorkflow {
  version: number;
  name: string;
  variables: Record<string, string>;
  permissions: AutomationWorkflowPermissions;
  steps: AutomationStep[];
}

export interface ParsedAutomationWorkflow extends AutomationWorkflow {
  versionWarning?: string;
  permissionWarnings: string[];
}

export interface AutomationValidationResult {
  schemaVersion: 1;
  status: 'ok';
  filePath: string;
  workflow: AutomationWorkflow;
  policy: AutomationExecutionPolicy;
  sandbox: AutomationExecutionSandbox;
  warnings: string[];
}

export interface AutomationRunResult {
  schemaVersion: 1;
  status: 'ok' | 'preview';
  filePath: string;
  workflow: AutomationWorkflow;
  policy: AutomationExecutionPolicy;
  sandbox: AutomationExecutionSandbox;
  executed: string[];
  skipped: string[];
  receipts: AutomationExecutionReceipt[];
}

export interface AutomationExecutionReceipt {
  index: number;
  name: string;
  action: AutomationPlanStep['action'];
  status: 'executed' | 'skipped' | 'blocked';
  detail: string;
  targetPath?: string;
  contentSha256?: string;
  contentLength?: number;
}

export interface AutomationPlanStep {
  index: number;
  name: string;
  action: 'message' | 'shell' | 'writeFile' | 'unsupported';
  preview: string;
  targetPath?: string;
  contentLength?: number;
  contentSha256?: string;
  blocked: boolean;
  requiredPermission?: AutomationPermissionName;
  policyDecision: 'allowed' | 'blocked';
  reason?: string;
  operationPlan: OperationPlan;
}

export interface AutomationPlanResult {
  schemaVersion: 1;
  status: 'ok';
  filePath: string;
  workflow: AutomationWorkflow;
  policy: AutomationExecutionPolicy;
  sandbox: AutomationExecutionSandbox;
  steps: AutomationPlanStep[];
  warnings: string[];
}
