import type { Readable } from 'node:stream';

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  rawStdout?: true;
}

export interface CommandRunnerOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
}

export type CommandRunner = (
  command: string,
  args: readonly string[],
  options?: CommandRunnerOptions
) => string;

export interface CliExecutionOptions {
  cwd?: string;
  nodeVersion?: string;
  platform?: NodeJS.Platform;
  commandRunner?: CommandRunner;
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
  stdin?: Readable;
}
