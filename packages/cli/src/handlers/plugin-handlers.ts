import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { installPlugin, listPlugins, removePlugin, validatePluginSource } from '@zaowu-labs/plugin';
import {
  assertOperationPlanFingerprint,
  createContentOperationSubjects,
  createOperationPlan,
  formatConfirmCommand,
  formatOperationPlan,
  getValue,
  hashOperationContent,
  requireTarget,
  result,
  withOperationPlan,
  type DomainActionHandler,
} from '../handler-utils.js';

const getTargetFileSubjects = async (filePath: string): Promise<string[]> => {
  try {
    const content = await readFile(filePath, 'utf8');

    return [
      'target-state:exists',
      `target-content-sha256:${hashOperationContent(content)}`,
      `target-content-length:${content.length}`,
    ];
  } catch (error) {
    return (error as { code?: string }).code === 'ENOENT'
      ? ['target-state:missing']
      : ['target-state:unreadable'];
  }
};

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
  const preview = await installPlugin(id, {
    cwd: context.cwd,
    source,
  });
  const pluginPath = path.join(preview.pluginDir, `${preview.plugin.id}.json`);
  const previewManifestContent = `${JSON.stringify(preview.plugin, null, 2)}\n`;
  const targetFileSubjects = await getTargetFileSubjects(pluginPath);
  const operationPlan = createOperationPlan({
    risk: 'medium',
    confirmationRequired: !context.yes,
    subjects: [
      `plugin:${preview.plugin.id}`,
      `source:${preview.plugin.source}`,
      ...createContentOperationSubjects(previewManifestContent),
      ...targetFileSubjects,
    ],
    reads: preview.plugin.source === preview.plugin.id ? [] : [preview.plugin.source],
    writes: [pluginPath],
    notes: ['Plugin installation writes a local manifest only when --yes is provided.'],
  });
  assertOperationPlanFingerprint(context, operationPlan);

  const installed = context.yes
    ? await installPlugin(id, {
        cwd: context.cwd,
        source,
        yes: true,
      })
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
  const preview = await removePlugin(id, {
    cwd: context.cwd,
  });
  const pluginPath = path.join(preview.pluginDir, `${preview.plugin.id}.json`);
  const targetFileSubjects = await getTargetFileSubjects(pluginPath);
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
