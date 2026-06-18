import { planWorkflowFile, runWorkflowPlan, validateWorkflowFile } from '@zaowu/auto';
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
    .filter(
      (step) =>
        (step.action === 'message' || step.action === 'shell' || step.action === 'writeFile') &&
        !step.blocked
    )
    .map((step) => step.name);
  const writeTargets = plan.steps
    .filter((step) => step.action === 'writeFile' && !step.blocked && step.targetPath)
    .map((step) => step.targetPath!);
  const writeSubjects = plan.steps
    .filter((step) => step.action === 'writeFile' && !step.blocked && step.contentSha256)
    .flatMap((step) => [
      `step:${step.name}`,
      `content-sha256:${step.contentSha256}`,
      `content-length:${step.contentLength ?? 0}`,
    ]);
  const blockedSteps = plan.steps
    .filter((step) => step.blocked)
    .map((step) => `${step.name}: ${step.reason ?? 'blocked'}`);
  const operationPlan = createOperationPlan({
    risk: writeTargets.length > 0 ? 'high' : 'medium',
    confirmationRequired: !context.yes,
    subjects: [`workflow:${plan.filePath}`, ...writeSubjects],
    reads: [plan.filePath],
    writes: writeTargets,
    notes: [
      'Workflow runs preview by default.',
      `Policy shell: ${plan.policy.shell}.`,
      `Policy fileWrites: ${plan.policy.fileWrites}.`,
      `Sandbox shellCommands: ${plan.sandbox.shellCommands}.`,
      `Sandbox fileWrites: ${plan.sandbox.fileWrites}.`,
      `Ready steps: ${readySteps.length > 0 ? readySteps.join(', ') : 'none'}.`,
      `Blocked steps: ${blockedSteps.length > 0 ? blockedSteps.join('; ') : 'none'}.`,
      'Shell steps remain blocked in this foundation version, including with --yes.',
      'writeFile steps can only create new files inside the workflow directory.',
    ],
  });
  assertOperationPlanFingerprint(context, operationPlan);

  const run = await runWorkflowPlan(plan, { yes: context.yes });
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
