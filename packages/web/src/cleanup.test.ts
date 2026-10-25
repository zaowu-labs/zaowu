import { describe, expect, it } from 'vitest';
import { fetchWebTarget, inspectWebTarget } from './index';

describe('web response cleanup', () => {
  it('aborts the HEAD response after inspecting metadata', async () => {
    let signal: AbortSignal | undefined;
    await inspectWebTarget('https://example.invalid', {
      yes: true,
      fetcher: async (_url, init) => {
        signal = init?.signal;
        return { status: 200, statusText: 'OK', text: async () => '' };
      },
    });
    expect(signal?.aborted).toBe(true);
  });
  it('stops at an exact byte cap and does not wait for a hanging cancellation', async () => {
    let reads = 0;
    let aborted = false;
    const pending = fetchWebTarget('https://example.invalid', {
      yes: true,
      maxResponseBytes: 3,
      timeoutMs: 50,
      fetcher: async (_url, init) => {
        init?.signal?.addEventListener('abort', () => {
          aborted = true;
        });
        return {
          status: 200,
          statusText: 'OK',
          body: {
            getReader: () => ({
              read: async () => {
                reads++;
                if (reads === 1) return { done: false, value: new TextEncoder().encode('abc') };
                return new Promise(() => {});
              },
              cancel: () => new Promise(() => {}),
            }),
          },
          text: async () => '',
        };
      },
    });
    await expect(pending).resolves.toMatchObject({
      body: 'abc',
      responseBytesRead: 3,
      bodyLengthExact: false,
    });
    expect(reads).toBe(1);
    expect(aborted).toBe(true);
  });
  it('rejects embedded URL credentials without exposing them', async () => {
    const failure = inspectWebTarget('https://user:private-password@example.invalid');
    await expect(failure).rejects.toMatchObject({ code: 'WEB_URL_INVALID' });
    await expect(failure).rejects.not.toMatchObject({
      why: expect.stringContaining('private-password'),
    });
  });
});
