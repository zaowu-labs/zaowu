import type { DomainDefinition } from '@zaowu/core';

export interface AIProviderDescriptor {
  id: string;
  name: string;
}

export const AI_DOMAIN: DomainDefinition = {
  name: 'ai',
  summary: 'AI-assisted question answering and provider-backed workflows',
  commands: [
    {
      name: 'ask',
      summary: 'Ask an AI provider a question',
      status: 'planned',
      sensitive: true,
    },
  ],
};

export const listAIProviders = (): readonly AIProviderDescriptor[] => [];
