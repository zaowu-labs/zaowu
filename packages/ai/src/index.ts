import { createContentOperationSubjects, readTextFileOrThrow, ZaoWuError } from '@zaowu-labs/core';
import type {
  AIAskPreview,
  AIAskRequest,
  AIAskResponse,
  AIFetcher,
  AIProvider,
  AIProviderDescriptor,
  AIProviderValidation,
  AIUsage,
} from './contracts.js';

import { fetchWithRetry } from './transport.js';

export {
  fetchWithRetry,
  parseRetryAfterHeaderMs,
  classifyAIProviderHttpFailure,
} from './transport.js';
export * from './contracts.js';
export { AI_DOMAIN } from './domain.js';

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
const AI_RESULT_SCHEMA_VERSION = 1;
const createCombinedPrompt = (
  prompt: string,
  filePath: string | undefined,
  fileContent: string | undefined
): string =>
  [prompt, fileContent?.trim() ? `Input file: ${filePath}\n${fileContent}` : undefined]
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

/**
 * Content subjects (sha256 + length) for the exact combined prompt that would be
 * sent to the provider — prompt text plus any `--file` body. Folding these into
 * an operation plan binds the confirmation fingerprint to the network payload,
 * so a prompt or file changed between preview and confirm invalidates the plan
 * instead of silently sending different content.
 */
export const resolveAIRequestContentSubjects = async (request: AIAskRequest): Promise<string[]> => {
  const prepared = await prepareAIInput(request);

  return createContentOperationSubjects(prepared.combinedPrompt);
};

const readPromptFile = (filePath: string): Promise<string> =>
  readTextFileOrThrow(
    filePath,
    {
      code: 'AI_INPUT_FILE_READ_FAILED',
      message: 'Could not read AI input file.',
      why: `ZaoWu tried to read \`${filePath}\`, but the file was not readable.`,
      fix: 'Check the path and file permissions, then run the command again.',
    },
    { stripBom: true }
  );

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
      schemaVersion: AI_RESULT_SCHEMA_VERSION,
      status: 'ok',
      provider: this.descriptor,
      model: request.model ?? 'echo-local',
      endpoint: null,
      input: prepared.input,
      output:
        'This is the local echo provider. It does not call an external AI service.\n\n' +
        `Prompt received:\n${prepared.combinedPrompt}`,
      usage: null,
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

const resolveProviderEndpoint = (
  baseUrl: string,
  pathSuffix: string,
  environmentVariable: string
): string => {
  let parsed: URL;

  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new ZaoWuError({
      code: 'AI_PROVIDER_REQUEST_FAILED',
      message: 'AI provider endpoint is invalid.',
      why: `The endpoint configured through \`${environmentVariable}\` is not a valid URL.`,
      fix: `Set \`${environmentVariable}\` to an explicit http or https base URL.`,
    });
  }

  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new ZaoWuError({
      code: 'AI_PROVIDER_REQUEST_FAILED',
      message: 'AI provider endpoint is invalid.',
      why: `The endpoint configured through \`${environmentVariable}\` must use http or https and must not contain credentials, a query string, or a fragment.`,
      fix: `Set \`${environmentVariable}\` to a credential-free http or https base URL without a query string or fragment.`,
    });
  }

  return `${parsed.toString().replace(/\/+$/, '')}${pathSuffix}`;
};

// Maps (not object literals) so an arbitrary caller-supplied provider id like
// `toString` cannot resolve to an Object.prototype member and slip past the
// unknown-provider check.
const PROVIDER_NETWORK_TARGETS = new Map<
  string,
  { baseUrlEnv: string; defaultBaseUrl: string; pathSuffix: string }
>([
  [
    OPENAI_PROVIDER_DESCRIPTOR.id,
    {
      baseUrlEnv: 'OPENAI_BASE_URL',
      defaultBaseUrl: 'https://api.openai.com',
      pathSuffix: '/v1/responses',
    },
  ],
  [
    'ollama',
    {
      baseUrlEnv: 'OLLAMA_HOST',
      defaultBaseUrl: 'http://localhost:11434',
      pathSuffix: '/api/generate',
    },
  ],
  [
    'anthropic',
    {
      baseUrlEnv: 'ANTHROPIC_BASE_URL',
      defaultBaseUrl: 'https://api.anthropic.com',
      pathSuffix: '/v1/messages',
    },
  ],
]);

