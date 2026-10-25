import type { ReadableStream } from 'node:stream/web';
import { ZaoWuError } from '@zaowu-labs/core';
import type { AIFetchResponse, AIUsage } from './contracts.js';
import { assertCompletedAIResponse } from './completion.js';

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_EVENT_CHARACTERS = 1024 * 1024;
const MAX_OUTPUT_CHARACTERS = 2_000_000;

export const invalidAIStream = (why: string): ZaoWuError =>
  new ZaoWuError({
    code: 'AI_PROVIDER_RESPONSE_INVALID',
    message: 'AI provider response is invalid.',
    why,
    fix: 'Any partial output is incomplete. Retry or check the provider/proxy streaming settings; no automatic retry was made after output started.',
  });

const readerFor = (response: AIFetchResponse) => {
  const body = response.body as ReadableStream<Uint8Array> | undefined;
  if (!body || typeof body.getReader !== 'function')
    throw invalidAIStream('The provider did not return a readable response body.');
  return body.getReader();
};

const readChunks = async (
  response: AIFetchResponse,
  consume: (text: string) => boolean | void
): Promise<void> => {
  const reader = readerFor(response);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        consume(decoder.decode());
        return;
      }
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES)
        throw invalidAIStream('Provider response exceeds the 8 MiB response limit.');
      if (consume(decoder.decode(chunk.value, { stream: true })) === true) return;
    }
  } finally {
    // A terminal event may arrive before EOF. Close the body rather than waiting
    // forever for a server that keeps an already-completed connection open.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
};

const consumeResponse = async <T>(
  response: AIFetchResponse,
  operation: () => Promise<T>
): Promise<T> => {
  try {
    return await (response.consumeBody ? response.consumeBody(operation) : operation());
  } finally {
    response.dispose?.();
  }
};

export const readAIJson = async (response: AIFetchResponse): Promise<unknown> => {
  if (!response.body) return response.json();
  return consumeResponse(response, async () => {
    let text = '';
    await readChunks(response, (chunk) => {
      text += chunk;
    });
    return JSON.parse(text);
  });
};

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalidAIStream('A stream event was not a JSON object.');
  return value as Record<string, unknown>;
};
const tokenCount = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;

