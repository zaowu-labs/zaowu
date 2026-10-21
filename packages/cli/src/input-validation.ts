import { ZaoWuError } from '@zaowu-labs/core';
import type { ParsedArgs } from './args.js';

/** Maximum target count; null means free-form text. Minimums stay domain-owned. */
export const COMMAND_TARGET_LIMITS: Readonly<Record<string, number | null>> = {
  init: 0,
  doctor: 0,
  'ai:ask': null,
  'ai:providers': 0,
  'auto:plan': 1,
  'auto:run': 1,
  'auto:validate': 1,
  'config:get': 1,
  'config:migrate': 0,
  'config:path': 0,
  'config:set': 2,
  'config:show': 0,
  'config:validate': 0,
  'data:analyze': 1,
  'data:clean': 1,
  'data:inspect': 1,
  'data:sample': 1,
  'data:schema': 1,
  'data:sheets': 1,
  'dev:commit': 0,
  'dev:review': 0,
  'dev:status': 0,
  'dev:sync': 0,
  'doc:convert': 1,
  'doc:extract': 1,
  'doc:outline': 1,
  'doc:search': 2,
  'doc:summary': 1,
  'plugin:install': 1,
  'plugin:list': 0,
  'plugin:remove': 1,
  'plugin:validate': 1,
  'teach:plan': null,
  'teach:quiz': null,
  'web:fetch': 1,
  'web:inspect': 1,
};

export const assertBooleanFlags = (parsed: ParsedArgs): void => {
  const option = parsed.assignedBooleans[0];
  if (!option) return;

  throw new ZaoWuError({
    code: 'OPTION_VALUE_INVALID',
    message: 'Boolean flags do not accept a value.',
    why: `The option ${option} is a flag; an assigned value cannot enable or disable it.`,
    fix: `Use ${option} without =value to enable it, or omit the flag. Use --dry-run to preview a sensitive action.`,
  });
};

export const assertTargetCount = (commandArgs: readonly string[]): void => {
  const [command, action] = commandArgs;
  const isRoot = command === 'init' || command === 'doctor';
  const key = isRoot ? command : `${command}:${action}`;
  const maximum = COMMAND_TARGET_LIMITS[key];
  const count = commandArgs.length - (isRoot ? 1 : 2);
  if (maximum === undefined || maximum === null || count <= maximum) return;

  const label = isRoot ? `zw ${command}` : `zw ${command} ${action}`;
  throw new ZaoWuError({
    code: 'ARGUMENT_UNEXPECTED',
    message: 'Unexpected positional argument.',
    why: `\`${label}\` accepts at most ${maximum} target argument(s), but received ${count}.`,
    fix: `Run \`${label} --help\` to check the expected targets and options. Quote text that belongs to one target.`,
  });
};
