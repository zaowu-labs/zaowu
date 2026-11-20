import type { Readable } from 'node:stream';
import { ZaoWuError } from '@zaowu-labs/core';
import { assertAIRequestActive, cancelledAIRequest } from './transport.js';

export const DEFAULT_MAX_INPUT_CHARACTERS = 200_000;

const stdinRequired = () =>
  new ZaoWuError({
    code: 'AI_INPUT_STDIN_REQUIRED',
    message: 'Standard input text is required.',
    why: '`--stdin` expects nonempty UTF-8 text from a pipe or redirected input.',
    fix: 'Pipe a command into `zw ai ask --stdin` or redirect a readable text file with `< input.txt`.',
  });

const invalidStdin = () =>
  new ZaoWuError({
    code: 'AI_INPUT_STDIN_READ_FAILED',
    message: 'Could not read standard input as UTF-8 text.',
    why: 'The stream failed or contained invalid UTF-8 or NUL bytes.',
    fix: 'Check the upstream command or redirect a UTF-8 text file.',
  });

const stdinTooLarge = (
  why = `Standard input exceeds ${DEFAULT_MAX_INPUT_CHARACTERS} characters.`
) =>
  new ZaoWuError({
    code: 'AI_INPUT_TOO_LARGE',
    message: 'Standard input is too large.',
    why,
    fix: 'Select a smaller excerpt from the upstream output and run the command again.',
  });

export const assertAIStdinText = (text: string): void => {
  if (text.length > DEFAULT_MAX_INPUT_CHARACTERS) throw stdinTooLarge();
  if (text.includes('\0')) throw invalidStdin();
  if (!text.trim()) throw stdinRequired();
};

/** Reads and consumes one input stream. Cancellation closes the stream. */
export const readAIStdin = async (input?: Readable, signal?: AbortSignal): Promise<string> => {
  assertAIRequestActive(signal);
  if (!input) throw stdinRequired();

  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const abort = () => input.destroy(cancelledAIRequest());
  signal?.addEventListener('abort', abort, { once: true });
  let byteCount = 0;
  const maxBytes = DEFAULT_MAX_INPUT_CHARACTERS * 4;
  let text = '';
  try {
    for await (const chunk of input) {
      const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      if (!(bytes instanceof Uint8Array)) throw invalidStdin();
      byteCount += bytes.byteLength;
      if (byteCount > maxBytes) throw stdinTooLarge(`Standard input exceeds ${maxBytes} bytes.`);
      if (bytes.includes(0)) throw invalidStdin();
      text += decoder.decode(bytes, { stream: true });
      if (text.length > DEFAULT_MAX_INPUT_CHARACTERS) throw stdinTooLarge();
    }
    assertAIRequestActive(signal);
    text += decoder.decode();
    assertAIStdinText(text);
    return text;
  } catch (error) {
    assertAIRequestActive(signal);
    if (error instanceof ZaoWuError) throw error;
    throw invalidStdin();
  } finally {
    signal?.removeEventListener('abort', abort);
  }
};
