import { installPlugin, listPlugins, removePlugin, validatePluginSource } from '@zaowu/plugin';
import {
  assertOperationPlanFingerprint,
  createOperationPlan,
  formatOperationPlan,
  getValue,
  requireTarget,
  result,
  withOperationPlan,
  type DomainActionHandler,
} from '../handler-utils.js';

export const handlePluginList: DomainActionHandler = async (_args, context) => {
  const listed = await listPlugins({ cwd: context.cwd });
  const human = [
    'ZaoWu Plugin List',
    '',
    `Directory: ${listed.pluginDir}`,
    '',
    listed.plugins.length > 0
      ? listed.plugins.map((plugin) => `- ${plugin.id} (${plugin.source})`).join('\n')
      : 'No plugins installed.',
  ].join('\n');

  return result(context, listed, human);
};

export const handlePluginInstall: DomainActionHandler = async (args, context) => {
  const id = requireTarget(args, 'zw plugin install');
  const preview = await installPlugin(id, {
    cwd: context.cwd,
    source: getValue(context.parsed, '--source'),
  });
  const operationPlan = createOperationPlan({
    risk: 'medium',
    confirmationRequired: !context.yes,
    subjects: [`plugin:${preview.plugin.id}`, `source:${preview.plugin.source}`],
    reads: preview.plugin.source === preview.plugin.id ? [] : [preview.plugin.source],
    writes: [`${preview.pluginDir}/${preview.plugin.id}.json`],
    notes: ['Plugin installation writes a local manifest only when --yes is provided.'],
  });
  assertOperationPlanFingerprint(context, operationPlan);

  const installed = context.yes
    ? await installPlugin(id, {
        cwd: context.cwd,
        source: getValue(context.parsed, '--source'),
        yes: true,
      })
    : preview;
  const human = [
    'ZaoWu Plugin Install',
    '',
    `Status: ${installed.status}`,
    `Plugin: ${installed.plugin.id}`,
    `Source: ${installed.plugin.source}`,
    `Wrote file: ${installed.wroteFile ? 'yes' : 'no'}`,
    '',
    formatOperationPlan(operationPlan),
  ].join('\n');

  return result(context, withOperationPlan(installed, operationPlan), human);
};

export const handlePluginRemove: DomainActionHandler = async (args, context) => {
  const id = requireTarget(args, 'zw plugin remove');
  const preview = await removePlugin(id, {
    cwd: context.cwd,
  });
  const operationPlan = createOperationPlan({
    risk: 'medium',
    confirmationRequired: !context.yes,
    subjects: [`plugin:${preview.plugin.id}`],
    deletes: [`${preview.pluginDir}/${preview.plugin.id}.json`],
    notes: ['Plugin removal deletes a local manifest only when --yes is provided.'],
  });
  assertOperationPlanFingerprint(context, operationPlan);

  const removed = context.yes
    ? await removePlugin(id, {
        cwd: context.cwd,
        yes: true,
      })
    : preview;
  const human = [
    'ZaoWu Plugin Remove',
    '',
    `Status: ${removed.status}`,
    `Plugin: ${removed.plugin.id}`,
    `Removed file: ${removed.removedFile ? 'yes' : 'no'}`,
    '',
    formatOperationPlan(operationPlan),
  ].join('\n');

  return result(context, withOperationPlan(removed, operationPlan), human);
};

export const handlePluginValidate: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw plugin validate');
  const validation = await validatePluginSource(target);
  const human = [
    'ZaoWu Plugin Validate',
    '',
    `Status: ${validation.status}`,
    `Target: ${validation.target}`,
    `Manifest: ${validation.manifestPath ?? 'none'}`,
    '',
    validation.errors.length > 0
      ? ['Errors:', ...validation.errors.map((error) => `- ${error}`)].join('\n')
      : 'Errors: none',
    '',
    validation.warnings.length > 0
      ? ['Warnings:', ...validation.warnings.map((warning) => `- ${warning}`)].join('\n')
      : 'Warnings: none',
  ].join('\n');

  return result(context, validation, human);
};
