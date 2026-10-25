import path from 'node:path';
import {
  getPluginTargetSubjects,
  installPlugin,
  listPlugins,
  removePlugin,
  validatePluginSource,
} from '@zaowu-labs/plugin';
import {
  assertOperationPlanFingerprint,
  createOperationPlan,
  formatConfirmCommand,
  formatLabeledList,
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
  const source = getValue(context.parsed, '--source');
  // One options object for both the preview and the confirmed call: the
  // fingerprint the user confirms is computed from the preview, so the two
  // calls must be structurally unable to drift apart.
  const installOptions = { cwd: context.cwd, source };
  const preview = await installPlugin(id, installOptions);
  const pluginPath = path.join(preview.pluginDir, `${preview.plugin.id}.json`);
  const targetFileSubjects = await getPluginTargetSubjects(id, { cwd: context.cwd });
  const operationPlan = createOperationPlan({
    risk: 'medium',
    confirmationRequired: !context.yes,
    subjects: [
      `plugin:${preview.plugin.id}`,
      `source:${preview.plugin.source}`,
      ...targetFileSubjects,
    ],
    reads: preview.plugin.source === preview.plugin.id ? [] : [preview.plugin.source],
    writes: [pluginPath],
    notes: [
      'Plugin installation writes a local manifest only when --yes is provided.',
      'The installation timestamp is generated at confirmation; the plugin id and source are fixed by this plan.',
    ],
  });
  assertOperationPlanFingerprint(context, operationPlan);

  const installed = context.yes
    ? await installPlugin(id, { ...installOptions, yes: true })
    : preview;
  const confirmCommand = formatConfirmCommand([
    'zw',
    'plugin',
    'install',
    id,
    ...(source ? ['--source', source] : []),
    '--yes',
    '--plan-fingerprint',
    operationPlan.fingerprint,
  ]);
  const human = [
    'ZaoWu Plugin Install',
    '',
    `Status: ${installed.status}`,
    `Plugin: ${installed.plugin.id}`,
    `Source: ${installed.plugin.source}`,
    `Wrote file: ${installed.wroteFile ? 'yes' : 'no'}`,
    '',
    formatOperationPlan(operationPlan),
    ...(context.yes
      ? []
      : ['', 'To execute this plugin install plan, run:', `  ${confirmCommand}`]),
  ].join('\n');

  return result(context, withOperationPlan(installed, operationPlan), human);
};

export const handlePluginRemove: DomainActionHandler = async (args, context) => {
  const id = requireTarget(args, 'zw plugin remove');
  const removeOptions = { cwd: context.cwd };
  const preview = await removePlugin(id, removeOptions);
  const pluginPath = path.join(preview.pluginDir, `${preview.plugin.id}.json`);
  const targetFileSubjects = await getPluginTargetSubjects(id, { cwd: context.cwd });
  const operationPlan = createOperationPlan({
    risk: 'medium',
    confirmationRequired: !context.yes,
    subjects: [`plugin:${preview.plugin.id}`, ...targetFileSubjects],
    reads: [pluginPath],
    deletes: [pluginPath],
    notes: ['Plugin removal deletes a local manifest only when --yes is provided.'],
  });
  assertOperationPlanFingerprint(context, operationPlan);

  const removed = context.yes
    ? await removePlugin(id, {
        ...removeOptions,
        yes: true,
        expectedTargetSubjects: targetFileSubjects,
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
    ...(context.yes
      ? []
      : [
          '',
          'To execute this plugin removal plan, run:',
          `  ${formatConfirmCommand([
            'zw',
            'plugin',
            'remove',
            id,
            '--yes',
            '--plan-fingerprint',
            operationPlan.fingerprint,
          ])}`,
        ]),
  ].join('\n');

  return result(context, withOperationPlan(removed, operationPlan), human);
};

export const handlePluginValidate: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw plugin validate');
  const validation = await validatePluginSource(target, { cwd: context.cwd });
  const human = [
    'ZaoWu Plugin Validate',
    '',
    `Status: ${validation.status}`,
    `Target: ${validation.target}`,
    `Manifest: ${validation.manifestPath ?? 'none'}`,
    '',
    formatLabeledList('Errors', validation.errors),
    '',
    formatLabeledList('Warnings', validation.warnings),
  ].join('\n');

  return result(context, validation, human);
};
