import type { CliResult } from './types.js';

export const createResult = (exitCode: number, stdout = '', stderr = ''): CliResult => ({
  exitCode,
  stdout,
  stderr,
});

export const formatRows = (rows: readonly (readonly [string, string])[]): string => {
  const width = Math.max(...rows.map(([label]) => label.length));

  return rows.map(([label, summary]) => `  ${label.padEnd(width + 2)}${summary}`).join('\n');
};

export const stringifyJSON = (value: unknown): string => JSON.stringify(value);
