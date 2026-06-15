import { planWorkflowFile, runWorkflowFile, validateWorkflowFile } from '@zaowu/auto';
import {
  assertOperationPlanFingerprint,
  createOperationPlan,
  formatOperationPlan,
  formatPolicy,
  formatSandbox,
  requireTarget,
  result,
  withOperationPlan,
  type DomainActionHandler,
} from '../handler-utils.js';

export const handleAutoValidate: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw auto validate');
  const validation = await validateWorkflowFile(target);
  const human = [
    'ZaoWu Auto Validate',
    '',
    `File: ${validation.filePath}`,
    `Workflow: ${validation.workflow.name}`,
    `Version: ${validation.workflow.version}`,
    `Steps: ${validation.workflow.steps.length}`,
    '',
    'Policy:',
    formatPolicy(validation.policy),
    '',
    'Sandbox:',
    formatSandbox(validation.sandbox),
    '',
    validation.warnings.length > 0
      ? ['Warnings:', ...validation.warnings.map((warning) => `- ${warning}`)].join('\n')
      : 'Warnings: none',
  ].join('\n');

  return result(context, validation, human);
};

export const handleAutoRun: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw auto run');
  const plan = await planWorkflowFile(target);
  const readySteps = plan.steps
    .filter((step) => (step.action === 'message' || step.action === 'shell') && !step.blocked)
    .map((step) => step.name);
  const blockedSteps = plan.steps
    .filter((step) => step.blocked)
    .map((step) => `${step.name}: ${step.reason ?? 'blocked'}`);
  const operationPlan = createOperationPlan({
    risk: 'medium',
    confirmationRequired: !context.yes,
    subjects: [`workflow:${plan.filePath}`],
    reads: [plan.filePath],
    notes: [
      'Workflow runs preview by default.',
      `Policy shell: ${plan.policy.shell}.`,
      `Sandbox shellCommands: ${plan.sandbox.shellCommands}.`,
      `Ready steps: ${readySteps.length > 0 ? readySteps.join(', ') : 'none'}.`,
      `Blocked steps: ${blockedSteps.length > 0 ? blockedSteps.join('; ') : 'none'}.`,
      'Shell steps remain blocked in this foundation version, including with --yes.',
    ],
  });
  assertOperationPlanFingerprint(context, operationPlan);

  const run = await runWorkflowFile(target, { yes: context.yes });
  const human = [
    'ZaoWu Auto Run',
    '',
    `Status: ${run.status}`,
    `Workflow: ${run.workflow.name}`,
    `Version: ${run.workflow.version}`,
    '',
    'Sandbox:',
    formatSandbox(run.sandbox),
    '',
    formatOperationPlan(operationPlan),
    '',
    'Executed:',
    ...(run.executed.length > 0 ? run.executed.map((item) => `- ${item}`) : ['- none']),
    '',
    'Skipped:',
    ...(run.skipped.length > 0 ? run.skipped.map((item) => `- ${item}`) : ['- none']),
  ].join('\n');

  return result(context, withOperationPlan(run, operationPlan), human);
};

export const handleAutoPlan: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw auto plan');
  const plan = await planWorkflowFile(target);
  const human = [
    'ZaoWu Auto Plan',
    '',
    `File: ${plan.filePath}`,
    `Workflow: ${plan.workflow.name}`,
    `Version: ${plan.workflow.version}`,
    '',
    'Policy:',
    formatPolicy(plan.policy),
    '',
    'Sandbox:',
    formatSandbox(plan.sandbox),
    '',
    ...plan.steps.map(
      (step) =>
        `${step.index}. ${step.name} [${step.action}] ${step.blocked ? 'blocked' : 'ready'} (${step.policyDecision}; risk: ${step.operationPlan.risk}; confirmation: ${step.operationPlan.confirmationRequired ? 'yes' : 'no'}) - ${step.preview}`
    ),
    '',
    plan.warnings.length > 0
      ? ['Warnings:', ...plan.warnings.map((warning) => `- ${warning}`)].join('\n')
      : 'Warnings: none',
  ].join('\n');

  return result(context, plan, human);
};
