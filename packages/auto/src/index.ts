import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createCapabilityLedger,
  createOperationPlan,
  stripUtf8Bom,
  ZaoWuError,
  type DomainDefinition,
  type OperationPlan,
} from '@zaowu/core';

export interface AutomationStep {
  name: string;
  message?: string;
  run?: string;
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
  fileWrites: 'blocked';
  network: 'blocked';
}

export interface AutomationWorkflow {
  version: number;
  name: string;
  variables: Record<string, string>;
  permissions: AutomationWorkflowPermissions;
  steps: AutomationStep[];
}

interface ParsedAutomationWorkflow extends AutomationWorkflow {
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
}

export interface AutomationPlanStep {
  index: number;
  name: string;
  action: 'message' | 'shell' | 'unsupported';
  preview: string;
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

export const AUTO_DOMAIN: DomainDefinition = {
  name: 'auto',
  summary: 'Automation workflows with validation, dry-run, and confirmation',
  capabilities: createCapabilityLedger({
    readsFiles: true,
    executesShell: true,
  }),
  commands: [
    {
      name: 'validate',
      summary: 'Validate an automation workflow file',
      status: 'available',
    },
    {
      name: 'plan',
      summary: 'Preview the execution plan for an automation workflow',
      status: 'available',
    },
    {
      name: 'run',
      summary: 'Run an automation workflow with dry-run and confirmation',
      status: 'available',
      sensitive: true,
    },
  ],
};

const SUPPORTED_WORKFLOW_VERSION = 1;
const AUTO_RESULT_SCHEMA_VERSION = 1;
const AUTO_POLICY_SCHEMA_VERSION = 1;
const DEFAULT_WORKFLOW_PERMISSIONS: AutomationWorkflowPermissions = {
  shell: 'blocked',
  fileWrites: 'blocked',
  network: 'blocked',
};
const DEFAULT_EXECUTION_SANDBOX: Omit<AutomationExecutionSandbox, 'workflowDirectory'> = {
  schemaVersion: 1,
  root: 'workflow-directory',
  shellCommands: 'blocked',
  fileWrites: 'blocked',
  network: 'blocked',
};
const KNOWN_PERMISSIONS: readonly AutomationPermissionName[] = ['shell', 'fileWrites', 'network'];

const createExecutionPolicy = (
  permissions: AutomationWorkflowPermissions
): AutomationExecutionPolicy => ({
  schemaVersion: AUTO_POLICY_SCHEMA_VERSION,
  ...permissions,
});

const resolveWorkflowDirectory = (filePath: string): string => path.resolve(path.dirname(filePath));

const createExecutionSandbox = (filePath: string): AutomationExecutionSandbox => ({
  ...DEFAULT_EXECUTION_SANDBOX,
  workflowDirectory: resolveWorkflowDirectory(filePath),
});

const getWorkflowFormat = (filePath: string): 'json' | 'yaml' => {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.json') {
    return 'json';
  }

  if (extension === '.yml' || extension === '.yaml') {
    return 'yaml';
  }

  throw new ZaoWuError({
    code: 'WORKFLOW_FORMAT_UNSUPPORTED',
    message: 'Workflow format is not supported yet.',
    why: `ZaoWu can read JSON and YAML workflow files. It cannot parse \`${extension || 'unknown'}\` files as workflows.`,
    fix: 'Use a workflow file ending in `.json`, `.yml`, or `.yaml`.',
  });
};

const parseWorkflowVersion = (value: unknown): { version: number; versionWarning?: string } => {
  if (value === undefined || value === null || value === '') {
    return {
      version: SUPPORTED_WORKFLOW_VERSION,
    };
  }

  const normalizedValue = typeof value === 'string' ? value.trim() : value;
  const version =
    typeof normalizedValue === 'number'
      ? normalizedValue
      : typeof normalizedValue === 'string' && /^\d+$/.test(normalizedValue)
        ? Number.parseInt(normalizedValue, 10)
        : Number.NaN;

  if (Number.isInteger(version) && version > 0) {
    return {
      version,
    };
  }

  return {
    version: SUPPORTED_WORKFLOW_VERSION,
    versionWarning: `Workflow version \`${String(value)}\` is invalid; defaulting to ${SUPPORTED_WORKFLOW_VERSION}.`,
  };
};

