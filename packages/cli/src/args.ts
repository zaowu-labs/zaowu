import { VALUE_OPTIONS } from './option-registry.js';

export interface ParsedArgs {
  positionals: string[];
  flags: ReadonlySet<string>;
  values: ReadonlyMap<string, string>;
  missingValues: readonly string[];
  options: ReadonlySet<string>;
}

const FLAGS_WITH_VALUES: ReadonlySet<string> = new Set(VALUE_OPTIONS);

export const parseArgs = (args: readonly string[]): ParsedArgs => {
  const positionals: string[] = [];
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const missingValues: string[] = [];
  const options = new Set<string>();

  let optionsEnded = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    // Standard end-of-options separator: everything after a bare `--` is a
    // positional, so targets that begin with dashes stay expressible.
    if (arg === '--' && !optionsEnded) {
      optionsEnded = true;
      continue;
    }

    if (optionsEnded || !arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    if (arg.includes('=')) {
      const eqIndex = arg.indexOf('=');
      const key = arg.slice(0, eqIndex);
      const val = arg.slice(eqIndex + 1);
      options.add(key);

      if (FLAGS_WITH_VALUES.has(key)) {
        if (val) {
          values.set(key, val);
        } else {
          missingValues.push(key);
        }
        continue;
      }

      flags.add(key);
      continue;
    }

    options.add(arg);

    if (FLAGS_WITH_VALUES.has(arg)) {
      if (args[index + 1] && !args[index + 1].startsWith('--')) {
        values.set(arg, args[index + 1]);
        index += 1;
      } else {
        missingValues.push(arg);
      }
      continue;
    }

    flags.add(arg);
  }

  return {
    positionals,
    flags,
    values,
    missingValues,
    options,
  };
};

export const hasFlag = (parsed: ParsedArgs, flag: string): boolean => parsed.flags.has(flag);

export const getValue = (parsed: ParsedArgs, name: string): string | undefined =>
  parsed.values.get(name);
