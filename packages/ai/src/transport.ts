import { ZaoWuError } from '@zaowu-labs/core';
import type { AIFetcher, AIFetchResponse, AIProviderFailure } from './contracts.js';

// Upper bound on any retry sleep. Retry-After is server-controlled input, so
// without a cap a hostile or misconfigured endpoint could stall the CLI for
// hours with a single header.
const MAX_RETRY_WAIT_MS = 30_000;

const MAX_PROVIDER_STATUS_TEXT_CHARACTERS = 80;

const sanitizeProviderStatusText = (statusText: string): string => {
  const normalized = statusText
    .split('')
    .map((character) =>
      character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? ' ' : character
    )
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length <= MAX_PROVIDER_STATUS_TEXT_CHARACTERS) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_PROVIDER_STATUS_TEXT_CHARACTERS).trimEnd()}...`;
};

const createProviderSafeSummary = (
  providerName: string,
  status: number,
  statusText: string
): string => {
  const safeStatusText = sanitizeProviderStatusText(statusText);
  const statusSummary = safeStatusText ? `HTTP ${status} ${safeStatusText}` : `HTTP ${status}`;
  const punctuation = statusSummary.endsWith('.') ? '' : '.';

  return `${providerName} returned ${statusSummary}${punctuation}`;
};

export const parseRetryAfterHeaderMs = (value: string | null | undefined): number | undefined => {
  const normalized = value?.trim();

  if (!normalized) {
    return undefined;
  }

  const seconds = Number(normalized);

  if (Number.isFinite(seconds) && seconds >= 0) {
    const milliseconds = Math.round(seconds * 1000);
    return Number.isFinite(milliseconds) ? milliseconds : undefined;
  }

  const date = Date.parse(normalized);

  if (Number.isNaN(date)) {
    return undefined;
  }

  return Math.max(0, date - Date.now());
};

const appendRetryDelay = (fix: string, retryAfterMs: number | undefined): string =>
  retryAfterMs === undefined ? fix : `${fix} Wait at least ${retryAfterMs}ms before retrying.`;

export const classifyAIProviderHttpFailure = (
  providerName: string,
  status: number,
  statusText: string,
  retryAfterMs?: number
): AIProviderFailure => {
  const safeSummary = createProviderSafeSummary(providerName, status, statusText);

  if (status === 401 || status === 403) {
    return {
      kind: 'auth',
      retryable: false,
      safeSummary,
      why: `${safeSummary} Credentials or model access are not accepted.`,
      fix: 'Check the provider API key, model access, and environment variables before retrying.',
    };
  }

  if (status === 429) {
    return {
      kind: 'rate-limit',
      retryable: true,
      safeSummary,
      retryAfterMs,
      why: `${safeSummary} The request was rate-limited.`,
      fix: appendRetryDelay('Retry later or reduce request frequency/input size.', retryAfterMs),
    };
  }

  if (status === 408) {
    return {
      kind: 'timeout',
      retryable: true,
      safeSummary,
      retryAfterMs,
      why: `${safeSummary} The provider timed out before completing the request.`,
      fix: appendRetryDelay(
        'Retry later, reduce input size, or increase the timeout if the request is expected to take longer.',
        retryAfterMs
      ),
    };
  }

  if (status >= 500) {
    return {
      kind: 'server',
      retryable: true,
      safeSummary,
      retryAfterMs,
      why: `${safeSummary} The provider did not complete the request.`,
      fix: appendRetryDelay('Check provider status and retry later.', retryAfterMs),
    };
  }

  if (status === 404) {
    return {
      kind: 'bad-request',
      retryable: false,
      safeSummary,
      why: `${safeSummary} The endpoint or requested model was not found.`,
      fix: providerName.startsWith('Ollama')
        ? 'Check OLLAMA_HOST and --model. Run `ollama list`, then `ollama pull <model>` if the chosen model is not installed.'
        : 'Check the configured base URL and choose an available model with --model or the provider model environment variable.',
    };
  }

  if (status >= 400) {
    return {
      kind: 'bad-request',
      retryable: false,
      safeSummary,
      why: `${safeSummary} The request was rejected.`,
      fix: 'Check the model, input size, and provider request settings before retrying.',
    };
  }

  return {
    kind: 'unknown',
    retryable: false,
    safeSummary,
    why: safeSummary,
    fix: 'Check provider status, credentials, model settings, and network access.',
  };
};

export const cancelledAIRequest = (): ZaoWuError =>
  new ZaoWuError({
    code: 'AI_REQUEST_CANCELLED',
    message: 'AI request cancelled.',
    why: 'The caller stopped the request. Any partial output is incomplete.',
    fix: 'Run the command again when ready. No automatic retry was made after cancellation.',
    exitCode: 130,
  });

export const assertAIRequestActive = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw cancelledAIRequest();
};

const bounded = async <T>(
  operation: Promise<T>,
  controller: AbortController,
  timeoutMs: number,
  providerName: string
): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(controller.signal.reason);
        if (controller.signal.aborted) {
          onAbort();
          return;
        }
        controller.signal.addEventListener('abort', onAbort, { once: true });
        timeout = setTimeout(
          () =>
            controller.abort(
              new ZaoWuError({
                code: 'AI_PROVIDER_REQUEST_FAILED',
                message: 'AI provider request failed.',
                why: `${providerName} did not complete the response within the request timeout.`,
                fix: 'Check provider status or increase the request timeout before retrying.',
              })
            ),
          Math.max(0, timeoutMs)
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    if (onAbort) controller.signal.removeEventListener('abort', onAbort);
  }
};

const waitForRetry = async (ms: number, signal?: AbortSignal): Promise<void> => {
  assertAIRequestActive(signal);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      cancel = () => reject(cancelledAIRequest());
      signal?.addEventListener('abort', cancel, { once: true });
      timeout = setTimeout(resolve, ms);
    });
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    if (cancel) signal?.removeEventListener('abort', cancel);
  }
};

export async function fetchWithRetry(
  fetcher: AIFetcher,
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
  providerName: string,
  timeoutMs: number,
  maxRetries = 3
): Promise<AIFetchResponse> {
  if (
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0 ||
    !Number.isInteger(maxRetries) ||
    maxRetries < 1
  ) {
    throw new ZaoWuError({
      code: 'AI_PROVIDER_REQUEST_FAILED',
      message: 'AI request limits are invalid.',
      why: 'Timeout must be a positive finite number and attempts must be a positive integer.',
      fix: 'Provide valid timeout and retry limits.',
    });
  }
  let delay = 1000;
  for (let attempt = 1; ; attempt++) {
    assertAIRequestActive(init.signal);
    const controller = new AbortController();
    const cancel = () => controller.abort(cancelledAIRequest());
    init.signal?.addEventListener('abort', cancel, { once: true });
    const dispose = () => {
      init.signal?.removeEventListener('abort', cancel);
      controller.abort();
    };
    const deadline = Date.now() + timeoutMs;
    let response: AIFetchResponse;
    try {
      response = await bounded(
        fetcher(url, { ...init, signal: controller.signal, redirect: 'error' }),
        controller,
        timeoutMs,
        providerName
      );
    } catch {
      const timedOut = controller.signal.aborted;
      dispose();
      assertAIRequestActive(init.signal);
      if (attempt >= maxRetries) {
        throw new ZaoWuError({
          code: 'AI_PROVIDER_REQUEST_FAILED',
          message: 'AI provider request failed.',
          why: timedOut
            ? `${providerName} did not respond within ${timeoutMs}ms.`
            : 'The request failed before a response was received.',
          fix: 'Check network access, provider status, and timeout settings, then try again.',
        });
      }
      await waitForRetry(Math.min(delay, MAX_RETRY_WAIT_MS), init.signal);
      delay *= 2;
      continue;
    }
    if (response.ok) {
      const consumeBody = async <T>(operation: () => Promise<T>): Promise<T> => {
        try {
          return await bounded(operation(), controller, deadline - Date.now(), providerName);
        } finally {
          dispose();
        }
      };
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        body: response.body,
        json: () => consumeBody(() => response.json()),
        consumeBody,
        dispose,
      };
    }
    dispose();
    const retryAfterMs = parseRetryAfterHeaderMs(response.headers?.get('retry-after'));
    const failure = classifyAIProviderHttpFailure(
      providerName,
      response.status,
      response.statusText,
      retryAfterMs
    );
    if (failure.retryable && attempt < maxRetries) {
      await waitForRetry(Math.min(retryAfterMs ?? delay, MAX_RETRY_WAIT_MS), init.signal);
      delay *= 2;
      continue;
    }
    throw new ZaoWuError({
      code: 'AI_PROVIDER_REQUEST_FAILED',
      message: 'AI provider request failed.',
      why: failure.why,
      fix: failure.fix,
    });
  }
}
