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
  json(): Promise<unknown>;
}

export type AIFetcher = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  }
) => Promise<AIFetchResponse>;

export interface AIAskRequest {
  prompt: string;
  provider?: string | null;
  model?: string;
  filePath?: string;
  env?: NodeJS.ProcessEnv;
  fetcher?: AIFetcher;
}

export interface AIAskResponse {
  provider: AIProviderDescriptor;
  model: string;
  input: {
    source: 'prompt' | 'file' | 'prompt+file';
    promptCharacters: number;
    filePath?: string;
    fileCharacters?: number;
  };
  output: string;
}

export interface AIProviderValidation {
  status: 'ok' | 'warning';
  provider: AIProviderDescriptor;
  warnings: string[];
}

export interface AIProvider {
  descriptor: AIProviderDescriptor;
  ask(request: AIAskRequest): Promise<AIAskResponse>;
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

const createInput = (
  prompt: string,
  filePath: string | undefined,
  fileContent: string | undefined
): AIAskResponse['input'] => {
  if (prompt && filePath) {
    return {
      source: 'prompt+file',
      promptCharacters: prompt.length,
      filePath,
      fileCharacters: fileContent?.length ?? 0,
    };
  }

  if (filePath) {
    return {
      source: 'file',
      promptCharacters: 0,
      filePath,
      fileCharacters: fileContent?.length ?? 0,
    };
  }

  return {
    source: 'prompt',
    promptCharacters: prompt.length,
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
    const prompt = request.prompt.trim();
    const fileContent = request.filePath ? await readPromptFile(request.filePath) : undefined;
    const combinedPrompt = [
      prompt,
      fileContent === undefined ? undefined : `Input file: ${request.filePath}\n${fileContent}`,
    ]
      .filter((part): part is string => Boolean(part?.trim()))
      .join('\n\n');

    if (!combinedPrompt.trim()) {
      throw new ZaoWuError({
        code: 'AI_PROMPT_REQUIRED',
        message: 'AI prompt is required.',
        why: '`zw ai ask` needs a question, instruction, or readable `--file` input.',
        fix: 'Run `zw ai ask "Explain this project"` or `zw ai ask --file README.md`.',
      });
    }

    return {
      provider: this.descriptor,
      model: request.model ?? 'echo-local',
      input: createInput(prompt, request.filePath, fileContent),
      output:
        'This is the local echo provider. It does not call an external AI service.\n\n' +
        `Prompt received:\n${combinedPrompt}`,
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

    if (!apiKey) {
      throw new ZaoWuError({
        code: 'AI_PROVIDER_CONFIG_MISSING',
        message: 'AI provider configuration is missing.',
        why: 'The OpenAI provider requires `OPENAI_API_KEY` in the environment.',
        fix: 'Set `OPENAI_API_KEY` in the shell environment. Do not store it in `zw.yml`.',
      });
    }

    const prompt = request.prompt.trim();
    const fileContent = request.filePath ? await readPromptFile(request.filePath) : undefined;
    const combinedPrompt = [
      prompt,
      fileContent === undefined ? undefined : `Input file: ${request.filePath}\n${fileContent}`,
    ]
      .filter((part): part is string => Boolean(part?.trim()))
      .join('\n\n');

    if (!combinedPrompt.trim()) {
      throw new ZaoWuError({
        code: 'AI_PROMPT_REQUIRED',
        message: 'AI prompt is required.',
        why: '`zw ai ask` needs a question, instruction, or readable `--file` input.',
        fix: 'Run `zw ai ask "Explain this project"` or `zw ai ask --file README.md`.',
      });
    }

    const model =
      request.model ??
      env.OPENAI_MODEL ??
      OPENAI_PROVIDER_DESCRIPTOR.defaultModel ??
      'gpt-4.1-mini';
    const response = await getFetcher(request.fetcher)('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: combinedPrompt,
      }),
    });

    if (!response.ok) {
      throw new ZaoWuError({
        code: 'AI_PROVIDER_REQUEST_FAILED',
        message: 'AI provider request failed.',
        why: `OpenAI returned HTTP ${response.status} ${response.statusText}.`,
        fix: 'Check `OPENAI_API_KEY`, `OPENAI_MODEL`, network access, and provider status.',
      });
    }

    const output = extractOpenAIOutputText(await response.json());
    const descriptor = createProviderDescriptor(OPENAI_PROVIDER_DESCRIPTOR, env);

    return {
      provider: descriptor,
      model,
      input: createInput(prompt, request.filePath, fileContent),
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

export const askAI = async (request: AIAskRequest): Promise<AIAskResponse> => {
  const prompt = request.prompt.trim();

  if (!prompt && !request.filePath) {
    throw new ZaoWuError({
      code: 'AI_PROMPT_REQUIRED',
      message: 'AI prompt is required.',
      why: '`zw ai ask` needs a question, instruction, or readable `--file` input.',
      fix: 'Run `zw ai ask "Explain this project"` or `zw ai ask --file README.md`.',
    });
  }

  return await getAIProvider(request.provider).ask({
    ...request,
    prompt,
  });
};
