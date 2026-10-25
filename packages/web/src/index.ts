import { createCapabilityLedger, ZaoWuError, type DomainDefinition } from '@zaowu-labs/core';

export interface WebResponseLike {
  status: number;
  statusText: string;
  headers?: {
    forEach(callback: (value: string, key: string) => void): void;
  };
  body?: {
    getReader(): {
      read(): Promise<{ done: boolean; value?: Uint8Array }>;
      cancel?(): Promise<void> | void;
      releaseLock?(): void;
    };
  } | null;
  text(): Promise<string>;
}

export type WebFetcher = (
  url: string,
  init?: {
    method?: string;
    signal?: AbortSignal;
    redirect?: 'manual';
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
  bodyLengthExact?: boolean;
  bodyTruncated?: boolean;
  maxBodyLength?: number;
  responseBytesRead?: number;
  maxResponseBytes?: number;
}

interface WebRequestContext {
  response: WebResponseLike;
  deadline: number;
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
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

class WebRequestTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super('Web request timed out.');
  }
}

const WEB_REQUEST_RETRY_FIX =
  'Check the URL, network connection, DNS, TLS, and proxy settings, then run the command again.';

const webRequestFailedError = (why: string, fix: string = WEB_REQUEST_RETRY_FIX): ZaoWuError =>
  new ZaoWuError({
    code: 'WEB_REQUEST_FAILED',
    message: 'Web request failed.',
    why,
    fix,
  });

const normalizeNumericOption = (
  value: number | undefined,
  fallback: number,
  options: { allowZero?: boolean } = {}
): number =>
  Number.isFinite(value) && value !== undefined && (options.allowZero ? value >= 0 : value > 0)
    ? Math.floor(value)
    : fallback;

const normalizeMaxBodyLength = (value: number | undefined): number =>
  normalizeNumericOption(value, DEFAULT_MAX_BODY_LENGTH, { allowZero: true });

const normalizeTimeoutMs = (value: number | undefined): number =>
  normalizeNumericOption(value, DEFAULT_REQUEST_TIMEOUT_MS);

const normalizeMaxResponseBytes = (value: number | undefined): number =>
  normalizeNumericOption(value, DEFAULT_MAX_RESPONSE_BYTES);

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

const webUrlInvalidError = (): ZaoWuError =>
  new ZaoWuError({
    code: 'WEB_URL_INVALID',
    message: 'Web URL is invalid.',
    why: '`zw web` accepts http or https URLs without embedded usernames/passwords.',
    fix: 'Run a command like `zw web inspect https://example.com --yes`.',
  });

