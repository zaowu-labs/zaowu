import { describe, expect, it } from 'vitest';
import { fetchWebTarget, inspectWebTarget, WEB_DOMAIN, type WebFetcher } from './index';

describe('web domain', () => {
  it('declares web workflow commands', () => {
    expect(WEB_DOMAIN.name).toBe('web');
    expect(WEB_DOMAIN.commands.map((command) => command.name)).toEqual(['inspect', 'fetch']);
  });

  it('previews inspection without network access by default', async () => {
    await expect(inspectWebTarget('https://example.com')).resolves.toEqual({
      schemaVersion: 1,
      status: 'preview',
      url: 'https://example.com/',
      headers: {},
    });
  });

  it('rejects invalid or unsupported URLs before network access', async () => {
    await expect(inspectWebTarget('file:///tmp/report.html', { yes: true })).rejects.toThrow(
      'Web URL is invalid.'
    );
  });

  it('inspects a web target when confirmed', async () => {
    const fetcher: WebFetcher = async () => ({
      status: 200,
      statusText: 'OK',
      headers: {
        forEach(callback) {
          callback('text/html', 'content-type');
        },
      },
      async text() {
        return '';
      },
    });

    await expect(inspectWebTarget('https://example.com', { yes: true, fetcher })).resolves.toEqual({
      schemaVersion: 1,
      status: 'ok',
      url: 'https://example.com/',
      statusCode: 200,
      statusText: 'OK',
      headers: {
        'content-type': 'text/html',
      },
    });
  });

  it('fetches content when confirmed', async () => {
    const fetcher: WebFetcher = async () => ({
      status: 200,
      statusText: 'OK',
      async text() {
        return 'Hello from the web';
      },
    });

    await expect(
      fetchWebTarget('https://example.com', { yes: true, fetcher })
    ).resolves.toMatchObject({
      status: 'ok',
      body: 'Hello from the web',
      bodyLength: 18,
      bodyTruncated: false,
      maxBodyLength: 4000,
    });
  });

  it('bounds fetched bodies and reports truncation', async () => {
    const fetcher: WebFetcher = async () => ({
      status: 200,
      statusText: 'OK',
      async text() {
        return 'abcdef';
      },
    });

    await expect(
      fetchWebTarget('https://example.com', { yes: true, fetcher, maxBodyLength: 3 })
    ).resolves.toMatchObject({
      status: 'ok',
      body: 'abc',
      bodyLength: 6,
      bodyTruncated: true,
      maxBodyLength: 3,
    });
  });

  it('maps network failures to structured web errors', async () => {
    const fetcher: WebFetcher = async () => {
      throw new Error('connection refused');
    };

    await expect(
      inspectWebTarget('https://example.com', { yes: true, fetcher })
    ).rejects.toMatchObject({
      code: 'WEB_REQUEST_FAILED',
      message: 'Web request failed.',
      fix: 'Check the URL, network connection, DNS, TLS, and proxy settings, then run the command again.',
    });
  });

  it('times out confirmed web inspections', async () => {
    const fetcher: WebFetcher = async () => new Promise(() => {});

    await expect(
      inspectWebTarget('https://example.com', { yes: true, fetcher, timeoutMs: 1 })
    ).rejects.toMatchObject({
      code: 'WEB_REQUEST_FAILED',
      message: 'Web request failed.',
      why: 'ZaoWu tried to send a HEAD request to `https://example.com/`, but it did not complete within 1ms.',
    });
  });

  it('maps response body read failures to structured web errors', async () => {
    const fetcher: WebFetcher = async () => ({
      status: 200,
      statusText: 'OK',
      async text() {
        throw new Error('body stream failed');
      },
    });

    await expect(
      fetchWebTarget('https://example.com', { yes: true, fetcher })
    ).rejects.toMatchObject({
      code: 'WEB_REQUEST_FAILED',
      message: 'Web request failed.',
      fix: 'Try `zw web inspect <url> --yes` first, then retry fetch or inspect the server response outside ZaoWu.',
    });
  });

  it('times out response body reads', async () => {
    let aborted = false;
    const fetcher: WebFetcher = async (_url, init) => {
      init?.signal?.addEventListener('abort', () => {
        aborted = true;
      });

      return {
        status: 200,
        statusText: 'OK',
        async text() {
          return new Promise(() => {});
        },
      };
    };

    await expect(
      fetchWebTarget('https://example.com', { yes: true, fetcher, timeoutMs: 1 })
    ).rejects.toMatchObject({
      code: 'WEB_REQUEST_FAILED',
      message: 'Web request failed.',
      why: 'ZaoWu received a response from `https://example.com/`, but the response body was not readable within 1ms.',
    });
    expect(aborted).toBe(true);
  });
});
