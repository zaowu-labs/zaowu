import { describe, expect, it, vi } from 'vitest';
import { askAI, fetchWithRetry, type AIFetcher } from './index';

const request = { prompt: 'Review this', provider: 'ollama', allowNetwork: true };
const response = (payload: unknown) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: async () => payload,
});

describe('AI request boundaries', () => {
  it('distinguishes transport failures from timeouts while aborting the request', async () => {
    let signal: AbortSignal | undefined;
    await expect(
      fetchWithRetry(
        async (_url, init) => {
          signal = init.signal;
          throw new Error('connection refused');
        },
        'http://localhost.invalid',
        { method: 'POST', headers: {}, body: '{}' },
        'Test',
        100,
        1
      )
    ).rejects.toMatchObject({ why: 'The request failed before a response was received.' });
    expect(signal?.aborted).toBe(true);
  });
  it('disables redirects for requests carrying prompts and provider credentials', async () => {
    const fetcher = vi.fn<Parameters<AIFetcher>, ReturnType<AIFetcher>>(async () =>
      response({ response: 'done' })
    );
    await askAI({ ...request, fetcher });
    expect(fetcher.mock.calls[0][1].redirect).toBe('error');
  });

  it('bounds a stalled response body and aborts its request', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    try {
      const result = askAI({
        ...request,
        timeoutMs: 100,
        fetcher: async (_url, init) => {
          signal = init.signal;
          return { ...response(null), json: () => new Promise(() => {}) };
        },
      });
      const rejected = expect(result).rejects.toMatchObject({ code: 'AI_PROVIDER_REQUEST_FAILED' });
      await vi.advanceTimersByTimeAsync(101);
      await rejected;
      expect(signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds fetchers that ignore abort signals', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<Parameters<AIFetcher>, ReturnType<AIFetcher>>(
        () => new Promise(() => {})
      );
      const rejected = expect(askAI({ ...request, timeoutMs: 100, fetcher })).rejects.toMatchObject(
        { code: 'AI_PROVIDER_REQUEST_FAILED' }
      );
      await vi.advanceTimersByTimeAsync(3400);
      await rejected;
      expect(fetcher).toHaveBeenCalledTimes(3);
      expect(fetcher.mock.calls.every(([, init]) => init.signal?.aborted)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ['openai', { output: {} }],
    ['openai', { output: [null, { content: [null] }] }],
    ['anthropic', { content: {} }],
    ['anthropic', { content: [null] }],
    ['ollama', { response: '   ' }],
  ])('maps malformed %s payloads to stable provider errors', async (provider, payload) => {
    await expect(
      askAI({
        ...request,
        provider: provider as string,
        env: { OPENAI_API_KEY: 'test-key', ANTHROPIC_API_KEY: 'test-key' },
        fetcher: async () => response(payload),
      })
    ).rejects.toMatchObject({ code: 'AI_PROVIDER_RESPONSE_INVALID' });
  });
});