const assertWebUrl = (url: string): string => {
  let targetUrl = url.trim();

  if (!/^[a-z0-9+.-]+:\/\//i.test(targetUrl)) {
    if (targetUrl.includes('.') || targetUrl.includes(':')) {
      targetUrl = `https://${targetUrl}`;
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw webUrlInvalidError();
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw webUrlInvalidError();
  }

  return parsed.toString();
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
  const deadline = Date.now() + timeoutMs;

  try {
    const response = await withTimeout(
      getFetcher(fetcher)(url, { method, signal: controller.signal, redirect: 'manual' }),
      timeoutMs
    );

    return {
      response,
      deadline,
      abort() {
        controller.abort();
      },
    };
  } catch (error) {
    controller.abort();
    if (error instanceof ZaoWuError) {
      throw error;
    }

    if (error instanceof WebRequestTimeoutError) {
      controller.abort();

      throw webRequestFailedError(
        `ZaoWu tried to send a ${method} request to \`${url}\`, but it did not complete within ${error.timeoutMs}ms.`
      );
    }

    throw webRequestFailedError(
      `ZaoWu tried to send a ${method} request to \`${url}\`, but the request failed before a usable response was available.`
    );
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

  const request = await requestWebTarget(normalizedUrl, 'HEAD', options.fetcher, timeoutMs);
  try {
    const { response } = request;
    const headers: Record<string, string> = {};
    response.headers?.forEach((value, key) => {
      Object.defineProperty(headers, key, { value, enumerable: true, configurable: true });
    });
    return {
      schemaVersion: 1,
      status: 'ok',
      url: normalizedUrl,
      statusCode: response.status,
      statusText: response.statusText,
      headers,
    };
  } finally {
    request.abort();
  }
};

/**
 * Text decoder honoring the response `Content-Type` charset. Unknown or
 * missing charsets fall back to UTF-8 so decoding never fails outright.
 */
const createResponseTextDecoder = (response: WebResponseLike): InstanceType<typeof TextDecoder> => {
  let contentType: string | undefined;

  response.headers?.forEach((value, key) => {
    if (key.toLowerCase() === 'content-type') {
      contentType = value;
    }
  });

  const charset = /charset=["']?([^;"'\s]+)/i.exec(contentType ?? '')?.[1];

  if (charset) {
    try {
      return new TextDecoder(charset);
    } catch {
      // Unrecognized charset label — fall through to UTF-8.
    }
  }

  return new TextDecoder();
};

export const fetchWebTarget = async (
  url: string,
  options: {
    yes?: boolean;
    fetcher?: WebFetcher;
    maxBodyLength?: number;
    maxResponseBytes?: number;
    timeoutMs?: number;
  } = {}
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
  const maxBodyLength = normalizeMaxBodyLength(options.maxBodyLength);
  const maxResponseBytes = normalizeMaxResponseBytes(options.maxResponseBytes);
  let body: string;
  let bodyLength: number;
  let bodyLengthExact = true;
  let responseBytesRead: number;
  let reader: ReturnType<NonNullable<WebResponseLike['body']>['getReader']> | undefined;

  try {
    if (response.body) {
      reader = response.body.getReader();
      const decoder = createResponseTextDecoder(response);
      const bodyDeadline = request.deadline;
      let preview = '';
      let observedCharacters = 0;
      let observedBytes = 0;

      while (true) {
        const remainingMs = bodyDeadline - Date.now();

        if (remainingMs <= 0) {
          throw new WebRequestTimeoutError(timeoutMs);
        }

        const chunk = await withTimeout(reader.read(), remainingMs);

        if (chunk.done) {
          const finalText = decoder.decode();
          observedCharacters += finalText.length;
          preview += finalText.slice(0, Math.max(0, maxBodyLength - preview.length));
          break;
        }

        const value = chunk.value ?? new Uint8Array();
        const remainingBytes = maxResponseBytes - observedBytes;
        const accepted = value.subarray(0, Math.max(0, remainingBytes));
        observedBytes += accepted.byteLength;
        const text = decoder.decode(accepted, { stream: true });
        observedCharacters += text.length;
        preview += text.slice(0, Math.max(0, maxBodyLength - preview.length));

        if (accepted.byteLength < value.byteLength || observedBytes >= maxResponseBytes) {
          bodyLengthExact = false;
          // Flush the streaming decoder so a trailing partial multibyte
          // character it is still holding is not silently dropped, matching
          // the clean end-of-stream path above.
          const flushed = decoder.decode();
          observedCharacters += flushed.length;
          preview += flushed.slice(0, Math.max(0, maxBodyLength - preview.length));
          break;
        }
      }

      body = preview;
      bodyLength = observedCharacters;
      responseBytesRead = observedBytes;
    } else {
      const remainingMs = request.deadline - Date.now();
      if (remainingMs <= 0) throw new WebRequestTimeoutError(timeoutMs);
      const fullBody = await withTimeout(response.text(), remainingMs);
      body = fullBody.slice(0, maxBodyLength);
      bodyLength = fullBody.length;
      responseBytesRead = Buffer.byteLength(fullBody, 'utf8');
    }
  } catch (error) {
    request.abort();

    const bodyFix =
      'Try `zw web inspect <url> --yes` first, then retry fetch or inspect the server response outside ZaoWu.';

    if (error instanceof WebRequestTimeoutError) {
      throw webRequestFailedError(
        `ZaoWu received a response from \`${normalizedUrl}\`, but the response body was not readable within ${error.timeoutMs}ms.`,
        bodyFix
      );
    }

    throw webRequestFailedError(
      `ZaoWu received a response from \`${normalizedUrl}\`, but could not read the response body.`,
      bodyFix
    );
  } finally {
    request.abort();
    try {
      void Promise.resolve(reader?.cancel?.()).catch(() => {});
    } catch {
      /* Cleanup must not mask the result. */
    }
    try {
      reader?.releaseLock?.();
    } catch {
      /* A pending custom reader may reject release. */
    }
  }

  const bodyTruncated = !bodyLengthExact || bodyLength > maxBodyLength;

  return {
    schemaVersion: 1,
    status: 'ok',
    url: normalizedUrl,
    statusCode: response.status,
    statusText: response.statusText,
    body,
    bodyLength,
    bodyLengthExact,
    bodyTruncated,
    maxBodyLength,
    responseBytesRead,
    maxResponseBytes,
  };
};
