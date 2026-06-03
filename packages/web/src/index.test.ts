import { describe, expect, it } from 'vitest';
import { fetchWebTarget, inspectWebTarget, WEB_DOMAIN, type WebFetcher } from './index';

describe('web domain', () => {
  it('declares web workflow commands', () => {
    expect(WEB_DOMAIN.name).toBe('web');
    expect(WEB_DOMAIN.commands.map((command) => command.name)).toEqual(['inspect', 'fetch']);
  });

  it('previews inspection without network access by default', async () => {
    await expect(inspectWebTarget('https://example.com')).resolves.toEqual({
      status: 'preview',
      url: 'https://example.com/',
      headers: {},
    });
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
    });
  });
});