export const resolveAIProviderNetworkTarget = (
  providerId: string,
  env: NodeJS.ProcessEnv = process.env
): string | undefined => {
  const target = PROVIDER_NETWORK_TARGETS.get(providerId);

  if (!target) {
    return undefined;
  }

  return resolveProviderEndpoint(
    env[target.baseUrlEnv]?.trim() || target.defaultBaseUrl,
    target.pathSuffix,
    target.baseUrlEnv
  );
};

const PROVIDER_MODEL_ENVS = new Map<string, string>([
  [OPENAI_PROVIDER_DESCRIPTOR.id, 'OPENAI_MODEL'],
  ['anthropic', 'ANTHROPIC_MODEL'],
]);

export const resolveAIModel = (
  provider: AIProviderDescriptor,
  options: { model?: string; env?: NodeJS.ProcessEnv } = {}
): string => {
  const env = options.env ?? process.env;
  const requestedModel = options.model?.trim();

  if (requestedModel) {
    return requestedModel;
  }

  const modelEnv = PROVIDER_MODEL_ENVS.get(provider.id);
  const envModel = modelEnv ? env[modelEnv]?.trim() : undefined;

  return envModel || (provider.defaultModel ?? 'echo-local');
};

const getPreviewModel = (
  provider: AIProviderDescriptor,
  request: AIAskRequest,
  env: NodeJS.ProcessEnv
): string => resolveAIModel(provider, { model: request.model, env });

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
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
    output_text?: unknown;
    output?: Array<{
      content?: Array<{
        type?: string;
        text?: unknown;
      }>;
    }>;
  };

  const choiceText = Array.isArray(response.choices)
    ? response.choices[0]?.message?.content
    : undefined;
  if (typeof choiceText === 'string' && choiceText.trim()) {
    return choiceText;
  }

  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text;
  }

  const text = (Array.isArray(response.output) ? response.output : [])
    .flatMap((item) => (item && Array.isArray(item.content) ? item.content : []))
    .map((content) =>
      content && content.type === 'output_text' && typeof content.text === 'string'
        ? content.text
        : ''
    )
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

const asUsageNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

const extractProviderUsage = (payload: unknown): AIUsage | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const rawUsage = (payload as { usage?: unknown }).usage;
  if (!rawUsage || typeof rawUsage !== 'object') {
    return null;
  }

  const usage = rawUsage as Record<string, unknown>;
  const result: AIUsage = {
    inputTokens: asUsageNumber(usage.input_tokens ?? usage.prompt_tokens),
    outputTokens: asUsageNumber(usage.output_tokens ?? usage.completion_tokens),
    totalTokens: asUsageNumber(usage.total_tokens),
  };

  if (
    result.totalTokens === undefined &&
    result.inputTokens !== undefined &&
    result.outputTokens !== undefined
  ) {
    result.totalTokens = result.inputTokens + result.outputTokens;
  }

  return Object.values(result).some((value) => value !== undefined) ? result : null;
};

const extractAnthropicOutputText = (payload: unknown): string => {
  if (!payload || typeof payload !== 'object') {
    throw new ZaoWuError({
      code: 'AI_PROVIDER_RESPONSE_INVALID',
      message: 'AI provider response is invalid.',
      why: 'Anthropic returned a non-object JSON response.',
      fix: 'Check the Anthropic response or update the provider adapter parser.',
    });
  }

  const response = payload as {
    content?: Array<{
      type?: unknown;
      text?: unknown;
    }>;
  };
  const output = (Array.isArray(response.content) ? response.content : [])
    .map((content) =>
      content && content.type === 'text' && typeof content.text === 'string' ? content.text : ''
    )
    .filter(Boolean)
    .join('\n')
    .trim();

  if (output) {
    return output;
  }

  throw new ZaoWuError({
    code: 'AI_PROVIDER_RESPONSE_INVALID',
    message: 'AI provider response is invalid.',
    why: 'The response from Anthropic did not contain generated text.',
    fix: 'Check the Anthropic model response and adapter parser.',
  });
};