const parsePermissionMode = (
  value: unknown,
  permission: AutomationPermissionName
): { mode: AutomationPermissionMode; warning?: string } => {
  if (value === undefined || value === null || value === '') {
    return {
      mode: DEFAULT_WORKFLOW_PERMISSIONS[permission],
    };
  }

  if (value === 'blocked' || value === 'prompt') {
    return {
      mode: value,
    };
  }

  return {
    mode: DEFAULT_WORKFLOW_PERMISSIONS[permission],
    warning: `Permission \`${permission}\` value \`${String(value)}\` is invalid; defaulting to blocked.`,
  };
};

const parseExecutionPolicy = (
  value: unknown
): { policy: AutomationWorkflowPermissions; permissionWarnings: string[] } => {
  const permissionWarnings: string[] = [];

  if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) {
    permissionWarnings.push('Permissions must be an object; defaulting to blocked.');
  }

  const input =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  for (const key of Object.keys(input)) {
    if (!KNOWN_PERMISSIONS.includes(key as AutomationPermissionName)) {
      permissionWarnings.push(`Permission \`${key}\` is not supported; ignoring it.`);
    }
  }

  const shell = parsePermissionMode(input.shell, 'shell');
  const fileWrites = parsePermissionMode(input.fileWrites, 'fileWrites');
  const network = parsePermissionMode(input.network, 'network');

  return {
    policy: {
      shell: shell.mode,
      fileWrites: fileWrites.mode,
      network: network.mode,
    },
    permissionWarnings: [
      ...permissionWarnings,
      shell.warning,
      fileWrites.warning,
      network.warning,
    ].filter((warning): warning is string => Boolean(warning)),
  };
};

const parseWorkflowJson = (content: string): ParsedAutomationWorkflow => {
  const parsed = JSON.parse(content) as Partial<AutomationWorkflow>;
  const version = parseWorkflowVersion(parsed.version);
  const { policy, permissionWarnings } = parseExecutionPolicy(parsed.permissions);
  const variables =
    parsed.variables && typeof parsed.variables === 'object' && !Array.isArray(parsed.variables)
      ? Object.fromEntries(
          Object.entries(parsed.variables).map(([key, value]) => [key, String(value)])
        )
      : {};

  return {
    ...version,
    name: typeof parsed.name === 'string' && parsed.name ? parsed.name : 'workflow',
    variables,
    permissions: policy,
    permissionWarnings,
    steps: Array.isArray(parsed.steps) ? parsed.steps : [],
  };
};

/**
 * Manual line-based parser for the simple workflow YAML format used in
 * the foundation phase.
 *
 * This is intentionally limited (same philosophy as config's parseSimpleYaml).
 * We support exactly the structure shown in the examples and the
 * zaowu.workflow.schema.json:
 *   - version, name at top level (no indent)
 *   - vars: and permissions: sections (2-space)
 *   - steps: as a list of "- name: ..." items
 *   - message: and run: under a step (more indent)
 *
 * Comments (#), BOM, and basic scalars are handled.
 *
 * Anything outside this supported subset produces a clear
 * WORKFLOW_PARSE_FAILED.
 *
 * Long-term: when we are ready to expand workflow expressiveness, the
 * recommended path is a small real YAML parser + schema-driven validation.
 */
