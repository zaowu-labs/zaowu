import { readFile } from 'node:fs/promises';
import { createCapabilityLedger, type DomainDefinition } from '@zaowu/core';
import { stripUtf8Bom, ZaoWuError } from '@zaowu/core';

export interface AIProviderDescriptor {
  id: string;
  name: string;
  network: boolean;
  configured: boolean;
  requiredEnv: string[];
  defaultModel?: string;
}

export interface AIFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers?: {
    get(name: string): string | null;
  };
  json(): Promise<unknown>;
}

export type AIFetcher = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  }
) => Promise<AIFetchResponse>;

export interface AIAskRequest {
  prompt: string;
  provider?: string | null;
  model?: string;
  filePath?: string;
  env?: NodeJS.ProcessEnv;
  fetcher?: AIFetcher;
  allowNetwork?: boolean;
  timeoutMs?: number;
  maxInputCharacters?: number;
}

export interface AIAskResponse {
  provider: AIProviderDescriptor;
  model: string;
  input: {
    source: 'prompt' | 'file' | 'prompt+file';
    promptCharacters: number;
    filePath?: string;
    fileCharacters?: number;
    combinedCharacters: number;
    maxInputCharacters: number;
  };
  output: string;
}

export interface AIProviderValidation {
  status: 'ok' | 'warning';
  provider: AIProviderDescriptor;
  warnings: string[];
}

export type AIProviderFailureKind =
  | 'auth'
  | 'rate-limit'
  | 'bad-request'
  | 'server'
  | 'transport'
  | 'timeout'
  | 'invalid-response'
  | 'unknown';

export interface AIProviderFailure {
  kind: AIProviderFailureKind;
  retryable: boolean;
  safeSummary: string;
  retryAfterMs?: number;
  why: string;
  fix: string;
}

export interface AIProvider {
  descriptor: AIProviderDescriptor;
  ask(request: AIAskRequest): Promise<AIAskResponse>;
}

export interface AIAskPreview {
  status: 'preview';
  provider: AIProviderDescriptor;
  model: string;
  input: AIAskResponse['input'];
  validation: AIProviderValidation;
}

export const AI_DOMAIN: DomainDefinition = {
  name: 'ai',
  summary: 'AI-assisted question answering and provider-backed workflows',
  capabilities: createCapabilityLedger({
    readsFiles: true,
    usesNetwork: true,
    accessesSecrets: true,
  }),
  commands: [
    {
      name: 'ask',
      summary: 'Ask an AI provider a question',
      status: 'available',
      sensitive: true,
    },
    {
      name: 'providers',
      summary: 'List registered AI providers and configuration status',
      status: 'available',
    },
  ],
};

const getConfigured = (requiredEnv: readonly string[], env: NodeJS.ProcessEnv): boolean =>
  requiredEnv.every((name) => Boolean(env[name]?.trim()));

const createProviderDescriptor = (
  descriptor: Omit<AIProviderDescriptor, 'configured'>,
  env: NodeJS.ProcessEnv = process.env
): AIProviderDescriptor => ({
  ...descriptor,
  configured: descriptor.requiredEnv.length === 0 || getConfigured(descriptor.requiredEnv, env),
});

const DEFAULT_PROVIDER_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_INPUT_CHARACTERS = 200_000;

const createCombinedPrompt = (
  prompt: string,
  filePath: string | undefined,
  fileContent: string | undefined
): string =>
  [prompt, fileContent === undefined ? undefined : `Input file: ${filePath}\n${fileContent}`]
    .filter((part): part is string => Boolean(part?.trim()))
    .join('\n\n');

const createInput = (
  prompt: string,
  filePath: string | undefined,
  fileContent: string | undefined,
  combinedPrompt: string,
  maxInputCharacters: number
): AIAskResponse['input'] => {
  if (prompt && filePath) {
    return {
      source: 'prompt+file',
      promptCharacters: prompt.length,
      filePath,
      fileCharacters: fileContent?.length ?? 0,
      combinedCharacters: combinedPrompt.length,
      maxInputCharacters,
    };
  }

  if (filePath) {
    return {
      source: 'file',
      promptCharacters: 0,
      filePath,
      fileCharacters: fileContent?.length ?? 0,
      combinedCharacters: combinedPrompt.length,
      maxInputCharacters,
    };
  }

  return {
    source: 'prompt',
    promptCharacters: prompt.length,
    combinedCharacters: combinedPrompt.length,
    maxInputCharacters,
  };
};

const assertPromptInput = (prompt: string, filePath: string | undefined): void => {
  if (!prompt && !filePath) {
    throw new ZaoWuError({
      code: 'AI_PROMPT_REQUIRED',
      message: 'AI prompt is required.',
      why: '`zw ai ask` needs a question, instruction, or readable `--file` input.',
      fix: 'Run `zw ai ask "Explain this project"` or `zw ai ask --file README.md`.',
    });
  }
};

