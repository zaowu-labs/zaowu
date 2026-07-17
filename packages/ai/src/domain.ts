import { createCapabilityLedger, type DomainDefinition } from '@zaowu-labs/core';

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