const parseWorkflowYaml = (content: string): ParsedAutomationWorkflow => {
  const lines = content.split(/\r?\n/);
  let parsedVersion = parseWorkflowVersion(undefined);
  let name = 'workflow';
  let section: 'permissions' | 'vars' | 'steps' | null = null;
  const permissions: Partial<Record<AutomationPermissionName, string>> = {};
  const variables: Record<string, string> = {};
  const steps: AutomationStep[] = [];
  let currentStep: AutomationStep | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim() || line.trim().startsWith('#')) {
      continue;
    }

    const versionMatch = /^version:\s*(.+)$/.exec(line);

    if (versionMatch && !rawLine.startsWith(' ')) {
      parsedVersion = parseWorkflowVersion(versionMatch[1]);
      section = null;
      continue;
    }

    const nameMatch = /^name:\s*(.+)$/.exec(line);

    if (nameMatch && !rawLine.startsWith(' ')) {
      name = nameMatch[1].trim();
      section = null;
      continue;
    }

    if (/^vars:\s*$/.test(line) && !rawLine.startsWith(' ')) {
      section = 'vars';
      currentStep = null;
      continue;
    }

    if (/^permissions:\s*$/.test(line) && !rawLine.startsWith(' ')) {
      section = 'permissions';
      currentStep = null;
      continue;
    }

    if (/^steps:\s*$/.test(line) && !rawLine.startsWith(' ')) {
      section = 'steps';
      currentStep = null;
      continue;
    }

    const variableMatch = /^\s{2}([A-Za-z0-9_-]+):\s*(.+)$/.exec(line);

    if (section === 'vars' && variableMatch) {
      variables[variableMatch[1]] = variableMatch[2].trim();
      continue;
    }

    if (section === 'permissions' && variableMatch) {
      permissions[variableMatch[1] as AutomationPermissionName] = variableMatch[2].trim();
      continue;
    }

    const stepMatch = /^\s*-\s+name:\s*(.+)$/.exec(line);

    if (stepMatch) {
      currentStep = {
        name: stepMatch[1].trim(),
      };
      steps.push(currentStep);
      continue;
    }

    const messageMatch = /^\s+message:\s*(.+)$/.exec(line);

    if (messageMatch && currentStep) {
      currentStep.message = messageMatch[1].trim();
      continue;
    }

    const runMatch = /^\s+run:\s*(.+)$/.exec(line);

    if (runMatch && currentStep) {
      currentStep.run = runMatch[1].trim();
    }
  }

  const { policy, permissionWarnings } = parseExecutionPolicy(permissions);

  return {
    ...parsedVersion,
    name,
    variables,
    permissions: policy,
    permissionWarnings,
    steps,
  };
};

const parseWorkflow = (content: string, filePath: string): ParsedAutomationWorkflow => {
  const normalizedContent = stripUtf8Bom(content);
  const format = getWorkflowFormat(filePath);

  try {
    return format === 'json'
      ? parseWorkflowJson(normalizedContent)
      : parseWorkflowYaml(normalizedContent);
  } catch {
    throw new ZaoWuError({
      code: 'WORKFLOW_PARSE_FAILED',
      message: 'Could not parse workflow.',
      why: 'ZaoWu supports simple JSON and YAML workflow files in this first version.',
      fix: 'Use `name` and `steps` with `message` steps, then run `zw auto validate` again.',
    });
  }
};

const stripWorkflowMetadata = (workflow: ParsedAutomationWorkflow): AutomationWorkflow => ({
  version: workflow.version,
  name: workflow.name,
  variables: workflow.variables,
  permissions: workflow.permissions,
  steps: workflow.steps,
});

const VARIABLE_PATTERN = /\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g;

const getReferencedVariables = (value: string | undefined): string[] =>
  value ? [...value.matchAll(VARIABLE_PATTERN)].map((match) => match[1]) : [];

const getMissingVariables = (step: AutomationStep, variables: Record<string, string>): string[] =>
  [
    ...new Set([...getReferencedVariables(step.message), ...getReferencedVariables(step.run)]),
  ].filter((name) => !(name in variables));

const substituteVariables = (value: string, variables: Record<string, string>): string =>
  value.replace(VARIABLE_PATTERN, (_match, name: string) => variables[name] ?? `{{${name}}}`);

const createStepOperationPlan = (step: {
  action: AutomationPlanStep['action'];
  preview: string;
  blocked: boolean;
  reason?: string;
}): OperationPlan => {
  const blockedNote = step.blocked ? [`Step is blocked: ${step.reason ?? 'blocked'}.`] : [];

  if (step.action === 'shell') {
    return createOperationPlan({
      risk: 'high',
      confirmationRequired: true,
      executes: step.preview ? [step.preview] : [],
      notes: blockedNote,
    });
  }

  if (step.action === 'message') {
    return createOperationPlan({
      risk: 'low',
      confirmationRequired: false,
      notes: [
        ...blockedNote,
        'Message steps do not read files, write files, run shell commands, or use network.',
      ],
    });
  }

  return createOperationPlan({
    risk: 'low',
    confirmationRequired: false,
    notes: [...blockedNote, 'Unsupported steps have no executable action.'],
  });
};

/**
 * Scans a shell command for dangerous patterns like rm -rf, sudo, chmod, chown, or piped shell executions.
 * Returns a reason string if a dangerous pattern is found, or undefined if it is clean.
 */
