import { ZaoWuError } from '@zaowu-labs/core';
import { getValue, parseArgs, type ParsedArgs } from './args.js';

const COMMON_OPTIONS = ['--help', '--json', '--version'] as const;
const CONFIRMATION_OPTIONS = ['--dry-run', '--plan-fingerprint', '--yes'] as const;

const COMMAND_OPTIONS: Readonly<Record<string, readonly string[]>> = {
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

export const assertSupportedOptions = (
  parsed: ParsedArgs,
  commandArgs: readonly string[]
): void => {
  const [command, action] = commandArgs;

  if (!command) {
    return;
  }

  const commandKey = action ? `${command}:${action}` : command;
  const allowed = new Set(COMMAND_OPTIONS[commandKey] ?? COMMON_OPTIONS);
  const unsupported = [...parsed.options].filter((option) => !allowed.has(option));

  if (unsupported.length === 0) {
    return;
  }

  const optionList = unsupported.join(', ');
  const commandName = action ? `zw ${command} ${action}` : `zw ${command}`;

  throw new ZaoWuError({
    code: 'OPTION_UNSUPPORTED',
    message: 'Option is not supported by this command.',
    why:
      `The option${unsupported.length === 1 ? '' : 's'} ${optionList} ` +
      `cannot be used with \`${commandName}\`.`,
    fix: `Run \`${commandName} --help\` to see the supported options.`,
  });
};

export const assertNoMissingOptionValues = (options: readonly string[]): void => {
  if (options.length === 0) {
    return;
  }

  const optionList = options.join(', ');

  throw new ZaoWuError({
    code: 'OPTION_VALUE_REQUIRED',
    message: 'Option value is required.',
    why: `The option${options.length === 1 ? '' : 's'} ${optionList} must be followed by a value.`,
    fix: `Provide a value, for example \`${options[0]} value\`, or remove the option.`,
  });
};

const assertOptionValue = (
  option: string,
  value: string | undefined,
  isValid: (value: string) => boolean,
  expected: string
): void => {
  if (value === undefined || isValid(value)) {
    return;
  }

  throw new ZaoWuError({
    code: 'OPTION_VALUE_INVALID',
    message: 'Option value is invalid.',
    why: `The option ${option} received \`${value}\`, but expected ${expected}.`,
    fix: `Use ${option} with ${expected}, or remove the option.`,
  });
};

const isPositiveIntegerText = (value: string): boolean => /^[1-9]\d*$/.test(value);

export const assertValidOptionValues = (
  parsed: ReturnType<typeof parseArgs>,
  commandArgs: readonly string[]
): void => {
  assertOptionValue(
    '--plan-fingerprint',
    getValue(parsed, '--plan-fingerprint'),
    (value) => /^[a-f0-9]{64}$/i.test(value.trim()),
    'a 64-character hexadecimal fingerprint'
  );

  const format = getValue(parsed, '--format');
  const [domain, action] = commandArgs;

  if (domain === 'data' && action === 'sample') {
    assertOptionValue(
      '--rows',
      getValue(parsed, '--rows'),
      isPositiveIntegerText,
      'a positive integer'
    );
  }

  if (domain === 'doc' && action === 'convert') {
    assertOptionValue(
      '--format',
      format,
      (value) => value === 'markdown' || value === 'text',
      '`markdown` or `text`'
    );
  }

  if (domain === 'teach' && action === 'quiz') {
    assertOptionValue(
      '--count',
      getValue(parsed, '--count'),
      (value) => isPositiveIntegerText(value) && Number(value) <= 20,
      'a whole number between 1 and 20'
    );
    assertOptionValue(
      '--format',
      format,
      (value) => value === 'text' || value === 'canvas-csv',
      '`text` or `canvas-csv`'
    );
  }
};
