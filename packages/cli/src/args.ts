export interface ParsedArgs {
  positionals: string[];
  flags: ReadonlySet<string>;
  values: ReadonlyMap<string, string>;
}

const FLAGS_WITH_VALUES = new Set([
  '--file',
  '--format',
  '--model',
  '--output',
  '--provider',
  '--rows',
  '--source',
]);

export const parseArgs = (args: readonly string[]): ParsedArgs => {
  const positionals: string[] = [];
  const flags = new Set<string>();
  const values = new Map<string, string>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    if (FLAGS_WITH_VALUES.has(arg) && args[index + 1] && !args[index + 1].startsWith('--')) {
      values.set(arg, args[index + 1]);
      index += 1;
      continue;
    }

    flags.add(arg);
  }

  return {
    positionals,
    flags,
    values,
  };
};

export const hasFlag = (parsed: ParsedArgs, flag: string): boolean => parsed.flags.has(flag);

export const getValue = (parsed: ParsedArgs, name: string): string | undefined =>
  parsed.values.get(name);