export function checkShellSafety(command: string): string | undefined {
  const normalized = command.toLowerCase().trim();

  // 1. rm -rf, rm -r, rm -f, rm --recursive
  if (/\brm\s+-[a-z]*[rf]/i.test(normalized) || /\brm\s+--recursive/i.test(normalized)) {
    return 'Dangerous command pattern found: `rm` with recursive/force flags.';
  }

  // 2. sudo
  if (/\bsudo\b/i.test(normalized)) {
    return 'Dangerous command pattern found: execution with administrative privileges (`sudo`).';
  }

  // 3. chmod or chown
  if (/\bchmod\b/i.test(normalized)) {
    return 'Dangerous command pattern found: modifying file permissions (`chmod`).';
  }
  if (/\bchown\b/i.test(normalized)) {
    return 'Dangerous command pattern found: changing file ownership (`chown`).';
  }

  // 4. piped shell execution like curl | sh, wget | bash, or iex/invoke-expression
  if (
    /\|\s*(sh|bash|zsh|fish|cmd|powershell|pwsh|iex)\b/i.test(normalized) ||
    /\biex\b/i.test(normalized) ||
    /\binvoke-expression\b/i.test(normalized)
  ) {
    return 'Dangerous command pattern found: piped shell execution or dynamic command evaluation.';
  }

  return undefined;
}

export const validateWorkflowContent = (
  content: string,
  filePath = 'workflow.yml'
): AutomationValidationResult => {
  const parsedWorkflow = parseWorkflow(content, filePath);
  const workflow = stripWorkflowMetadata(parsedWorkflow);
  const warnings: string[] = [];

  if (parsedWorkflow.versionWarning) {
    warnings.push(parsedWorkflow.versionWarning);
  }

  warnings.push(...parsedWorkflow.permissionWarnings);

  if (workflow.version !== SUPPORTED_WORKFLOW_VERSION) {
    warnings.push(
      `Workflow version ${workflow.version} is not supported; this foundation version expects ${SUPPORTED_WORKFLOW_VERSION}.`
    );
  }

  if (workflow.steps.length === 0) {
    warnings.push('Workflow has no steps.');
  }

  for (const step of workflow.steps) {
    if (!step.name.trim()) {
      warnings.push('A workflow step has an empty name.');
    }

    if (!step.message && !step.run) {
      warnings.push(`Step \`${step.name}\` has no supported action.`);
    }

    if (step.run) {
      const safetyError = checkShellSafety(step.run);
      if (safetyError) {
        warnings.push(`Step \`${step.name}\` safety violation: ${safetyError}`);
      }
      if (workflow.permissions.shell === 'blocked') {
        warnings.push(
          `Step \`${step.name}\` uses shell execution, which this first version will not run.`
        );
      }
    }

    for (const missingVariable of getMissingVariables(step, workflow.variables)) {
      warnings.push(`Step \`${step.name}\` references undefined variable \`${missingVariable}\`.`);
    }
  }

  return {
    schemaVersion: AUTO_RESULT_SCHEMA_VERSION,
    status: 'ok',
    filePath,
    workflow,
    policy: createExecutionPolicy(workflow.permissions),
    sandbox: createExecutionSandbox(filePath),
    warnings,
  };
};

export const validateWorkflowFile = async (
  filePath: string
): Promise<AutomationValidationResult> => {
  let content: string;

  try {
    content = await readFile(filePath, 'utf8');
  } catch {
    throw new ZaoWuError({
      code: 'WORKFLOW_READ_FAILED',
      message: 'Could not read workflow file.',
      why: `ZaoWu tried to read \`${filePath}\`, but the file was not readable.`,
      fix: 'Check the path and file permissions, then run the command again.',
    });
  }

  return validateWorkflowContent(content, filePath);
};