const assertInputSize = (combinedPrompt: string, maxInputCharacters: number): void => {
  if (!combinedPrompt.trim()) {
    throw new ZaoWuError({
      code: 'AI_PROMPT_REQUIRED',
      message: 'AI prompt is required.',
      why: '`zw ai ask` needs a question, instruction, or readable `--file` input.',
      fix: 'Run `zw ai ask "Explain this project"` or `zw ai ask --file README.md`.',
    });
  }

  if (combinedPrompt.length > maxInputCharacters) {
    throw new ZaoWuError({
      code: 'AI_INPUT_TOO_LARGE',
      message: 'AI input is too large.',
      why: `The combined prompt is ${combinedPrompt.length} characters, above the limit of ${maxInputCharacters}.`,
      fix: 'Use a smaller prompt or a smaller input file.',
    });
  }
};

const prepareAIInput = async (
  request: AIAskRequest
): Promise<{
  prompt: string;
  combinedPrompt: string;
  input: AIAskResponse['input'];
}> => {
  const prompt = request.prompt.trim();
  const maxInputCharacters = request.maxInputCharacters ?? DEFAULT_MAX_INPUT_CHARACTERS;

  assertPromptInput(prompt, request.filePath);

  const fileContent = request.filePath ? await readPromptFile(request.filePath) : undefined;
  const combinedPrompt = createCombinedPrompt(prompt, request.filePath, fileContent);

  assertInputSize(combinedPrompt, maxInputCharacters);

  return {
    prompt,
    combinedPrompt,
    input: createInput(prompt, request.filePath, fileContent, combinedPrompt, maxInputCharacters),
  };
};

const readPromptFile = async (filePath: string): Promise<string> => {
  try {
    return stripUtf8Bom(await readFile(filePath, 'utf8'));
  } catch {
    throw new ZaoWuError({
      code: 'AI_INPUT_FILE_READ_FAILED',
      message: 'Could not read AI input file.',
      why: `ZaoWu tried to read \`${filePath}\`, but the file was not readable.`,
      fix: 'Check the path and file permissions, then run the command again.',
    });
  }
};

const ECHO_PROVIDER: AIProvider = {
  descriptor: createProviderDescriptor({
    id: 'echo',
    name: 'Local Echo',
    network: false,
    requiredEnv: [],
  }),
  async ask(request) {
    const prepared = await prepareAIInput(request);

    return {
      provider: this.descriptor,
      model: request.model ?? 'echo-local',
      input: prepared.input,
      output:
        'This is the local echo provider. It does not call an external AI service.\n\n' +
        `Prompt received:\n${prepared.combinedPrompt}`,
    };
  },
};

const OPENAI_PROVIDER_DESCRIPTOR: Omit<AIProviderDescriptor, 'configured'> = {
  id: 'openai',
  name: 'OpenAI',
  network: true,
  requiredEnv: ['OPENAI_API_KEY'],
  defaultModel: 'gpt-4.1-mini',
};

const MAX_PROVIDER_STATUS_TEXT_CHARACTERS = 80;

const sanitizeProviderStatusText = (statusText: string): string => {
  const normalized = statusText.replace(/\s+/g, ' ').trim();

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
    return Math.round(seconds * 1000);
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

const getFetcher = (fetcher?: AIFetcher): AIFetcher => {
  if (fetcher) {
    return fetcher;
  }

  if (typeof globalThis.fetch !== 'function') {
    throw new ZaoWuError({
      code: 'AI_PROVIDER_REQUEST_FAILED',
      message: 'AI provider request failed.',
      why: 'The current runtime does not provide `fetch`, which is required for network AI providers.',
      fix: 'Use Node.js 20.19.0 or newer.',
    });
  }

  return globalThis.fetch as unknown as AIFetcher;
};

const extractOpenAIOutputText = (payload: unknown): string => {
  if (!payload || typeof payload !== 'object') {
    throw new ZaoWuError({
      code: 'AI_PROVIDER_RESPONSE_INVALID',
      message: 'AI provider response is invalid.',
      why: 'The provider returned a non-object JSON response.',
      fix: 'Check the provider response or update the OpenAI adapter parser.',
    });
  }

  const response = payload as {
    output_text?: unknown;
    output?: Array<{
      content?: Array<{
        type?: string;
        text?: unknown;
      }>;
    }>;
  };

  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text;
  }

  const text = response.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => (typeof content.text === 'string' ? content.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();

  if (text) {
    return text;
  }

  throw new ZaoWuError({
    code: 'AI_PROVIDER_RESPONSE_INVALID',
    message: 'AI provider response is invalid.',
    why: 'The provider response did not contain text output.',
    fix: 'Check the provider response or update the OpenAI adapter parser.',
  });
};

const OPENAI_PROVIDER: AIProvider = {
  descriptor: createProviderDescriptor(OPENAI_PROVIDER_DESCRIPTOR),
  async ask(request) {
    const env = request.env ?? process.env;
    const apiKey = env.OPENAI_API_KEY?.trim();

    if (!request.allowNetwork) {
      throw new ZaoWuError({
        code: 'AI_NETWORK_CONFIRMATION_REQUIRED',
        message: 'Network AI request requires confirmation.',
        why: 'The OpenAI provider sends prompt input to a network service.',
        fix: 'Use the CLI preview first, then re-run with `--yes` when the operation plan is acceptable.',
      });
    }

    if (!apiKey) {
      throw new ZaoWuError({
        code: 'AI_PROVIDER_CONFIG_MISSING',
        message: 'AI provider configuration is missing.',
        why: 'The OpenAI provider requires `OPENAI_API_KEY` in the environment.',
        fix: 'Set `OPENAI_API_KEY` in the shell environment. Do not store it in `zw.yml`.',
      });
    }

    const prepared = await prepareAIInput(request);

    const model =
      request.model ??
      env.OPENAI_MODEL ??
      OPENAI_PROVIDER_DESCRIPTOR.defaultModel ??
      'gpt-4.1-mini';
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      request.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS
    );
    let response: AIFetchResponse;

    try {
      response = await getFetcher(request.fetcher)('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: prepared.combinedPrompt,
        }),
        signal: controller.signal,
      });
    } catch {
      throw new ZaoWuError({
        code: 'AI_PROVIDER_REQUEST_FAILED',
        message: 'AI provider request failed.',
        why: controller.signal.aborted
          ? `OpenAI did not respond within ${request.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS}ms.`
          : 'The OpenAI request failed before a response was received.',
        fix: 'Check network access, provider status, and timeout settings, then try again.',
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const failure = classifyAIProviderHttpFailure(
        OPENAI_PROVIDER_DESCRIPTOR.name,
        response.status,
        response.statusText,
        parseRetryAfterHeaderMs(response.headers?.get('retry-after'))
      );

      throw new ZaoWuError({
        code: 'AI_PROVIDER_REQUEST_FAILED',
        message: 'AI provider request failed.',
        why: failure.why,
        fix: failure.fix,
      });
    }

    const output = extractOpenAIOutputText(await response.json());
    const descriptor = createProviderDescriptor(OPENAI_PROVIDER_DESCRIPTOR, env);

    return {
      provider: descriptor,
      model,
      input: prepared.input,
      output,
    };
  },
};

