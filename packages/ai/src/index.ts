import { readFile } from 'node:fs/promises';
import type { DomainDefinition } from '@zaowu/core';
import { stripUtf8Bom, ZaoWuError } from '@zaowu/core';

export interface AIProviderDescriptor {
  id: string;
  name: string;
  network: boolean;
  configured: boolean;
  requiredEnv: string[];
}

export interface AIAskRequest {
  prompt: string;
  provider?: string | null;
  model?: string;
  filePath?: string;
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
};

const OPENAI_PROVIDER: AIProvider = {
  descriptor: createProviderDescriptor(OPENAI_PROVIDER_DESCRIPTOR),
  async ask() {
    throw new ZaoWuError({
      code: 'AI_PROVIDER_NOT_IMPLEMENTED',
      message: 'AI provider is not implemented yet.',
      why: 'The OpenAI provider is registered for configuration validation, but network calls are not wired in this foundation version.',
      fix: 'Use the local `echo` provider for now, or implement the provider adapter in `packages/ai`.',
    });
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
