/**
 * Single source of truth for CLI options.
 *
 * Every option is declared exactly once as either value-taking or boolean.
 * `args.ts` derives its parser behavior from VALUE_OPTIONS, and
 * `option-validation.ts` builds per-command allowlists from COMMAND_OPTIONS,
 * so a new option cannot end up value-taking in one layer and boolean in the
 * other. A contract test asserts the registry stays internally consistent.
 */

/** Options that must be followed by a value (`--option value` or `--option=value`). */
export const VALUE_OPTIONS = [
  '--count',
  '--file',
  '--format',
  '--model',
  '--output',
  '--plan-fingerprint',
  '--provider',
  '--rows',
  '--sheet',
  '--source',
] as const;

/** Options that are plain flags and never consume a following value. */
export const BOOLEAN_OPTIONS = [
  '--ai',
  '--discard-local',
  '--dry-run',
  '--global',
  '--help',
  '--json',
  '--staged',
  '--version',
  '--worktree',
  '--yes',
] as const;

export const COMMON_OPTIONS = ['--help', '--json', '--version'] as const;
export const CONFIRMATION_OPTIONS = ['--dry-run', '--plan-fingerprint', '--yes'] as const;

export const COMMAND_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  init: [...COMMON_OPTIONS, ...CONFIRMATION_OPTIONS],
  doctor: COMMON_OPTIONS,
  'ai:ask': [...COMMON_OPTIONS, ...CONFIRMATION_OPTIONS, '--file', '--model', '--provider'],
  'ai:providers': [...COMMON_OPTIONS, '--provider'],
  'auto:plan': COMMON_OPTIONS,
  'auto:run': [...COMMON_OPTIONS, ...CONFIRMATION_OPTIONS],
  'auto:validate': COMMON_OPTIONS,
  'config:get': COMMON_OPTIONS,
  'config:migrate': [...COMMON_OPTIONS, ...CONFIRMATION_OPTIONS],
  'config:path': COMMON_OPTIONS,
  'config:set': [...COMMON_OPTIONS, ...CONFIRMATION_OPTIONS, '--global'],
  'config:show': COMMON_OPTIONS,
  'config:validate': COMMON_OPTIONS,
  'data:analyze': [...COMMON_OPTIONS, '--sheet'],
  'data:clean': [...COMMON_OPTIONS, ...CONFIRMATION_OPTIONS, '--output', '--sheet'],
  'data:inspect': [...COMMON_OPTIONS, '--sheet'],
  'data:sample': [...COMMON_OPTIONS, '--rows', '--sheet'],
  'data:schema': [...COMMON_OPTIONS, '--sheet'],
  'data:sheets': COMMON_OPTIONS,
  'dev:commit': [...COMMON_OPTIONS, ...CONFIRMATION_OPTIONS, '--ai', '--model', '--provider'],
  'dev:review': [
    ...COMMON_OPTIONS,
    ...CONFIRMATION_OPTIONS,
    '--ai',
    '--model',
    '--provider',
    '--staged',
    '--worktree',
  ],
  'dev:status': COMMON_OPTIONS,
  'dev:sync': [...COMMON_OPTIONS, ...CONFIRMATION_OPTIONS, '--discard-local'],
  'doc:convert': [...COMMON_OPTIONS, ...CONFIRMATION_OPTIONS, '--format', '--output'],
  'doc:extract': COMMON_OPTIONS,
  'doc:outline': COMMON_OPTIONS,
  'doc:search': COMMON_OPTIONS,
  'doc:summary': COMMON_OPTIONS,
  'plugin:install': [...COMMON_OPTIONS, ...CONFIRMATION_OPTIONS, '--source'],
  'plugin:list': COMMON_OPTIONS,
  'plugin:remove': [...COMMON_OPTIONS, ...CONFIRMATION_OPTIONS],
  'plugin:validate': COMMON_OPTIONS,
  'teach:plan': COMMON_OPTIONS,
  'teach:quiz': [...COMMON_OPTIONS, '--count', '--format'],
  'web:fetch': [...COMMON_OPTIONS, ...CONFIRMATION_OPTIONS],
  'web:inspect': [...COMMON_OPTIONS, ...CONFIRMATION_OPTIONS],
};
