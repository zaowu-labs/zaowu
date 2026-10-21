export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
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
  commandRunner?: CommandRunner;
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
}