interface NetworkProviderConfig {
  descriptor: Omit<AIProviderDescriptor, 'configured'>;
  /** `why` text for the network-confirmation guard. */
  networkWhy: string;
  /** Environment variable holding the API key, when the provider needs one. */
  apiKeyEnv?: string;
  buildHeaders: (apiKey: string | undefined) => Record<string, string>;
  buildBody: (model: string, combinedPrompt: string) => unknown;
  /** Full error for a successful HTTP response whose body is not valid JSON. */
  invalidJson: { why: string; fix: string };
  /** Extract the generated text; throws AI_PROVIDER_RESPONSE_INVALID itself. */
  extractOutput: (payload: unknown) => string;
}

/**
 * Shared network-provider skeleton. Every HTTP-backed provider follows the
 * same sequence — confirmation guard, key check, input preparation, retried
 * fetch, JSON parse, text extraction — so the per-provider code reduces to
 * the request shape and response parsing that genuinely differ.
 */
const createNetworkProvider = (config: NetworkProviderConfig): AIProvider => ({
  descriptor: createProviderDescriptor(config.descriptor),
  async ask(request) {
    const env = request.env ?? process.env;
    const apiKey = config.apiKeyEnv ? env[config.apiKeyEnv]?.trim() : undefined;

    if (!request.allowNetwork) {
      throw new ZaoWuError({
        code: 'AI_NETWORK_CONFIRMATION_REQUIRED',
        message: 'Network AI request requires confirmation.',
        why: config.networkWhy,
        fix: 'Use the CLI preview first, then re-run with `--yes` when the operation plan is acceptable.',
      });
    }

    if (config.apiKeyEnv && !apiKey) {
      throw new ZaoWuError({
        code: 'AI_PROVIDER_CONFIG_MISSING',
        message: 'AI provider configuration is missing.',
        why: `The ${config.descriptor.name} provider requires \`${config.apiKeyEnv}\` in the environment.`,
        fix: `Set \`${config.apiKeyEnv}\` in the shell environment. Do not store it in \`zw.yml\`.`,
      });
    }

    const prepared = await prepareAIInput(request);
    const descriptor = createProviderDescriptor(config.descriptor, env);
    const model = resolveAIModel(descriptor, { model: request.model, env });
    const url = resolveAIProviderNetworkTarget(config.descriptor.id, env)!;

    const response = await fetchWithRetry(
      getFetcher(request.fetcher),
      url,
      {
        method: 'POST',
        headers: config.buildHeaders(apiKey),
        body: JSON.stringify(config.buildBody(model, prepared.combinedPrompt)),
      },
      config.descriptor.name,
      request.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS
    );

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      if (error instanceof ZaoWuError) throw error;
      throw new ZaoWuError({
        code: 'AI_PROVIDER_RESPONSE_INVALID',
        message: 'AI provider response is invalid.',
        why: config.invalidJson.why,
        fix: config.invalidJson.fix,
      });
    }

    return {
      schemaVersion: AI_RESULT_SCHEMA_VERSION,
      status: 'ok',
      provider: descriptor,
      model,
      endpoint: url,
      input: prepared.input,
      output: config.extractOutput(payload),
      usage: extractProviderUsage(payload),
    };
  },
});

const OPENAI_PROVIDER = createNetworkProvider({
  descriptor: OPENAI_PROVIDER_DESCRIPTOR,
  networkWhy: 'The OpenAI provider sends prompt input to a network service.',
  apiKeyEnv: 'OPENAI_API_KEY',
  buildHeaders: (apiKey) => ({
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }),
  buildBody: (model, combinedPrompt) => ({
    model,
    input: combinedPrompt,
  }),
  invalidJson: {
    why: 'OpenAI returned a successful HTTP response, but the response body was not valid JSON.',
    fix: 'Retry the request. If it repeats, check provider status or update the OpenAI adapter parser.',
  },
  extractOutput: extractOpenAIOutputText,
});