export const readAIStream = async (
  response: AIFetchResponse,
  provider: string,
  onChunk: (text: string) => void
): Promise<{ output: string; usage: AIUsage | null }> =>
  consumeResponse(response, async () => {
    const ndjson = provider === 'ollama';
    let output = '';
    let completed = false;
    let anthropicStopConfirmed = false;
    let buffer = '';
    let dataLines: string[] = [];
    let eventName = '';
    let eventCharacters = 0;
    let usage: AIUsage | null = null;
    const emit = (text: unknown): void => {
      if (typeof text !== 'string')
        throw invalidAIStream('A text delta was missing or had an invalid type.');
      if (output.length + text.length > MAX_OUTPUT_CHARACTERS)
        throw invalidAIStream('Generated text exceeds two million characters.');
      output += text;
      if (text) onChunk(text);
    };
    const updateUsage = (raw: unknown): void => {
      if (!raw || typeof raw !== 'object') return;
      const values = raw as Record<string, unknown>;
      const inputTokens = tokenCount(values.input_tokens);
      const outputTokens = tokenCount(values.output_tokens);
      if (inputTokens === undefined && outputTokens === undefined) return;
      usage = {
        ...usage,
        ...(inputTokens !== undefined ? { inputTokens } : {}),
        ...(outputTokens !== undefined ? { outputTokens } : {}),
      };
      if (usage.inputTokens !== undefined && usage.outputTokens !== undefined)
        usage.totalTokens = tokenCount(usage.inputTokens + usage.outputTokens);
    };
    const accept = (data: string, name = ''): void => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        throw invalidAIStream('The provider sent malformed JSON in a stream event.');
      }
      const event = record(parsed);
      if (ndjson) {
        if (event.error !== undefined && event.error !== null)
          throw invalidAIStream('Ollama reported an error inside the stream.');
        if (typeof event.done !== 'boolean' || typeof event.response !== 'string')
          throw invalidAIStream(
            'Ollama stream events must contain response text and a boolean done flag.'
          );
        emit(event.response);
        if (event.done) {
          assertCompletedAIResponse('ollama', event);
          completed = true;
          updateUsage({ input_tokens: event.prompt_eval_count, output_tokens: event.eval_count });
        }
        return;
      }
      if (typeof event.type !== 'string' || (name && name !== event.type))
        throw invalidAIStream('The provider sent a missing or inconsistent stream event type.');
      if (['error', 'response.failed', 'response.incomplete'].includes(event.type))
        throw invalidAIStream(
          'The provider reported an error or incomplete response inside the stream.'
        );
      if (provider === 'openai') {
        if (event.type === 'response.output_text.delta') emit(event.delta);
        if (event.type === 'response.completed') {
          const final = record(event.response);
          if (final.status !== 'completed')
            throw invalidAIStream('The final response was not completed.');
          assertCompletedAIResponse('openai', final);
          updateUsage(final.usage);
          completed = true;
        }
      } else {
        if (event.type === 'content_block_start') {
          const block = record(event.content_block);
          if (block.type === 'text' && block.text) emit(block.text);
        }
        if (event.type === 'content_block_delta') {
          const delta = record(event.delta);
          if (delta.type === 'text_delta') emit(delta.text);
        }
        if (event.type === 'message_start') updateUsage(record(event.message).usage);
        if (event.type === 'message_delta') {
          const delta = record(event.delta);
          if (delta.stop_reason !== undefined && delta.stop_reason !== null) {
            assertCompletedAIResponse('anthropic', delta);
            anthropicStopConfirmed = true;
          }
          updateUsage(event.usage);
        }
        if (event.type === 'message_stop') {
          if (!anthropicStopConfirmed)
            throw invalidAIStream('The stream ended without a completed text stop reason.');
          completed = true;
        }
      }
      // Unknown event types, pings, tool/thinking blocks are not generated text.
    };
    const line = (value: string): void => {
      if (ndjson) {
        if (value.trim()) accept(value);
        return;
      }
      if (!value) {
        if (dataLines.length) accept(dataLines.join('\n'), eventName);
        dataLines = [];
        eventName = '';
        eventCharacters = 0;
        return;
      }
      if (value.startsWith(':')) return;
      const colon = value.indexOf(':');
      const field = colon < 0 ? value : value.slice(0, colon);
      const content = colon < 0 ? '' : value.slice(colon + 1).replace(/^ /, '');
      if (field === 'data') {
        dataLines.push(content);
        eventCharacters += content.length + 1;
      }
      if (field === 'event') eventName = content;
      if (eventCharacters > MAX_EVENT_CHARACTERS)
        throw invalidAIStream('A streaming event exceeds the one MiB event limit.');
    };
    const drain = (flush = false): boolean => {
      while (!completed) {
        const match = /[\r\n]/.exec(buffer);
        if (!match || (!flush && match[0] === '\r' && match.index === buffer.length - 1)) break;
        const value = buffer.slice(0, match.index);
        const length = match[0] === '\r' && buffer[match.index + 1] === '\n' ? 2 : 1;
        buffer = buffer.slice(match.index + length);
        line(value);
      }
      if (buffer.length > MAX_EVENT_CHARACTERS && !completed)
        throw invalidAIStream('A streaming line exceeds the one MiB event limit.');
      return completed;
    };
    try {
      await readChunks(response, (text) => {
        buffer += text;
        return drain();
      });
      drain(true);
      if (ndjson && !completed && buffer.trim()) line(buffer);
      if (!completed) throw invalidAIStream('The stream ended without a completion event.');
      if (!output.trim())
        throw invalidAIStream('The completed stream did not contain text output.');
      return { output, usage };
    } catch (error) {
      if (error instanceof ZaoWuError) throw error;
      throw invalidAIStream('The streaming body could not be decoded or read completely.');
    }
  });
