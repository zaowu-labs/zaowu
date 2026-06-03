import { readFile } from 'node:fs/promises';
import { stripUtf8Bom, type DomainDefinition } from '@zaowu/core';
import { ZaoWuError } from '@zaowu/core';

export interface AutomationStep {
  name: string;
  message?: string;
  run?: string;
}

export interface AutomationWorkflow {
  name: string;
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

export const AUTO_DOMAIN: DomainDefinition = {
  name: 'auto',
  summary: 'Automation workflows with validation, dry-run, and confirmation',
  commands: [
    {
      name: 'validate',
      summary: 'Validate an automation workflow file',
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

  return {
    name: typeof parsed.name === 'string' && parsed.name ? parsed.name : 'workflow',
    steps: Array.isArray(parsed.steps) ? parsed.steps : [],
  };
};

const parseWorkflowYaml = (content: string): AutomationWorkflow => {
  const lines = content.split(/\r?\n/);
  let name = 'workflow';
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
    if (!step.message && !step.run) {
      warnings.push(`Step \`${step.name}\` has no supported action.`);
    }

    if (step.run) {
      warnings.push(
        `Step \`${step.name}\` uses shell execution, which this first version will not run.`
      );
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

export const runWorkflowFile = async (
  filePath: string,
  options: { yes?: boolean } = {}
): Promise<AutomationRunResult> => {
  const validation = await validateWorkflowFile(filePath);
  const executed: string[] = [];
  const skipped: string[] = [];

  for (const step of validation.workflow.steps) {
    if (step.run) {
      skipped.push(`${step.name}: shell execution is not supported in the first version`);
      continue;
    }

    if (!options.yes) {
      skipped.push(`${step.name}: dry-run`);
      continue;
    }

    if (step.message) {
      executed.push(`${step.name}: ${step.message}`);
    }
  }

  return {
    status: options.yes ? 'ok' : 'preview',
    filePath,
    workflow: validation.workflow,
    executed,
    skipped,
  };
};
