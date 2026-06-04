import { readFile } from 'node:fs/promises';
import { createCapabilityLedger, stripUtf8Bom, type DomainDefinition } from '@zaowu/core';
import { ZaoWuError } from '@zaowu/core';

export interface AutomationStep {
  name: string;
  message?: string;
  run?: string;
}

export interface AutomationWorkflow {
  name: string;
  variables: Record<string, string>;
  steps: AutomationStep[];
}

export interface AutomationValidationResult {
  status: 'ok';
  filePath: string;
  workflow: AutomationWorkflow;
  warnings: string[];
}

export interface AutomationRunResult {
  status: 'ok' | 'preview';
  filePath: string;
  workflow: AutomationWorkflow;
  executed: string[];
  skipped: string[];
}

export interface AutomationPlanStep {
  index: number;
  name: string;
  action: 'message' | 'shell' | 'unsupported';
  preview: string;
  blocked: boolean;
  reason?: string;
}

export interface AutomationPlanResult {
  status: 'ok';
  filePath: string;
  workflow: AutomationWorkflow;
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

const parseWorkflowJson = (content: string): AutomationWorkflow => {
  const parsed = JSON.parse(content) as Partial<AutomationWorkflow>;
  const variables =
    parsed.variables && typeof parsed.variables === 'object' && !Array.isArray(parsed.variables)
      ? Object.fromEntries(
          Object.entries(parsed.variables).map(([key, value]) => [key, String(value)])
        )
      : {};

  return {
    name: typeof parsed.name === 'string' && parsed.name ? parsed.name : 'workflow',
    variables,
    steps: Array.isArray(parsed.steps) ? parsed.steps : [],
  };
};

const parseWorkflowYaml = (content: string): AutomationWorkflow => {
  const lines = content.split(/\r?\n/);
  let name = 'workflow';
  let section: 'vars' | 'steps' | null = null;
  const variables: Record<string, string> = {};
  const steps: AutomationStep[] = [];
  let currentStep: AutomationStep | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim() || line.trim().startsWith('#')) {
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

  return {
    name,
    variables,
    steps,
  };
};

const parseWorkflow = (content: string, filePath: string): AutomationWorkflow => {
  const normalizedContent = stripUtf8Bom(content);

  try {
    return filePath.endsWith('.json')
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

const VARIABLE_PATTERN = /\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g;

const getReferencedVariables = (value: string | undefined): string[] =>
  value ? [...value.matchAll(VARIABLE_PATTERN)].map((match) => match[1]) : [];

const getMissingVariables = (step: AutomationStep, variables: Record<string, string>): string[] =>
  [
    ...new Set([...getReferencedVariables(step.message), ...getReferencedVariables(step.run)]),
  ].filter((name) => !(name in variables));

const substituteVariables = (value: string, variables: Record<string, string>): string =>
  value.replace(VARIABLE_PATTERN, (_match, name: string) => variables[name] ?? `{{${name}}}`);

export const validateWorkflowContent = (
  content: string,
  filePath = 'workflow.yml'
): AutomationValidationResult => {
  const workflow = parseWorkflow(content, filePath);
  const warnings: string[] = [];

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
      warnings.push(
        `Step \`${step.name}\` uses shell execution, which this first version will not run.`
      );
    }

    for (const missingVariable of getMissingVariables(step, workflow.variables)) {
      warnings.push(`Step \`${step.name}\` references undefined variable \`${missingVariable}\`.`);
    }
  }

  return {
    status: 'ok',
    filePath,
    workflow,
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
      return {
        index: index + 1,
        name: step.name,
        action: step.run ? 'shell' : step.message ? 'message' : 'unsupported',
        preview: step.message ?? step.run ?? '',
        blocked: true,
        reason: `Missing variable(s): ${missingVariables.join(', ')}`,
      };
    }

    if (step.run) {
      return {
        index: index + 1,
        name: step.name,
        action: 'shell',
        preview: substituteVariables(step.run, validation.workflow.variables),
        blocked: true,
        reason: 'Shell execution is not supported in this foundation version.',
      };
    }

    if (step.message) {
      return {
        index: index + 1,
        name: step.name,
        action: 'message',
        preview: substituteVariables(step.message, validation.workflow.variables),
        blocked: false,
      };
    }

    return {
      index: index + 1,
      name: step.name,
      action: 'unsupported',
      preview: '',
      blocked: true,
      reason: 'Step has no supported action.',
    };
  });

  return {
    status: 'ok',
    filePath,
    workflow: validation.workflow,
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
      skipped.push(`${step.name}: ${step.reason ?? 'blocked'}`);
      continue;
    }

    if (!options.yes) {
      skipped.push(`${step.name}: dry-run`);
      continue;
    }

    if (step.action === 'message') {
      executed.push(`${step.name}: ${step.preview}`);
    }
  }

  return {
    status: options.yes ? 'ok' : 'preview',
    filePath,
    workflow: plan.workflow,
    executed,
    skipped,
  };
};
