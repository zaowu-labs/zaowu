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
    signal?: AbortSignal;
  }
) => Promise<WebResponseLike>;

export interface WebInspectResult {
  schemaVersion: 1;
  status: 'ok' | 'preview';
  url: string;
  statusCode?: number;
  statusText?: string;
  headers: Record<string, string>;
}

export interface WebFetchResult {
  schemaVersion: 1;
  status: 'ok' | 'preview';
  url: string;
  statusCode?: number;
  statusText?: string;
  body?: string;
  bodyLength?: number;
  bodyTruncated?: boolean;
  maxBodyLength?: number;
}

interface WebRequestContext {
  response: WebResponseLike;
  abort(): void;
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
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

class WebRequestTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super('Web request timed out.');
  }
}

const normalizeMaxBodyLength = (value: number | undefined): number =>
  Number.isFinite(value) && value !== undefined && value >= 0
    ? Math.floor(value)
    : DEFAULT_MAX_BODY_LENGTH;

const normalizeTimeoutMs = (value: number | undefined): number =>
  Number.isFinite(value) && value !== undefined && value > 0
    ? Math.floor(value)
    : DEFAULT_REQUEST_TIMEOUT_MS;

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new WebRequestTimeoutError(timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

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
  fetcher: WebFetcher | undefined,
  timeoutMs: number
): Promise<WebRequestContext> => {
  const controller = new AbortController();

  try {
    const response = await withTimeout(
      getFetcher(fetcher)(url, { method, signal: controller.signal }),
      timeoutMs
    );

    return {
      response,
      abort() {
        controller.abort();
      },
    };
  } catch (error) {
    if (error instanceof ZaoWuError) {
      throw error;
    }

    if (error instanceof WebRequestTimeoutError) {
      controller.abort();

      throw new ZaoWuError({
        code: 'WEB_REQUEST_FAILED',
        message: 'Web request failed.',
        why: `ZaoWu tried to send a ${method} request to \`${url}\`, but it did not complete within ${error.timeoutMs}ms.`,
        fix: 'Check the URL, network connection, DNS, TLS, and proxy settings, then run the command again.',
      });
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
  options: { yes?: boolean; fetcher?: WebFetcher; timeoutMs?: number } = {}
): Promise<WebInspectResult> => {
  const normalizedUrl = assertWebUrl(url);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);

  if (!options.yes) {
    return {
      schemaVersion: 1,
      status: 'preview',
      url: normalizedUrl,
      headers: {},
    };
  }

  const { response } = await requestWebTarget(normalizedUrl, 'HEAD', options.fetcher, timeoutMs);
  const headers: Record<string, string> = {};

  response.headers?.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    schemaVersion: 1,
    status: 'ok',
    url: normalizedUrl,
    statusCode: response.status,
    statusText: response.statusText,
    headers,
  };
};

export const fetchWebTarget = async (
  url: string,
  options: { yes?: boolean; fetcher?: WebFetcher; maxBodyLength?: number; timeoutMs?: number } = {}
): Promise<WebFetchResult> => {
  const normalizedUrl = assertWebUrl(url);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);

  if (!options.yes) {
    return {
      schemaVersion: 1,
      status: 'preview',
      url: normalizedUrl,
    };
  }

  const request = await requestWebTarget(normalizedUrl, 'GET', options.fetcher, timeoutMs);
  const response = request.response;
  let body: string;

  try {
    body = await withTimeout(response.text(), timeoutMs);
  } catch (error) {
    request.abort();

    if (error instanceof WebRequestTimeoutError) {
      throw new ZaoWuError({
        code: 'WEB_REQUEST_FAILED',
        message: 'Web request failed.',
        why: `ZaoWu received a response from \`${normalizedUrl}\`, but the response body was not readable within ${error.timeoutMs}ms.`,
        fix: 'Try `zw web inspect <url> --yes` first, then retry fetch or inspect the server response outside ZaoWu.',
      });
    }

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
    schemaVersion: 1,
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
