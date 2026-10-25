import { ReadableStream } from 'node:stream/web';
import { readAIStream } from './stream';
import { describe, expect, it, vi } from 'vitest';
import { askAI } from './index';

describe('complete JSON model answers', () => {
  it.each([
    ['openai', { status: 'incomplete', output_text: 'partial' }],
    ['openai', { status: 'failed', output_text: 'partial' }],
    ['openai', { status: 'in_progress', output_text: 'partial' }],
    ['openai', { choices: [{ message: { content: 'partial' }, finish_reason: 'length' }] }],
    ['anthropic', { content: [{ type: 'text', text: 'partial' }], stop_reason: 'max_tokens' }],
    ['anthropic', { content: [{ type: 'text', text: 'partial' }], stop_reason: 'tool_use' }],
    ['ollama', { response: 'partial', done: false }],
    ['ollama', { response: 'partial', done: true, done_reason: 'length' }],
    ['ollama', { response: 'partial', error: 'private provider error' }],
  ])('rejects explicit incomplete %s JSON without retrying', async (provider, payload) => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => payload,
    }));
    await expect(
      askAI({
        prompt: 'Answer',
        provider: String(provider),
        allowNetwork: true,
        env: { OPENAI_API_KEY: 'fixture', ANTHROPIC_API_KEY: 'fixture' },
        fetcher,
      })
    ).rejects.toMatchObject({ code: 'AI_PROVIDER_RESPONSE_INVALID' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(['openai', 'anthropic', 'ollama'])(
    'accepts complete %s replies and compatible proxies without completion metadata',
    async (provider) => {
      const payload =
        provider === 'openai'
          ? { output_text: 'complete' }
          : provider === 'anthropic'
            ? { content: [{ type: 'text', text: 'complete' }] }
            : { response: 'complete' };
      const response = await askAI({
        prompt: 'Answer',
        provider,
        allowNetwork: true,
        env: { OPENAI_API_KEY: 'fixture', ANTHROPIC_API_KEY: 'fixture' },
        fetcher: async () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => payload,
        }),
      });
      expect(response.output).toBe('complete');
    }
  );
  it('reports Ollama JSON usage', async () => {
    const response = await askAI({
      prompt: 'Answer',
      provider: 'ollama',
      allowNetwork: true,
      fetcher: async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          response: 'complete',
          done: true,
          prompt_eval_count: 3,
          eval_count: 2,
        }),
      }),
    });
    expect(response.usage).toEqual({ inputTokens: 3, outputTokens: 2, totalTokens: 5 });
  });
  it.each([
    { input_tokens: 1.5, output_tokens: -1, total_tokens: Number.MAX_SAFE_INTEGER + 1 },
    { input_tokens: Number.MAX_SAFE_INTEGER, output_tokens: 1 },
  ])('omits invalid token counts and unsafe derived totals', async (usage) => {
    const response = await askAI({
      prompt: 'Answer',
      provider: 'openai',
      allowNetwork: true,
      env: { OPENAI_API_KEY: 'fixture' },
      fetcher: async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ output_text: 'complete', usage }),
      }),
    });
    expect(response.usage?.totalTokens).toBeUndefined();
    if (usage.input_tokens === 1.5) expect(response.usage).toBeNull();
  });
  it.each([
    [
      'openai',
      'data: {"type":"response.output_text.delta","delta":"partial"}\n\ndata: {"type":"response.completed","response":{"status":"completed","error":{"message":"private"}}}\n\n',
    ],
    [
      'anthropic',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"partial"}}\n\ndata: {"type":"message_stop"}\n\n',
    ],
    ['ollama', '{"response":"partial","done":true,"done_reason":"unknown"}\n'],
  ])('rejects contradictory or unfinished %s terminal streams', async (provider, text) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    });
    await expect(
      readAIStream(
        { ok: true, status: 200, statusText: 'OK', body, json: async () => null },
        provider,
        () => {}
      )
    ).rejects.toMatchObject({ code: 'AI_PROVIDER_RESPONSE_INVALID' });
  });
});
