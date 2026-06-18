import { createHash } from 'node:crypto';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
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
  writeFile?: {
    path: string;
    content: string;
  };
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

export const AUTO_DOMAIN: DomainDefinition = {
  name: 'auto',
  summary: 'Automation workflows with validation, dry-run, and confirmation',
  capabilities: createCapabilityLedger({
    readsFiles: true,
    writesFiles: true,
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
const MAX_WORKFLOW_CHARACTERS = 1_000_000;
const MAX_WRITE_FILE_CHARACTERS = 256 * 1024;
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
  shell: 'blocked',
  fileWrites: permissions.fileWrites === 'prompt' ? 'prompt' : 'blocked',
  network: 'blocked',
});

const resolveWorkflowDirectory = (filePath: string): string => path.resolve(path.dirname(filePath));

const createExecutionSandbox = (
  filePath: string,
  policy: AutomationExecutionPolicy
): AutomationExecutionSandbox => ({
  ...DEFAULT_EXECUTION_SANDBOX,
  fileWrites: policy.fileWrites === 'prompt' ? 'workflow-directory' : 'blocked',
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
    steps: Array.isArray(parsed.steps)
      ? parsed.steps.map((step): AutomationStep => {
          if (!step || typeof step !== 'object') {
            return { name: '' };
          }

          const stepObj = step as unknown as Record<string, unknown>;
          const writeFileValue = stepObj.writeFile;
          const writeFileAction =
            writeFileValue && typeof writeFileValue === 'object' && !Array.isArray(writeFileValue)
              ? (writeFileValue as Record<string, unknown>)
              : undefined;

          return {
            name: typeof stepObj.name === 'string' ? stepObj.name : '',
            ...(typeof stepObj.message === 'string' ? { message: stepObj.message } : {}),
            ...(typeof stepObj.run === 'string' ? { run: stepObj.run } : {}),
            ...(writeFileAction
              ? {
                  writeFile: {
                    path:
                      typeof writeFileAction.path === 'string'
                        ? writeFileAction.path
                        : String(writeFileAction.path ?? ''),
                    content:
                      typeof writeFileAction.content === 'string'
                        ? writeFileAction.content
                        : String(writeFileAction.content ?? ''),
                  },
                }
              : {}),
          };
        })
      : [],
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
  let parsedRaw: unknown;
  try {
    parsedRaw = YAML.parse(content);
  } catch (error) {
    throw new ZaoWuError({
      code: 'WORKFLOW_PARSE_FAILED',
      message: 'Could not parse workflow.',
      why: error instanceof Error ? error.message : 'The YAML parser rejected the file.',
      fix: 'Fix the YAML syntax and run `zw auto validate` again.',
    });
  }

  if (parsedRaw === null || parsedRaw === undefined) {
    parsedRaw = {};
  } else if (typeof parsedRaw !== 'object' || Array.isArray(parsedRaw)) {
    throw new ZaoWuError({
      code: 'WORKFLOW_PARSE_FAILED',
      message: 'Could not parse workflow.',
      why: 'Workflow content is not a YAML object.',
      fix: 'Verify the workflow format and run `zw auto validate` again.',
    });
  }

  const parsed = parsedRaw as Record<string, unknown>;

  const version = parseWorkflowVersion(parsed.version);
  const name = typeof parsed.name === 'string' && parsed.name ? parsed.name.trim() : 'workflow';

  const variables: Record<string, string> = {};
  const rawVars = parsed.vars ?? parsed.variables;
  if (rawVars && typeof rawVars === 'object' && !Array.isArray(rawVars)) {
    for (const [k, v] of Object.entries(rawVars)) {
      variables[k] = v === null || v === undefined ? '' : String(v).trim();
    }
  }

  const { policy, permissionWarnings } = parseExecutionPolicy(parsed.permissions);

  const steps: AutomationStep[] = [];
  if (Array.isArray(parsed.steps)) {
    for (const step of parsed.steps) {
      if (step && typeof step === 'object') {
        const stepObj = step as Record<string, unknown>;
        const stepName =
          typeof stepObj.name === 'string' && stepObj.name ? stepObj.name.trim() : '';
        const stepMessage =
          typeof stepObj.message === 'string' ? stepObj.message.trim() : undefined;
        const stepRun = typeof stepObj.run === 'string' ? stepObj.run.trim() : undefined;
        const writeFileValue = stepObj.writeFile;
        const writeFileAction =
          writeFileValue && typeof writeFileValue === 'object' && !Array.isArray(writeFileValue)
            ? (writeFileValue as Record<string, unknown>)
            : undefined;
        const stepWriteFile = writeFileAction
          ? {
              path:
                typeof writeFileAction.path === 'string'
                  ? writeFileAction.path.trim()
                  : String(writeFileAction.path ?? '').trim(),
              content:
                typeof writeFileAction.content === 'string'
                  ? writeFileAction.content
                  : String(writeFileAction.content ?? ''),
            }
          : undefined;

        steps.push({
          name: stepName,
          ...(stepMessage !== undefined ? { message: stepMessage } : {}),
          ...(stepRun !== undefined ? { run: stepRun } : {}),
          ...(stepWriteFile !== undefined ? { writeFile: stepWriteFile } : {}),
        });
      }
    }
  }

  return {
    ...version,
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
    ...new Set([
      ...getReferencedVariables(step.message),
      ...getReferencedVariables(step.run),
      ...getReferencedVariables(step.writeFile?.path),
      ...getReferencedVariables(step.writeFile?.content),
    ]),
  ].filter((name) => !(name in variables));

const substituteVariables = (value: string, variables: Record<string, string>): string =>
  value.replace(VARIABLE_PATTERN, (_match, name: string) => variables[name] ?? `{{${name}}}`);

const getStepActionCount = (step: AutomationStep): number =>
  [step.message, step.run, step.writeFile].filter((value) => value !== undefined).length;

const hashWriteContent = (content: string): string =>
  createHash('sha256').update(content, 'utf8').digest('hex');

const resolveWorkflowWritePath = (
  workflowDirectory: string,
  requestedPath: string
): { targetPath?: string; reason?: string } => {
  const trimmedPath = requestedPath.trim();

  if (!trimmedPath) {
    return {
      reason: 'writeFile.path is required.',
    };
  }

  if (path.isAbsolute(trimmedPath)) {
    return {
      reason: 'writeFile.path must be relative to the workflow directory.',
    };
  }

  const targetPath = path.resolve(workflowDirectory, trimmedPath);
  const relativeTarget = path.relative(workflowDirectory, targetPath);

  if (
    !relativeTarget ||
    relativeTarget === '..' ||
    relativeTarget.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeTarget)
  ) {
    return {
      reason: 'writeFile.path must name a file inside the workflow directory.',
    };
  }

  return { targetPath };
};

const resolveSandboxedWriteTarget = async (
  workflowDirectory: string,
  targetPath: string,
  stepName: string
): Promise<string> => {
  let realWorkflowDirectory: string;
  let realTargetDirectory: string;

  try {
    [realWorkflowDirectory, realTargetDirectory] = await Promise.all([
      realpath(workflowDirectory),
      realpath(path.dirname(targetPath)),
    ]);
  } catch {
    throw new ZaoWuError({
      code: 'WORKFLOW_STEP_FAILED',
      message: `Workflow step \`${stepName}\` failed.`,
      why: `ZaoWu could not resolve the real workflow or target directory for \`${targetPath}\`.`,
      fix: 'Use an existing directory inside the workflow directory, then try again.',
    });
  }

  const relativeDirectory = path.relative(realWorkflowDirectory, realTargetDirectory);
  if (
    relativeDirectory === '..' ||
    relativeDirectory.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeDirectory)
  ) {
    throw new ZaoWuError({
      code: 'WORKFLOW_STEP_FAILED',
      message: `Workflow step \`${stepName}\` failed.`,
      why: `ZaoWu refused to follow a linked directory outside the workflow sandbox for \`${targetPath}\`.`,
      fix: 'Choose a writeFile.path whose parent directory resolves inside the workflow directory.',
    });
  }

  return path.join(realTargetDirectory, path.basename(targetPath));
};

const createStepOperationPlan = (step: {
  action: AutomationPlanStep['action'];
  preview: string;
  targetPath?: string;
  contentLength?: number;
  contentSha256?: string;
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

  if (step.action === 'writeFile') {
    return createOperationPlan({
      risk: 'medium',
      confirmationRequired: true,
      subjects: [
        ...(step.contentSha256 ? [`content-sha256:${step.contentSha256}`] : []),
        ...(step.contentLength !== undefined ? [`content-length:${step.contentLength}`] : []),
      ],
      writes: step.targetPath ? [step.targetPath] : [],
      notes: [
        ...blockedNote,
        'writeFile steps can only create new files inside the workflow directory.',
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

  // 1. rm -rf, rm -r, rm -f, rm --recursive, rm --force
  if (
    /\brm\s+-[a-z]*[rf]/i.test(normalized) ||
    /\brm\s+--recursive/i.test(normalized) ||
    /\brm\s+--force/i.test(normalized)
  ) {
    return 'Dangerous command pattern found: `rm` with recursive/force flags.';
  }

  // 2. Windows recursive deletions: del /s, erase /s, rd /s, rmdir /s
  if (
    /\b(del|erase|rd|rmdir)\b/i.test(normalized) &&
    (/\/[a-z]*s/i.test(normalized) || /\b-(recurse|s)\b/i.test(normalized))
  ) {
    return 'Dangerous command pattern found: recursive deletion (`del`, `rd`, or `rmdir` with `/s` or `-recurse`).';
  }

  // 3. Windows format drive: format c: etc.
  if (/\bformat\s+[a-z]:/i.test(normalized)) {
    return 'Dangerous command pattern found: disk formatting (`format`).';
  }

  // 4. sudo
  if (/\bsudo\b/i.test(normalized)) {
    return 'Dangerous command pattern found: execution with administrative privileges (`sudo`).';
  }

  // 5. chmod or chown
  if (/\bchmod\b/i.test(normalized)) {
    return 'Dangerous command pattern found: modifying file permissions (`chmod`).';
  }
  if (/\bchown\b/i.test(normalized)) {
    return 'Dangerous command pattern found: changing file ownership (`chown`).';
  }

  // 6. piped shell execution like curl | sh, wget | bash, or iex/invoke-expression
  if (
    /\|\s*(sh|bash|zsh|fish|cmd|powershell|pwsh|iex)\b/i.test(normalized) ||
    /\biex\b/i.test(normalized) ||
    /\binvoke-expression\b/i.test(normalized)
  ) {
    return 'Dangerous command pattern found: piped shell execution or dynamic command evaluation.';
  }

  // 7. Base64 obfuscation decoding into shell execution
  if (
    /\bbase64\b/i.test(normalized) &&
    (/\|\s*(sh|bash|zsh|fish|cmd|powershell|pwsh|iex)\b/i.test(normalized) ||
      /\b--decode\b/i.test(normalized) ||
      /\b-d\b/i.test(normalized))
  ) {
    return 'Dangerous command pattern found: decoding base64 payload into shell execution.';
  }

  // 8. Reverse shell or TCP/UDP redirection pattern (e.g., /dev/tcp/ or /dev/udp/)
  if (/\/dev\/(tcp|udp)\//i.test(normalized)) {
    return 'Dangerous command pattern found: network redirect / reverse shell redirection (`/dev/tcp` or `/dev/udp`).';
  }

  // 9. Netcat backdoor execution (e.g., nc -e or netcat -e)
  if (/\b(nc|netcat|ncat)\b/i.test(normalized) && /\s+-e\b/i.test(normalized)) {
    return 'Dangerous command pattern found: netcat executable execution flag (`-e` redirection).';
  }

  // 10. Interactive shell spawn commands (e.g. bash -i, sh -i)
  if (/\b(bash|sh|zsh|dash|ksh)\s+-i\b/i.test(normalized)) {
    return 'Dangerous command pattern found: interactive shell spawn (`-i` flag).';
  }

  // 11. Download and execute scripts sequentially (e.g. curl ... -o x && sh x, wget ... && bash x)
  if (
    /\b(curl|wget)\b/i.test(normalized) &&
    /\b(sh|bash|zsh|cmd|powershell|pwsh)\b/i.test(normalized) &&
    (/\.sh\b/i.test(normalized) || /\.ps1\b/i.test(normalized) || /\.bat\b/i.test(normalized))
  ) {
    return 'Dangerous command pattern found: download and sequential script execution.';
  }

  // 12. Write redirection to sensitive system paths (e.g. > /etc/ or > c:\windows)
  if (
    />>\s*([/\\]etc[/\\]|c:[/\\]windows[/\\])/i.test(normalized) ||
    />\s*([/\\]etc[/\\]|c:[/\\]windows[/\\])/i.test(normalized)
  ) {
    return 'Dangerous command pattern found: write redirection to sensitive system directory.';
  }

  // 13. Writing to sensitive files using tee (e.g. tee /etc/passwd)
  if (/\btee\b.*([/\\]etc[/\\]|c:[/\\]windows[/\\])/i.test(normalized)) {
    return 'Dangerous command pattern found: writing to sensitive system path using tee.';
  }

  return undefined;
}

export const validateWorkflowContent = (
  content: string,
  filePath = 'workflow.yml'
): AutomationValidationResult => {
  if (content.length > MAX_WORKFLOW_CHARACTERS) {
    throw new ZaoWuError({
      code: 'WORKFLOW_PARSE_FAILED',
      message: 'Workflow file is too large.',
      why: `ZaoWu limits workflow files to ${MAX_WORKFLOW_CHARACTERS} characters, but \`${filePath}\` contains ${content.length}.`,
      fix: 'Split the workflow into smaller files and keep generated content in bounded writeFile steps.',
    });
  }

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

    const actionCount = getStepActionCount(step);

    if (actionCount === 0) {
      warnings.push(`Step \`${step.name}\` has no supported action.`);
    }

    if (actionCount > 1) {
      warnings.push(`Step \`${step.name}\` declares multiple actions; choose exactly one action.`);
    }

    if (step.run) {
      const safetyError = checkShellSafety(step.run);
      if (safetyError) {
        warnings.push(`Step \`${step.name}\` safety violation: ${safetyError}`);
      }
      warnings.push(
        `Step \`${step.name}\` uses shell execution, which this first version will not run.`
      );
    }

    if (step.writeFile) {
      if (!step.writeFile.path.trim()) {
        warnings.push(`Step \`${step.name}\` writeFile.path is required.`);
      }
      if (workflow.permissions.fileWrites !== 'prompt') {
        warnings.push(
          `Step \`${step.name}\` writes a file, but permissions.fileWrites is not prompt.`
        );
      }
      if (step.writeFile.content.length > MAX_WRITE_FILE_CHARACTERS) {
        warnings.push(
          `Step \`${step.name}\` writeFile.content exceeds the ${MAX_WRITE_FILE_CHARACTERS}-character limit.`
        );
      }
    }

    for (const missingVariable of getMissingVariables(step, workflow.variables)) {
      warnings.push(`Step \`${step.name}\` references undefined variable \`${missingVariable}\`.`);
    }
  }

  const policy = createExecutionPolicy(workflow.permissions);

  return {
    schemaVersion: AUTO_RESULT_SCHEMA_VERSION,
    status: 'ok',
    filePath,
    workflow,
    policy,
    sandbox: createExecutionSandbox(filePath, policy),
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
    const actionCount = getStepActionCount(step);

    if (actionCount > 1) {
      const reason = 'Step declares multiple actions; choose exactly one action.';

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
    }

    if (missingVariables.length > 0) {
      const action = step.run
        ? 'shell'
        : step.message
          ? 'message'
          : step.writeFile
            ? 'writeFile'
            : 'unsupported';
      const preview = step.message ?? step.run ?? step.writeFile?.path ?? '';
      const reason = `Missing variable(s): ${missingVariables.join(', ')}`;

      return {
        index: index + 1,
        name: step.name,
        action,
        preview,
        blocked: true,
        requiredPermission: step.run ? 'shell' : step.writeFile ? 'fileWrites' : undefined,
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
      const shellPolicy = validation.policy.shell;
      const preview = substituteVariables(step.run, validation.workflow.variables);
      const safetyError = checkShellSafety(preview);
      const isBlocked = shellPolicy === 'blocked' || !!safetyError;
      const reason = safetyError
        ? safetyError
        : isBlocked
          ? 'Shell execution is disabled in this foundation version.'
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

    if (step.writeFile) {
      const requestedPath = substituteVariables(step.writeFile.path, validation.workflow.variables);
      const contentPreview = substituteVariables(
        step.writeFile.content,
        validation.workflow.variables
      );
      const contentSha256 = hashWriteContent(contentPreview);
      const resolvedPath = resolveWorkflowWritePath(
        validation.sandbox.workflowDirectory,
        requestedPath
      );
      const contentTooLarge = contentPreview.length > MAX_WRITE_FILE_CHARACTERS;
      const isBlocked =
        validation.policy.fileWrites !== 'prompt' ||
        Boolean(resolvedPath.reason) ||
        contentTooLarge;
      const reason =
        resolvedPath.reason ??
        (contentTooLarge
          ? `writeFile.content exceeds the ${MAX_WRITE_FILE_CHARACTERS}-character limit.`
          : undefined) ??
        (isBlocked ? 'File writes require permissions.fileWrites: prompt.' : undefined);
      const preview = `write ${requestedPath} (${contentPreview.length} chars)`;

      return {
        index: index + 1,
        name: step.name,
        action: 'writeFile',
        preview,
        targetPath: resolvedPath.targetPath,
        contentLength: contentPreview.length,
        contentSha256,
        blocked: isBlocked,
        requiredPermission: 'fileWrites',
        policyDecision: isBlocked ? 'blocked' : 'allowed',
        reason,
        operationPlan: createStepOperationPlan({
          action: 'writeFile',
          preview,
          targetPath: resolvedPath.targetPath,
          contentLength: contentPreview.length,
          contentSha256,
          blocked: isBlocked,
          reason,
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

export const runWorkflowPlan = async (
  plan: AutomationPlanResult,
  options: { yes?: boolean } = {}
): Promise<AutomationRunResult> => {
  const executed: string[] = [];
  const skipped: string[] = [];

  for (const step of plan.steps) {
    if (step.blocked) {
      skipped.push(`${step.name}: ${step.reason ?? 'blocked'}`);
      continue;
    }

    if (!options.yes) {
      skipped.push(`${step.name}: dry-run`);
      continue;
    }

    if (step.action === 'message') {
      executed.push(`${step.name}: ${step.preview}`);
    } else if (step.action === 'writeFile') {
      const workflowStep = plan.workflow.steps[step.index - 1];
      const writeFileAction = workflowStep?.writeFile;
      if (!step.targetPath || !writeFileAction || !step.contentSha256) {
        skipped.push(`${step.name}: missing write target`);
        continue;
      }
      const content = substituteVariables(writeFileAction.content, plan.workflow.variables);
      if (hashWriteContent(content) !== step.contentSha256) {
        throw new ZaoWuError({
          code: 'WORKFLOW_STEP_FAILED',
          message: `Workflow step \`${step.name}\` failed.`,
          why: 'The planned file content no longer matches its content fingerprint.',
          fix: 'Re-run the workflow preview and confirm the current operation plan.',
        });
      }

      const sandboxedTarget = await resolveSandboxedWriteTarget(
        plan.sandbox.workflowDirectory,
        step.targetPath,
        step.name
      );

      try {
        await writeFile(sandboxedTarget, content, { encoding: 'utf8', flag: 'wx' });
      } catch (error) {
        const exists = (error as { code?: string }).code === 'EEXIST';
        throw new ZaoWuError({
          code: 'WORKFLOW_STEP_FAILED',
          message: `Workflow step \`${step.name}\` failed.`,
          why: exists
            ? `ZaoWu refused to overwrite existing file \`${step.targetPath}\`.`
            : `ZaoWu tried to write \`${step.targetPath}\`, but the file system rejected the write.`,
          fix: exists
            ? 'Choose a new writeFile.path or remove the existing file yourself first.'
            : 'Check the workflow directory permissions, then try again.',
        });
      }

      executed.push(`${step.name}: wrote ${step.targetPath}`);
    }
  }

  return {
    schemaVersion: AUTO_RESULT_SCHEMA_VERSION,
    status: options.yes ? 'ok' : 'preview',
    filePath: plan.filePath,
    workflow: plan.workflow,
    policy: plan.policy,
    sandbox: plan.sandbox,
    executed,
    skipped,
  };
};

export const runWorkflowFile = async (
  filePath: string,
  options: { yes?: boolean } = {}
): Promise<AutomationRunResult> => runWorkflowPlan(await planWorkflowFile(filePath), options);
