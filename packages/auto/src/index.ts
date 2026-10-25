import { realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import {
  hashOperationContent,
  createOperationPlan,
  isPathEscapingDirectory,
  readBoundedFile,
  stripUtf8Bom,
  ZaoWuError,
  type OperationPlan,
} from '@zaowu-labs/core';
import type {
  AutomationExecutionPolicy,
  AutomationExecutionReceipt,
  AutomationExecutionSandbox,
  AutomationPermissionMode,
  AutomationPermissionName,
  AutomationPlanResult,
  AutomationPlanStep,
  AutomationRunResult,
  AutomationStep,
  AutomationValidationResult,
  AutomationWorkflow,
  AutomationWorkflowPermissions,
  ParsedAutomationWorkflow,
} from './contracts.js';
import { checkShellSafety } from './shell-safety.js';

export * from './contracts.js';
export { AUTO_DOMAIN } from './domain.js';
export { checkShellSafety } from './shell-safety.js';

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

const workflowParseError = (why: string, fix: string): ZaoWuError =>
  new ZaoWuError({
    code: 'WORKFLOW_PARSE_FAILED',
    message: 'Could not parse workflow.',
    why,
    fix,
  });

const workflowStepError = (stepName: string, why: string, fix: string): ZaoWuError =>
  new ZaoWuError({
    code: 'WORKFLOW_STEP_FAILED',
    message: `Workflow step \`${stepName}\` failed.`,
    why,
    fix,
  });

const parseWorkflowJson = (content: string): ParsedAutomationWorkflow => {
  let parsed: Partial<AutomationWorkflow>;

  try {
    parsed = JSON.parse(content) as Partial<AutomationWorkflow>;
  } catch (error) {
    const detail = error instanceof SyntaxError ? `: ${error.message}` : '';
    throw workflowParseError(
      `Workflow content is not valid JSON${detail}.`,
      'Verify the JSON syntax and run `zw auto validate` again.'
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw workflowParseError(
      'Workflow content must be a JSON object.',
      'Use an object with name, version, and steps, then validate again.'
    );
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
 * YAML workflow parsing is intentionally schema-shaped even though it now uses
 * a real parser. The foundation runtime normalizes only the fields it supports
 * and reports unsupported or unsafe behavior through warnings and operation
 * plans instead of executing arbitrary YAML-driven actions.
 */
const parseWorkflowYaml = (content: string): ParsedAutomationWorkflow => {
  let parsedRaw: unknown;
  try {
    parsedRaw = YAML.parse(content);
  } catch (error) {
    throw workflowParseError(
      error instanceof Error ? error.message : 'The YAML parser rejected the file.',
      'Fix the YAML syntax and run `zw auto validate` again.'
    );
  }

  if (parsedRaw === null || parsedRaw === undefined) {
    parsedRaw = {};
  } else if (typeof parsedRaw !== 'object' || Array.isArray(parsedRaw)) {
    throw workflowParseError(
      'Workflow content is not a YAML object.',
      'Verify the workflow format and run `zw auto validate` again.'
    );
  }

  const parsed = parsedRaw as Record<string, unknown>;

  const version = parseWorkflowVersion(parsed.version);
  const name = typeof parsed.name === 'string' && parsed.name ? parsed.name.trim() : 'workflow';

  const variables: Record<string, string> = {};
  const rawVars = parsed.vars ?? parsed.variables;
  if (rawVars && typeof rawVars === 'object' && !Array.isArray(rawVars)) {
    for (const [k, v] of Object.entries(rawVars)) {
      Object.defineProperty(variables, k, {
        value: v === null || v === undefined ? '' : String(v).trim(),
        enumerable: true,
        writable: true,
        configurable: true,
      });
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
  } catch (error) {
    if (error instanceof ZaoWuError) {
      throw error;
    }

    throw workflowParseError(
      'ZaoWu supports simple JSON and YAML workflow files in this first version.',
      'Use `name` and `steps` with `message` steps, then run `zw auto validate` again.'
    );
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
  ].filter((name) => !Object.hasOwn(variables, name));

const substituteVariables = (value: string, variables: Record<string, string>): string =>
  value.replace(VARIABLE_PATTERN, (_match, name: string) =>
    Object.hasOwn(variables, name) ? variables[name] : `{{${name}}}`
  );

const getStepActionCount = (step: AutomationStep): number =>
  [step.message, step.run, step.writeFile].filter((value) => value !== undefined).length;

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

  if (!relativeTarget || isPathEscapingDirectory(workflowDirectory, targetPath)) {
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
    throw workflowStepError(
      stepName,
      `ZaoWu could not resolve the real workflow or target directory for \`${targetPath}\`.`,
      'Use an existing directory inside the workflow directory, then try again.'
    );
  }

  if (isPathEscapingDirectory(realWorkflowDirectory, realTargetDirectory)) {
    throw workflowStepError(
      stepName,
      `ZaoWu refused to follow a linked directory outside the workflow sandbox for \`${targetPath}\`.`,
      'Choose a writeFile.path whose parent directory resolves inside the workflow directory.'
    );
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
  if (parsedWorkflow.versionWarning || workflow.version !== SUPPORTED_WORKFLOW_VERSION)
    policy.fileWrites = 'blocked';

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

const readWorkflowFile = async (filePath: string): Promise<string> =>
  (
    await readBoundedFile(filePath, 4 * 1024 * 1024, {
      failed: {
        code: 'WORKFLOW_READ_FAILED',
        message: 'Could not read workflow file.',
        why: `ZaoWu could not read \`${filePath}\` as a regular file.`,
        fix: 'Check the path and file permissions, then try again.',
      },
      tooLarge: {
        code: 'WORKFLOW_PARSE_FAILED',
        message: 'Workflow file is too large.',
        why: 'Workflow input exceeds four MiB before parsing; text remains limited to one million characters.',
        fix: 'Split the workflow into smaller files.',
      },
    })
  ).toString('utf8');

export const validateWorkflowFile = async (filePath: string): Promise<AutomationValidationResult> =>
  validateWorkflowContent(await readWorkflowFile(filePath), filePath);

/**
 * Builds one plan step plus its embedded operation plan from a single set of
 * fields, so the step and the plan the user confirms can never disagree.
 */
const createPlanStep = (
  index: number,
  name: string,
  fields: {
    action: AutomationPlanStep['action'];
    preview: string;
    blocked: boolean;
    reason?: string;
    requiredPermission?: AutomationPlanStep['requiredPermission'];
    targetPath?: string;
    contentLength?: number;
    contentSha256?: string;
  }
): AutomationPlanStep => ({
  index: index + 1,
  name,
  action: fields.action,
  preview: fields.preview,
  targetPath: fields.targetPath,
  contentLength: fields.contentLength,
  contentSha256: fields.contentSha256,
  blocked: fields.blocked,
  requiredPermission: fields.requiredPermission,
  policyDecision: fields.blocked ? 'blocked' : 'allowed',
  reason: fields.reason,
  operationPlan: createStepOperationPlan(fields),
});

export const planWorkflowContent = (
  content: string,
  filePath = 'workflow.yml'
): AutomationPlanResult => {
  const validation = validateWorkflowContent(content, filePath);
  const steps = validation.workflow.steps.map((step, index): AutomationPlanStep => {
    if (validation.workflow.version !== SUPPORTED_WORKFLOW_VERSION)
      return createPlanStep(index, step.name, {
        action: 'unsupported',
        preview: '',
        blocked: true,
        reason: 'Unsupported workflow version; use version: 1.',
      });
    const missingVariables = getMissingVariables(step, validation.workflow.variables);
    const actionCount = getStepActionCount(step);

    if (actionCount > 1) {
      return createPlanStep(index, step.name, {
        action: 'unsupported',
        preview: '',
        blocked: true,
        reason: 'Step declares multiple actions; choose exactly one action.',
      });
    }

    if (missingVariables.length > 0) {
      const action = step.run
        ? 'shell'
        : step.message
          ? 'message'
          : step.writeFile
            ? 'writeFile'
            : 'unsupported';

      return createPlanStep(index, step.name, {
        action,
        preview: step.message ?? step.run ?? step.writeFile?.path ?? '',
        blocked: true,
        reason: `Missing variable(s): ${missingVariables.join(', ')}`,
        requiredPermission: step.run ? 'shell' : step.writeFile ? 'fileWrites' : undefined,
      });
    }

    if (step.run) {
      const preview = substituteVariables(step.run, validation.workflow.variables);
      const safetyError = checkShellSafety(preview);
      const isBlocked = validation.policy.shell === 'blocked' || !!safetyError;

      return createPlanStep(index, step.name, {
        action: 'shell',
        preview,
        blocked: isBlocked,
        reason: safetyError
          ? safetyError
          : isBlocked
            ? 'Shell execution is disabled in this foundation version.'
            : undefined,
        requiredPermission: 'shell',
      });
    }

    if (step.message) {
      return createPlanStep(index, step.name, {
        action: 'message',
        preview: substituteVariables(step.message, validation.workflow.variables),
        blocked: false,
      });
    }

    if (step.writeFile) {
      const requestedPath = substituteVariables(step.writeFile.path, validation.workflow.variables);
      const contentPreview = substituteVariables(
        step.writeFile.content,
        validation.workflow.variables
      );
      const resolvedPath = resolveWorkflowWritePath(
        validation.sandbox.workflowDirectory,
        requestedPath
      );
      const contentTooLarge = contentPreview.length > MAX_WRITE_FILE_CHARACTERS;
      const isBlocked =
        validation.policy.fileWrites !== 'prompt' ||
        Boolean(resolvedPath.reason) ||
        contentTooLarge;

      return createPlanStep(index, step.name, {
        action: 'writeFile',
        preview: `write ${requestedPath} (${contentPreview.length} chars)`,
        targetPath: resolvedPath.targetPath,
        contentLength: contentPreview.length,
        contentSha256: hashOperationContent(contentPreview),
        blocked: isBlocked,
        reason:
          resolvedPath.reason ??
          (contentTooLarge
            ? `writeFile.content exceeds the ${MAX_WRITE_FILE_CHARACTERS}-character limit.`
            : undefined) ??
          (isBlocked
            ? validation.workflow.permissions.fileWrites === 'prompt'
              ? 'File writes are blocked for an invalid workflow version.'
              : 'File writes require permissions.fileWrites: prompt.'
            : undefined),
        requiredPermission: 'fileWrites',
      });
    }

    return createPlanStep(index, step.name, {
      action: 'unsupported',
      preview: '',
      blocked: true,
      reason: 'Step has no supported action.',
    });
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

export const planWorkflowFile = async (filePath: string): Promise<AutomationPlanResult> =>
  planWorkflowContent(await readWorkflowFile(filePath), filePath);

export const runWorkflowPlan = async (
  plan: AutomationPlanResult,
  options: { yes?: boolean } = {}
): Promise<AutomationRunResult> => {
  const executed: string[] = [];
  const skipped: string[] = [];
  const receipts: AutomationExecutionReceipt[] = [];

  const createStepReceipt = (
    step: AutomationPlanResult['steps'][number],
    status: AutomationExecutionReceipt['status'],
    detail: string
  ): AutomationExecutionReceipt => ({
    index: step.index,
    name: step.name,
    action: step.action,
    status,
    detail,
    targetPath: step.targetPath,
    contentSha256: step.contentSha256,
    contentLength: step.contentLength,
  });

  const recordSkip = (
    step: AutomationPlanResult['steps'][number],
    status: 'blocked' | 'skipped',
    detail: string
  ): void => {
    skipped.push(`${step.name}: ${detail}`);
    receipts.push(createStepReceipt(step, status, detail));
  };

  for (const step of plan.steps) {
    if (step.blocked) {
      recordSkip(step, 'blocked', step.reason ?? 'blocked');
      continue;
    }

    if (!options.yes) {
      recordSkip(step, 'skipped', 'dry-run');
      continue;
    }

    if (step.action === 'message') {
      executed.push(`${step.name}: ${step.preview}`);
      receipts.push({
        index: step.index,
        name: step.name,
        action: step.action,
        status: 'executed',
        detail: step.preview,
      });
    } else if (step.action === 'writeFile') {
      const workflowStep = plan.workflow.steps[step.index - 1];
      const writeFileAction = workflowStep?.writeFile;
      if (!step.targetPath || !writeFileAction || !step.contentSha256) {
        recordSkip(step, 'skipped', 'missing write target');
        continue;
      }
      const content = substituteVariables(writeFileAction.content, plan.workflow.variables);
      if (hashOperationContent(content) !== step.contentSha256) {
        throw workflowStepError(
          step.name,
          'The planned file content no longer matches its content fingerprint.',
          'Re-run the workflow preview and confirm the current operation plan.'
        );
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
        throw workflowStepError(
          step.name,
          exists
            ? `ZaoWu refused to overwrite existing file \`${step.targetPath}\`.`
            : `ZaoWu tried to write \`${step.targetPath}\`, but the file system rejected the write.`,
          exists
            ? 'Choose a new writeFile.path or remove the existing file yourself first.'
            : 'Check the workflow directory permissions, then try again.'
        );
      }

      executed.push(`${step.name}: wrote ${step.targetPath}`);
      receipts.push(createStepReceipt(step, 'executed', `wrote ${step.targetPath}`));
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
    receipts,
  };
};

export const runWorkflowFile = async (
  filePath: string,
  options: { yes?: boolean } = {}
): Promise<AutomationRunResult> => runWorkflowPlan(await planWorkflowFile(filePath), options);
