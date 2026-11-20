#!/usr/bin/env node
import { runCli } from './run.js';

// A reader such as head may close while a confirmed command is still saving a file.
// Let the command finish and retain its exit status when the reader is gone.
const handlePipeError = (error: NodeJS.ErrnoException): void => {
  if (error.code !== 'EPIPE') throw error;
};

process.stdout.on('error', handlePipeError);
process.stderr.on('error', handlePipeError);
process.exitCode = await runCli(process.argv.slice(2));
