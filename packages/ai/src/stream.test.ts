import { createServer, type Server, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { askAI } from './index';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        })
    )
  );
});
const localServer = async (
  respond: (response: ServerResponse, body: Record<string, unknown>) => void
) => {
  let calls = 0;
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => {
      body += String(chunk);
    });
    request.on('end', () => {
      calls++;
      respond(response, JSON.parse(body));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No local server port');
  return { url: `http://127.0.0.1:${address.port}`, calls: () => calls };
};
const sse = (event: Record<string, unknown>) =>
  `event: ${event.type}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`;
const request = (url: string, provider = 'ollama') => ({
  prompt: 'Review this',
  provider,
  allowNetwork: true,
  timeoutMs: 1000,
  env: {
    OLLAMA_HOST: url,
    OPENAI_BASE_URL: url,
    ANTHROPIC_BASE_URL: url,
    OPENAI_API_KEY: 'fake-local-key',
    ANTHROPIC_API_KEY: 'fake-local-key',
  },
});

describe('provider streams against real local HTTP servers', () => {
  it.each(['ollama', 'openai', 'anthropic'])(
    'streams %s text, ignores metadata, and collects usage',
    async (provider) => {
      let sentBody: Record<string, unknown> = {};
      const server = await localServer((response, body) => {
        sentBody = body;
        response.setHeader(
          'Content-Type',
          provider === 'ollama' ? 'application/x-ndjson' : 'text/event-stream'
        );
        const events =
          provider === 'ollama'
            ? [
                JSON.stringify({ response: '你好 ', done: false }) + '\n',
                JSON.stringify({
                  response: 'world',
                  done: true,
                  prompt_eval_count: 7,
                  eval_count: 3,
                }),
              ]
            : provider === 'openai'
              ? [
                  ': heartbeat\r\n\r\n' +
                    sse({ type: 'response.created', response: {} }) +
                    sse({ type: 'response.output_text.delta', delta: '你好 ' }),
                  sse({ type: 'response.output_text.delta', delta: 'world' }) +
                    sse({
                      type: 'response.completed',
                      response: {
                        status: 'completed',
                        usage: { input_tokens: 7, output_tokens: 3 },
                      },
                    }),
                ]
              : [
                  sse({
                    type: 'message_start',
                    message: { usage: { input_tokens: 7, output_tokens: 0 } },
                  }) +
                    sse({ type: 'ping' }) +
                    sse({
                      type: 'content_block_delta',
                      delta: { type: 'text_delta', text: '你好 ' },
                    }),
                  sse({
                    type: 'content_block_delta',
                    delta: { type: 'thinking_delta', thinking: 'hidden' },
                  }) +
                    sse({
                      type: 'content_block_delta',
                      delta: { type: 'text_delta', text: 'world' },
                    }) +
                    sse({
                      type: 'message_delta',
                      delta: { stop_reason: 'end_turn' },
                      usage: { output_tokens: 3 },
                    }) +
                    sse({ type: 'message_stop' }),
                ];
        const bytes = Buffer.from(events.join(''));
        const split = bytes.indexOf(Buffer.from('你')) + 1;
        response.write(bytes.subarray(0, split));
        setTimeout(() => response.end(bytes.subarray(split)), 10);
      });
      const chunks: string[] = [];
      const result = await askAI({
        ...request(server.url, provider),
        onChunk: (chunk) => chunks.push(chunk),
      });
      expect(chunks).toEqual(['你好 ', 'world']);
      expect(result.output).toBe('你好 world');
      expect(result.usage).toEqual({ inputTokens: 7, outputTokens: 3, totalTokens: 10 });
      expect(sentBody.stream).toBe(true);
      expect(server.calls()).toBe(1);
    }
  );

  it('keeps requests without a callback non-streaming and bounds the JSON body', async () => {
    const server = await localServer((response, body) => {
      expect(body.stream).toBe(false);
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ response: 'complete JSON' }));
    });
    expect((await askAI(request(server.url))).output).toBe('complete JSON');
  });

  it.each([
    ['malformed', '{no json}\n'],
    ['unfinished', '{"response":"partial","done":false}\n'],
    ['wrong delta type', '{"response":42,"done":true}\n'],
    ['provider error', '{"error":"private provider body must stay hidden"}\n'],
    ['empty', '{"response":"","done":true}\n'],
    ['output limit', '{"response":"partial","done":true,"done_reason":"length"}\n'],
  ])('rejects %s streams without automatically resending partial output', async (_name, body) => {
    const server = await localServer((response) => {
      response.setHeader('Content-Type', 'application/x-ndjson');
      response.end(body);
    });
    const result = askAI({ ...request(server.url), onChunk: () => {} });
    await expect(result).rejects.toMatchObject({
      code: 'AI_PROVIDER_RESPONSE_INVALID',
      fix: expect.stringContaining('partial output is incomplete'),
    });
    expect(server.calls()).toBe(1);
  });

  it('rejects incomplete OpenAI and Anthropic completion reasons', async () => {
    for (const [provider, event] of [
      ['openai', { type: 'response.incomplete', response: { status: 'incomplete' } }],
      ['anthropic', { type: 'message_delta', delta: { stop_reason: 'max_tokens' } }],
    ] as const) {
      const server = await localServer((response) => {
        response.setHeader('Content-Type', 'text/event-stream');
        response.end(sse(event));
      });
      await expect(
        askAI({ ...request(server.url, provider), onChunk: () => {} })
      ).rejects.toMatchObject({ code: 'AI_PROVIDER_RESPONSE_INVALID' });
    }
  });

  it('times out a stalled stream after headers and partial text with no retry', async () => {
    const server = await localServer((response) => {
      response.setHeader('Content-Type', 'application/x-ndjson');
      response.write('{"response":"partial","done":false}\n');
    });
    const chunks: string[] = [];
    await expect(
      askAI({ ...request(server.url), timeoutMs: 80, onChunk: (chunk) => chunks.push(chunk) })
    ).rejects.toMatchObject({ code: 'AI_PROVIDER_REQUEST_FAILED' });
    expect(chunks).toEqual(['partial']);
    expect(server.calls()).toBe(1);
  });

  it('cancels active streaming and closes the body without retrying', async () => {
    const controller = new AbortController();
    const server = await localServer((response) => {
      response.setHeader('Content-Type', 'application/x-ndjson');
      response.write('{"response":"partial","done":false}\n');
    });
    await expect(
      askAI({
        ...request(server.url),
        signal: controller.signal,
        onChunk: () => controller.abort(),
      })
    ).rejects.toMatchObject({ code: 'AI_REQUEST_CANCELLED', exitCode: 130 });
    expect(server.calls()).toBe(1);
  });

  it('cancels a Retry-After wait immediately', async () => {
    const controller = new AbortController();
    const server = await localServer((response) => {
      response.writeHead(429, { 'Retry-After': '30' });
      response.end('{}');
      setTimeout(() => controller.abort(), 20);
    });
    await expect(
      askAI({ ...request(server.url), signal: controller.signal })
    ).rejects.toMatchObject({ code: 'AI_REQUEST_CANCELLED' });
    expect(server.calls()).toBe(1);
  });

  it('retries pre-output 429 responses, then streams once', async () => {
    let attempts = 0;
    const server = await localServer((response) => {
      if (++attempts < 3) {
        response.writeHead(429, { 'Retry-After': '0' });
        response.end('{}');
        return;
      }
      response.setHeader('Content-Type', 'application/x-ndjson');
      response.end('{"response":"once","done":true}\n');
    });
    const chunks: string[] = [];
    await askAI({ ...request(server.url), onChunk: (text) => chunks.push(text) });
    expect(chunks).toEqual(['once']);
    expect(server.calls()).toBe(3);
  });

  it('bounds the actual bytes of a complete JSON body', async () => {
    const server = await localServer((response) => {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ response: 'a'.repeat(8 * 1024 * 1024) }));
    });
    await expect(askAI(request(server.url))).rejects.toMatchObject({
      code: 'AI_PROVIDER_RESPONSE_INVALID',
      why: expect.stringContaining('8 MiB'),
    });
    expect(server.calls()).toBe(1);
  });

  it('cancels before response headers without retrying', async () => {
    const controller = new AbortController();
    const server = await localServer(() => {
      setTimeout(() => controller.abort(), 20);
    });
    await expect(
      askAI({ ...request(server.url), signal: controller.signal })
    ).rejects.toMatchObject({ code: 'AI_REQUEST_CANCELLED', exitCode: 130 });
    expect(server.calls()).toBe(1);
  });

  it('does not call a provider when already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn();
    await expect(
      askAI({ ...request('http://127.0.0.1:1'), signal: controller.signal, fetcher })
    ).rejects.toMatchObject({ code: 'AI_REQUEST_CANCELLED' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