export const planWorkflowContent = (
  content: string,
  filePath = 'workflow.yml'
): AutomationPlanResult => {
  const validation = validateWorkflowContent(content, filePath);
  const steps = validation.workflow.steps.map((step, index): AutomationPlanStep => {
    const missingVariables = getMissingVariables(step, validation.workflow.variables);

    if (missingVariables.length > 0) {
      const action = step.run ? 'shell' : step.message ? 'message' : 'unsupported';
      const preview = step.message ?? step.run ?? '';
      const reason = `Missing variable(s): ${missingVariables.join(', ')}`;

      return {
        index: index + 1,
        name: step.name,
        action,
        preview,
        blocked: true,
        requiredPermission: step.run ? 'shell' : undefined,
        policyDecision: 'blocked',
        reason,
        operationPlan: createStepOperationPlan({
          action,
          preview,
          blocked: true,
          reason,
        }),
      };
    }

    if (step.run) {
      const shellPolicy = validation.workflow.permissions.shell;
      const preview = substituteVariables(step.run, validation.workflow.variables);
      const safetyError = checkShellSafety(preview);
      const isBlocked = shellPolicy !== 'prompt' || !!safetyError;
      const reason = safetyError
        ? safetyError
        : isBlocked
          ? 'Shell permission is blocked by workflow policy.'
          : undefined;

      return {
        index: index + 1,
        name: step.name,
        action: 'shell',
        preview,
        blocked: isBlocked,
        requiredPermission: 'shell',
        policyDecision: isBlocked ? 'blocked' : 'allowed',
        reason,
        operationPlan: createStepOperationPlan({
          action: 'shell',
          preview,
          blocked: isBlocked,
          reason,
        }),
      };
    }

    if (step.message) {
      const preview = substituteVariables(step.message, validation.workflow.variables);

      return {
        index: index + 1,
        name: step.name,
        action: 'message',
        preview,
        blocked: false,
        policyDecision: 'allowed',
        operationPlan: createStepOperationPlan({
          action: 'message',
          preview,
          blocked: false,
        }),
      };
    }

    const reason = 'Step has no supported action.';

    return {
      index: index + 1,
      name: step.name,
      action: 'unsupported',
      preview: '',
      blocked: true,
      policyDecision: 'blocked',
      reason,
      operationPlan: createStepOperationPlan({
        action: 'unsupported',
        preview: '',
        blocked: true,
        reason,
      }),
    };
  });

  return {
    schemaVersion: AUTO_RESULT_SCHEMA_VERSION,
    status: 'ok',
    filePath,
    workflow: validation.workflow,
    policy: validation.policy,
    sandbox: validation.sandbox,
    steps,
    warnings: validation.warnings,
  };
};

export const planWorkflowFile = async (filePath: string): Promise<AutomationPlanResult> => {
  let content: string;

  try {
    content = await readFile(filePath, 'utf8');
  } catch {
    throw new ZaoWuError({
      code: 'WORKFLOW_READ_FAILED',
      message: 'Could not read workflow file.',
      why: `ZaoWu tried to read \`${filePath}\`, but the file was not readable.`,
      fix: 'Check the path and file permissions, then run the command again.',
    });
  }

  return planWorkflowContent(content, filePath);
};

export const runWorkflowFile = async (
  filePath: string,
  options: { yes?: boolean } = {}
): Promise<AutomationRunResult> => {
  const plan = await planWorkflowFile(filePath);
  const executed: string[] = [];
  const skipped: string[] = [];

  for (const step of plan.steps) {
    if (step.blocked) {
      if (step.reason && step.reason.includes('Dangerous command pattern found')) {
        throw new ZaoWuError({
          code: 'WORKFLOW_SHELL_DANGEROUS',
          message: `Workflow step \`${step.name}\` was blocked for safety.`,
          why: step.reason,
          fix: 'Remove the dangerous command pattern from the workflow steps.',
        });
      }
      skipped.push(`${step.name}: ${step.reason ?? 'blocked'}`);
      continue;
    }

    if (!options.yes) {
      skipped.push(`${step.name}: dry-run`);
      continue;
    }

    if (step.action === 'message') {
      executed.push(`${step.name}: ${step.preview}`);
    } else if (step.action === 'shell') {
      try {
        const cwd = path.dirname(path.resolve(filePath));
        const output = execSync(step.preview, {
          cwd,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        executed.push(`${step.name}: ${output.trim()}`);
      } catch (error) {
        throw new ZaoWuError({
          code: 'WORKFLOW_STEP_FAILED',
          message: `Workflow step \`${step.name}\` failed.`,
          why: error instanceof Error ? error.message : 'Unknown shell execution error.',
          fix: 'Check the shell command syntax and environment, then try again.',
        });
      }
    }
  }

  return {
    schemaVersion: AUTO_RESULT_SCHEMA_VERSION,
    status: options.yes ? 'ok' : 'preview',
    filePath,
    workflow: plan.workflow,
    policy: plan.policy,
    sandbox: plan.sandbox,
    executed,
    skipped,
  };
};
