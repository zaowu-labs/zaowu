/**
 * Shared streaming utilities for AI providers.
 *
 * Eliminates duplicated buffer/line-split/parse logic across Ollama and
 * Anthropic providers by providing a common `streamResponseBody` helper.
 */

type StreamEventListener = (arg: unknown) => void;

interface StreamBody {
  getReader?: () => { read(): Promise<{ done: boolean; value?: Uint8Array }> };
  on?: (event: string, listener: StreamEventListener) => void;
}

/**
 * Extract text chunks from a line of streamed output.
 *
 * Providers supply a `parseLine` callback that returns the text for a given
 * line, or `undefined` if the line should be skipped.
 */
export interface StreamLineParser {
  (line: string): string | undefined;
}

/**
 * NDJSON line parser — used by Ollama.
 *
 * Each line is a JSON object with a `response` string field.
 */
export const parseNDJSONLine: StreamLineParser = (line: string): string | undefined => {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  try {
    const chunk = JSON.parse(trimmed);
    if (chunk.response) return chunk.response as string;
  } catch {
    // Ignore invalid lines
  }
  return undefined;
};

/**
 * SSE line parser — used by Anthropic.
 *
 * Lines follow the Server-Sent Events format (`data: {...}`).
 * Only `content_block_delta` events with `delta.text` are extracted.
 */
export const parseSSELine: StreamLineParser = (line: string): string | undefined => {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return undefined;
  const dataStr = trimmed.slice(5).trim();
  if (dataStr === '[DONE]') return undefined;
  try {
    const event = JSON.parse(dataStr);
    if (event.type === 'content_block_delta' && event.delta?.text) {
      return event.delta.text as string;
    }
  } catch {
    // Ignore invalid lines
  }
  return undefined;
};

/**
 * SSE line parser — used by OpenAI.
 *
 * Lines follow the Server-Sent Events format (`data: {...}`).
 * Chunks are extracted from choices[0].delta.content.
 */
export const parseOpenAISSELine: StreamLineParser = (line: string): string | undefined => {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return undefined;
  const dataStr = trimmed.slice(5).trim();
  if (dataStr === '[DONE]') return undefined;
  try {
    const event = JSON.parse(dataStr);
    if (event.choices?.[0]?.delta?.content) {
      return event.choices[0].delta.content as string;
    }
  } catch {
    // Ignore invalid lines
  }
  return undefined;
};

/**
 * Process remaining buffer content after the stream ends.
 */
const flushBuffer = (
  buffer: string,
  parseLine: StreamLineParser,
  onChunk: (text: string) => void
): string => {
  const text = parseLine(buffer);
  if (text) {
    onChunk(text);
    return text;
  }
  return '';
};

/**
 * Split a buffer into lines and process each complete line.
 * Returns the incomplete trailing portion.
 */
const processLines = (
  buffer: string,
  parseLine: StreamLineParser,
  onChunk: (text: string) => void
): { remaining: string; output: string } => {
  const lines = buffer.split('\n');
  const remaining = lines.pop() ?? '';
  let output = '';

  for (const line of lines) {
    const text = parseLine(line);
    if (text) {
      onChunk(text);
      output += text;
    }
  }

  return { remaining, output };
};

/**
 * Read a streaming response body and extract text chunks.
 *
 * Supports both the Web Streams API (`body.getReader()`) and
 * Node.js readable streams (`body.on('data' | 'end' | 'error')`).
 *
 * @returns The concatenated text output from all parsed chunks.
 */
export const streamResponseBody = async (
  body: unknown,
  parseLine: StreamLineParser,
  onChunk: (text: string) => void
): Promise<string> => {
  const streamBody = body as StreamBody;
  let output = '';

  if (typeof streamBody.getReader === 'function') {
    const reader = streamBody.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const result = processLines(buffer, parseLine, onChunk);
      buffer = result.remaining;
      output += result.output;
    }

    if (buffer.trim()) {
      output += flushBuffer(buffer, parseLine, onChunk);
    }
  } else if (typeof streamBody.on === 'function') {
    const bodyWithOn = streamBody as {
      on: (event: string, listener: StreamEventListener) => void;
    };
    await new Promise<void>((resolve, reject) => {
      let buffer = '';
      bodyWithOn.on('data', (chunk: unknown) => {
        buffer += String(chunk);
        const result = processLines(buffer, parseLine, onChunk);
        buffer = result.remaining;
        output += result.output;
      });
      bodyWithOn.on('end', () => {
        if (buffer.trim()) {
          output += flushBuffer(buffer, parseLine, onChunk);
        }
        resolve();
      });
      bodyWithOn.on('error', reject);
    });
  }

  return output;
};