const OLLAMA_PROVIDER_DESCRIPTOR: Omit<AIProviderDescriptor, 'configured'> = {
  id: 'ollama',
  name: 'Ollama (Local)',
  network: true,
  requiredEnv: [],
  defaultModel: 'llama3',
};

const extractOllamaOutputText = (payload: unknown): string => {
  const resObj = payload as { response?: unknown };

  if (
    typeof resObj !== 'object' ||
    resObj === null ||
    typeof resObj.response !== 'string' ||
    !resObj.response.trim()
  ) {
    throw new ZaoWuError({
      code: 'AI_PROVIDER_RESPONSE_INVALID',
      message: 'AI provider response is invalid.',
      why: 'The response from Ollama did not contain the generated text.',
      fix: 'Check the Ollama version and settings.',
    });
  }

  return resObj.response;
};

const OLLAMA_PROVIDER = createNetworkProvider({
  descriptor: OLLAMA_PROVIDER_DESCRIPTOR,
  networkWhy: 'The Ollama provider sends prompt input to an HTTP endpoint.',
  buildHeaders: () => ({
    'Content-Type': 'application/json',
  }),
  buildBody: (model, combinedPrompt) => ({
    model,
    prompt: combinedPrompt,
    stream: false,
  }),
  invalidJson: {
    why: 'Ollama returned a successful HTTP response, but the response body was not valid JSON.',
    fix: 'Check the Ollama version and settings.',
  },
  extractOutput: extractOllamaOutputText,
});

const ANTHROPIC_PROVIDER_DESCRIPTOR: Omit<AIProviderDescriptor, 'configured'> = {
  id: 'anthropic',
  name: 'Anthropic',
  network: true,
  requiredEnv: ['ANTHROPIC_API_KEY'],
  defaultModel: 'claude-3-5-sonnet-latest',
};

const ANTHROPIC_PROVIDER = createNetworkProvider({
  descriptor: ANTHROPIC_PROVIDER_DESCRIPTOR,
  networkWhy: 'The Anthropic provider sends prompt input to a network service.',
  apiKeyEnv: 'ANTHROPIC_API_KEY',
  buildHeaders: (apiKey) => ({
    'x-api-key': apiKey ?? '',
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  }),
  buildBody: (model, combinedPrompt) => ({
    model,
    messages: [{ role: 'user', content: combinedPrompt }],
    max_tokens: 4096,
    stream: false,
  }),
  invalidJson: {
    why: 'Anthropic returned a successful HTTP response, but the response body was not valid JSON.',
    fix: 'Retry the request.',
  },
  extractOutput: extractAnthropicOutputText,
});

const PROVIDERS = new Map<string, AIProvider>([
  [ECHO_PROVIDER.descriptor.id, ECHO_PROVIDER],
  [OPENAI_PROVIDER.descriptor.id, OPENAI_PROVIDER],
  [OLLAMA_PROVIDER.descriptor.id, OLLAMA_PROVIDER],
  [ANTHROPIC_PROVIDER.descriptor.id, ANTHROPIC_PROVIDER],
]);

export const listAIProviders = (
  env: NodeJS.ProcessEnv = process.env
): readonly AIProviderDescriptor[] => [
  ECHO_PROVIDER.descriptor,
  createProviderDescriptor(OPENAI_PROVIDER_DESCRIPTOR, env),
  createProviderDescriptor(OLLAMA_PROVIDER_DESCRIPTOR, env),
  createProviderDescriptor(ANTHROPIC_PROVIDER_DESCRIPTOR, env),
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

export const previewAIRequest = async (request: AIAskRequest): Promise<AIAskPreview> => {
  const env = request.env ?? process.env;
  const validation = validateAIProviderConfig(request.provider, env);
  const prepared = await prepareAIInput(request);

  return {
    schemaVersion: AI_RESULT_SCHEMA_VERSION,
    status: 'preview',
    provider: validation.provider,
    model: getPreviewModel(validation.provider, request, env),
    endpoint: validation.provider.network
      ? (resolveAIProviderNetworkTarget(validation.provider.id, env) ?? null)
      : null,
    input: prepared.input,
    validation,
    usage: null,
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
