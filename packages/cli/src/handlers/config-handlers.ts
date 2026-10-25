import {
  findConfigPathOrThrow,
  getResolvedConfigValue,
  loadResolvedConfig,
  migrateResolvedConfig,
  setResolvedConfigValue,
  validateResolvedConfig,
} from '@zaowu-labs/config';
import {
  assertOperationPlanFingerprint,
  createContentOperationSubjects,
  createOperationPlan,
  formatLabeledList,
  formatConfirmCommand,
  formatOperationPlan,
  hasFlag,
  hashOperationContent,
  requireSecondTarget,
  requireTarget,
  result,
  withOperationPlan,
  type DomainActionHandler,
} from '../handler-utils.js';

const sourceSubjects = (content: string | null): string[] =>
  content === null
    ? ['source-state:missing']
    : [
        `source-content-sha256:${hashOperationContent(content)}`,
        `source-content-length:${content.length}`,
      ];

export const handleConfigPath: DomainActionHandler = async (_args, context) => {
  const filePath = await findConfigPathOrThrow(context.cwd);
  const payload = {
    schemaVersion: 1,
    status: 'ok',
    path: filePath,
  };

  return result(context, payload, `ZaoWu Config Path\n\n${filePath}`);
};

export const handleConfigShow: DomainActionHandler = async (_args, context) => {
  const resolved = await loadResolvedConfig(context.cwd);
  const payload = {
    schemaVersion: resolved.schemaVersion,
    status: 'ok',
    filePath: resolved.filePath,
    config: resolved.config,
  };
  const human = [
    'ZaoWu Config Show',
    '',
    `File: ${resolved.filePath}`,
    `Project: ${resolved.config.project.name}`,
    `AI provider: ${resolved.config.ai.provider ?? 'none'}`,
    `Default output: ${resolved.config.defaults.output}`,
    `Workspace: ${resolved.config.paths.workspace}`,
    `Cache: ${resolved.config.paths.cache}`,
  ].join('\n');

  return result(context, payload, human);
};

export const handleConfigValidate: DomainActionHandler = async (_args, context) => {
  const validation = await validateResolvedConfig(context.cwd);
  const human = [
    'ZaoWu Config Validate',
    '',
    `Status: ${validation.status}`,
    `File: ${validation.filePath}`,
    '',
    formatLabeledList('Warnings', validation.warnings),
  ].join('\n');

  return result(context, validation, human);
};

export const handleConfigGet: DomainActionHandler = async (args, context) => {
  const key = requireTarget(args, 'zw config get');
  const value = await getResolvedConfigValue(key, context.cwd);
  const human = [
    'ZaoWu Config Get',
    '',
    `File: ${value.filePath}`,
    `${value.key}: ${value.value ?? 'null'}`,
  ].join('\n');

  return result(context, value, human);
};

export const handleConfigSet: DomainActionHandler = async (args, context) => {
  const key = requireTarget(args, 'zw config set');
  const value = requireSecondTarget(args, 'zw config set', 'value');
  const isGlobal = hasFlag(context.parsed, '--global');
  // One options object for both the preview and the confirmed call: the
  // fingerprint the user confirms is computed from the preview, so the two
  // calls must be structurally unable to drift apart.
  const setOptions = { cwd: context.cwd, global: isGlobal };
  let inputContent: string | null = null;
  const preview = await setResolvedConfigValue(key, value, {
    ...setOptions,
    onInput: (content) => {
      inputContent = content;
    },
  });
  const operationPlan = createOperationPlan({
    risk: 'medium',
    confirmationRequired: !context.yes,
    subjects: [
      `config:${preview.key}`,
      `old-value:${JSON.stringify(preview.oldValue)}`,
      `new-value:${JSON.stringify(preview.newValue)}`,
      ...createContentOperationSubjects(preview.content),
      ...sourceSubjects(inputContent),
    ],
    reads: [preview.filePath],
    writes: [preview.filePath],
    notes: ['Config writes are previewed unless --yes is provided.'],
  });
  assertOperationPlanFingerprint(context, operationPlan);

  const updated = context.yes
    ? await setResolvedConfigValue(key, value, {
        ...setOptions,
        yes: true,
        expectedContent: preview.content,
        expectedInputContent: inputContent,
      })
    : preview;
  const human = [
    'ZaoWu Config Set',
    '',
    `Status: ${updated.status}`,
    `File: ${updated.filePath}`,
    `Key: ${updated.key}`,
    `Old: ${updated.oldValue ?? 'null'}`,
    `New: ${updated.newValue ?? 'null'}`,
    `Wrote file: ${updated.wroteFile ? 'yes' : 'no'}`,
    '',
    formatOperationPlan(operationPlan),
    '',
    updated.wroteFile ? 'Config updated.' : updated.content,
    ...(!updated.wroteFile
      ? [
          '',
          'To apply exactly this change, run:',
          `  ${formatConfirmCommand([
            'zw',
            'config',
            'set',
            ...(isGlobal ? ['--global'] : []),
            '--yes',
            '--plan-fingerprint',
            operationPlan.fingerprint,
            '--',
            key,
            value,
          ])}`,
        ]
      : []),
  ].join('\n');

  return result(context, withOperationPlan(updated, operationPlan), human);
};

export const handleConfigMigrate: DomainActionHandler = async (_args, context) => {
  const migrateOptions = { cwd: context.cwd };
  let inputContent: string | null = null;
  const preview = await migrateResolvedConfig({
    ...migrateOptions,
    onInput: (content) => {
      inputContent = content;
    },
  });
  const operationPlan = createOperationPlan({
    risk: 'medium',
    confirmationRequired: preview.changed && !context.yes,
    subjects: [
      `config:${preview.filePath}`,
      ...sourceSubjects(inputContent),
      ...(preview.changed ? createContentOperationSubjects(preview.content) : []),
    ],
    reads: [preview.filePath],
    writes: preview.changed ? [preview.filePath] : [],
    notes: ['Config migrations are previewed unless --yes is provided.'],
  });
  assertOperationPlanFingerprint(context, operationPlan);

  const migrated =
    context.yes && preview.changed
      ? await migrateResolvedConfig({
          ...migrateOptions,
          yes: true,
          expectedContent: preview.content,
          expectedInputContent: inputContent,
        })
      : preview;
  const human = [
    'ZaoWu Config Migrate',
    '',
    `Status: ${migrated.status}`,
    `File: ${migrated.filePath}`,
    `From: ${migrated.fromVersion ?? 'legacy'}`,
    `To: ${migrated.toVersion}`,
    `Changed: ${migrated.changed ? 'yes' : 'no'}`,
    `Wrote file: ${migrated.wroteFile ? 'yes' : 'no'}`,
    '',
    formatOperationPlan(operationPlan),
    '',
    migrated.wroteFile || !migrated.changed ? 'Migration complete.' : migrated.content,
    ...(migrated.changed && !migrated.wroteFile
      ? [
          '',
          'To apply exactly this migration, run:',
          `  ${formatConfirmCommand(['zw', 'config', 'migrate', '--yes', '--plan-fingerprint', operationPlan.fingerprint])}`,
        ]
      : []),
  ].join('\n');

  return result(context, withOperationPlan(migrated, operationPlan), human);
};
