import type { DomainDefinition } from '@zaowu/core';

export const AUTO_DOMAIN: DomainDefinition = {
  name: 'auto',
  summary: 'Automation workflows with validation, dry-run, and confirmation',
  commands: [
    {
      name: 'validate',
      summary: 'Validate an automation workflow file',
      status: 'planned',
    },
    {
      name: 'run',
      summary: 'Run an automation workflow with dry-run and confirmation',
      status: 'planned',
      sensitive: true,
    },
  ],
};