const PROVIDERS = new Map<string, AIProvider>([
  [ECHO_PROVIDER.descriptor.id, ECHO_PROVIDER],
  [OPENAI_PROVIDER.descriptor.id, OPENAI_PROVIDER],
]);

export const listAIProviders = (
  env: NodeJS.ProcessEnv = process.env
): readonly AIProviderDescriptor[] => [
  ECHO_PROVIDER.descriptor,
  createProviderDescriptor(OPENAI_PROVIDER_DESCRIPTOR, env),
];

export const getAIProvider = (id: string | null | undefined): AIProvider => {
  const providerId = id?.trim() || ECHO_PROVIDER.descriptor.id;
  const provider = PROVIDERS.get(providerId);

  if (!provider) {
    throw new ZaoWuError({
      code: 'AI_PROVIDER_NOT_FOUND',
      message: `AI provider not found: ${providerId}.`,
      why: `ZaoWu does not have a registered AI provider named \`${providerId}\`.`,
      fix: `Use one of: ${listAIProviders()
        .map((candidate) => candidate.id)
        .join(', ')}.`,
    });
  }

  return provider;
};

export const validateAIProviderConfig = (
  id: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): AIProviderValidation => {
  const providerId = id?.trim() || ECHO_PROVIDER.descriptor.id;
  const provider = listAIProviders(env).find((candidate) => candidate.id === providerId);

  if (!provider) {
    throw new ZaoWuError({
      code: 'AI_PROVIDER_NOT_FOUND',
      message: `AI provider not found: ${providerId}.`,
      why: `ZaoWu does not have a registered AI provider named \`${providerId}\`.`,
      fix: `Use one of: ${listAIProviders(env)
        .map((candidate) => candidate.id)
        .join(', ')}.`,
    });
  }

  const warnings = provider.configured
    ? []
    : [`Missing environment variable(s): ${provider.requiredEnv.join(', ')}.`];

  return {
    status: warnings.length > 0 ? 'warning' : 'ok',
    provider,
    warnings,
  };
};

const getPreviewModel = (
  provider: AIProviderDescriptor,
  request: AIAskRequest,
  env: NodeJS.ProcessEnv
): string => {
  if (request.model) {
    return request.model;
  }

  if (provider.id === OPENAI_PROVIDER_DESCRIPTOR.id && env.OPENAI_MODEL?.trim()) {
    return env.OPENAI_MODEL.trim();
  }

  return provider.defaultModel ?? 'echo-local';
};

export const previewAIRequest = async (request: AIAskRequest): Promise<AIAskPreview> => {
  const env = request.env ?? process.env;
  const validation = validateAIProviderConfig(request.provider, env);
  const prepared = await prepareAIInput(request);

  return {
    status: 'preview',
    provider: validation.provider,
    model: getPreviewModel(validation.provider, request, env),
    input: prepared.input,
    validation,
  };
};

export const askAI = async (request: AIAskRequest): Promise<AIAskResponse> => {
  const prompt = request.prompt.trim();

  assertPromptInput(prompt, request.filePath);

  return await getAIProvider(request.provider).ask({
    ...request,
    prompt,
  });
};
