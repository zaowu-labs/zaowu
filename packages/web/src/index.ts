import type { DomainDefinition } from '@zaowu/core';

export const WEB_DOMAIN: DomainDefinition = {
  name: 'web',
  summary: 'Web workflows with explicit network access and target disclosure',
  commands: [
    {
      name: 'inspect',
      summary: 'Inspect a web target after explicit user request',
      status: 'planned',
      sensitive: true,
    },
    {
      name: 'fetch',
      summary: 'Fetch web content with clear target disclosure',
      status: 'planned',
      sensitive: true,
    },
  ],
};
