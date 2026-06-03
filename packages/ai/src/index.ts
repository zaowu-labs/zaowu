import type { DomainDefinition } from '@zaowu/core';
import { ZaoWuError } from '@zaowu/core';

export interface AIProviderDescriptor {
  id: string;
  name: string;
  network: boolean;
}

export interface AIAskRequest {
  prompt: string;
  provider?: string | null;
  model?: string;
}

export interface AIAskResponse {
  provider: AIProviderDescriptor;
  model: string;
  output: string;
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
  ],
};

const ECHO_PROVIDER: AIProvider = {
  descriptor: {
    id: 'echo',
    name: 'Local Echo',
    network: false,
  },
  async ask(request) {
    const prompt = request.prompt.trim();

    return {
      provider: this.descriptor,
      model: request.model ?? 'echo-local',
      output:
        'This is the local echo provider. It does not call an external AI service.\n\n' +
        `Prompt received:\n${prompt}`,
    };
  },
};

const PROVIDERS = new Map<string, AIProvider>([[ECHO_PROVIDER.descriptor.id, ECHO_PROVIDER]]);

export const listAIProviders = (): readonly AIProviderDescriptor[] =>
  [...PROVIDERS.values()].map((provider) => provider.descriptor);

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

export const askAI = async (request: AIAskRequest): Promise<AIAskResponse> => {
  const prompt = request.prompt.trim();

  if (!prompt) {
    throw new ZaoWuError({
      code: 'AI_PROMPT_REQUIRED',
      message: 'AI prompt is required.',
      why: '`zw ai ask` needs a question or instruction to send to the provider.',
      fix: 'Run `zw ai ask "Explain this project"`.',
    });
  }

  return await getAIProvider(request.provider).ask({
    ...request,
    prompt,
  });
};
