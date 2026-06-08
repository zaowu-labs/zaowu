import { createCapabilityLedger, type DomainDefinition } from '@zaowu/core';
import { ZaoWuError } from '@zaowu/core';

export interface WebResponseLike {
  status: number;
  statusText: string;
  headers?: {
    forEach(callback: (value: string, key: string) => void): void;
  };
  text(): Promise<string>;
}

export type WebFetcher = (
  url: string,
  init?: {
    method?: string;
  }
) => Promise<WebResponseLike>;

export interface WebInspectResult {
  status: 'ok' | 'preview';
  url: string;
  statusCode?: number;
  statusText?: string;
  headers: Record<string, string>;
}

export interface WebFetchResult {
  status: 'ok' | 'preview';
  url: string;
  statusCode?: number;
  statusText?: string;
  body?: string;
  bodyLength?: number;
  bodyTruncated?: boolean;
  maxBodyLength?: number;
}

export const WEB_DOMAIN: DomainDefinition = {
  name: 'web',
  summary: 'Web workflows with explicit network access and target disclosure',
  capabilities: createCapabilityLedger({
    usesNetwork: true,
  }),
  commands: [
    {
      name: 'inspect',
      summary: 'Inspect a web target after explicit user request',
      status: 'available',
      sensitive: true,
    },
    {
      name: 'fetch',
      summary: 'Fetch web content with clear target disclosure',
      status: 'available',
      sensitive: true,
    },
  ],
};

const DEFAULT_MAX_BODY_LENGTH = 4000;

const normalizeMaxBodyLength = (value: number | undefined): number =>
  Number.isFinite(value) && value !== undefined && value >= 0
    ? Math.floor(value)
    : DEFAULT_MAX_BODY_LENGTH;

const assertWebUrl = (url: string): string => {
  try {
    const parsed = new URL(url);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('unsupported protocol');
    }

    return parsed.toString();
  } catch {
    throw new ZaoWuError({
      code: 'WEB_URL_INVALID',
      message: 'Web URL is invalid.',
      why: '`zw web` only accepts explicit http or https URLs.',
      fix: 'Run a command like `zw web inspect https://example.com --yes`.',
    });
  }
};

const getFetcher = (fetcher?: WebFetcher): WebFetcher => {
  if (fetcher) {
    return fetcher;
  }

  if (typeof globalThis.fetch !== 'function') {
    throw new ZaoWuError({
      code: 'WEB_FETCH_UNAVAILABLE',
      message: 'Web fetch is unavailable in this runtime.',
      why: 'The current Node.js runtime does not expose `fetch`.',
      fix: 'Use Node.js 20.19.0 or newer.',
    });
  }

  return globalThis.fetch as unknown as WebFetcher;
};

const requestWebTarget = async (
  url: string,
  method: string,
  fetcher: WebFetcher | undefined
): Promise<WebResponseLike> => {
  try {
    return await getFetcher(fetcher)(url, { method });
  } catch (error) {
    if (error instanceof ZaoWuError) {
      throw error;
    }

    throw new ZaoWuError({
      code: 'WEB_REQUEST_FAILED',
      message: 'Web request failed.',
      why: `ZaoWu tried to send a ${method} request to \`${url}\`, but the request failed before a usable response was available.`,
      fix: 'Check the URL, network connection, DNS, TLS, and proxy settings, then run the command again.',
    });
  }
};

export const inspectWebTarget = async (
  url: string,
  options: { yes?: boolean; fetcher?: WebFetcher } = {}
): Promise<WebInspectResult> => {
  const normalizedUrl = assertWebUrl(url);

  if (!options.yes) {
    return {
      status: 'preview',
      url: normalizedUrl,
      headers: {},
    };
  }

  const response = await requestWebTarget(normalizedUrl, 'HEAD', options.fetcher);
  const headers: Record<string, string> = {};

  response.headers?.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    status: 'ok',
    url: normalizedUrl,
    statusCode: response.status,
    statusText: response.statusText,
    headers,
  };
};

export const fetchWebTarget = async (
  url: string,
  options: { yes?: boolean; fetcher?: WebFetcher; maxBodyLength?: number } = {}
): Promise<WebFetchResult> => {
  const normalizedUrl = assertWebUrl(url);

  if (!options.yes) {
    return {
      status: 'preview',
      url: normalizedUrl,
    };
  }

  const response = await requestWebTarget(normalizedUrl, 'GET', options.fetcher);
  let body: string;

  try {
    body = await response.text();
  } catch {
    throw new ZaoWuError({
      code: 'WEB_REQUEST_FAILED',
      message: 'Web request failed.',
      why: `ZaoWu received a response from \`${normalizedUrl}\`, but could not read the response body.`,
      fix: 'Try `zw web inspect <url> --yes` first, then retry fetch or inspect the server response outside ZaoWu.',
    });
  }

  const maxBodyLength = normalizeMaxBodyLength(options.maxBodyLength);
  const bodyTruncated = body.length > maxBodyLength;

  return {
    status: 'ok',
    url: normalizedUrl,
    statusCode: response.status,
    statusText: response.statusText,
    body: body.slice(0, maxBodyLength),
    bodyLength: body.length,
    bodyTruncated,
    maxBodyLength,
  };
};
