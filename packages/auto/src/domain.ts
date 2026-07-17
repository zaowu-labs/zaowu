import { createCapabilityLedger, type DomainDefinition } from '@zaowu-labs/core';

export const AUTO_DOMAIN: DomainDefinition = {
  name: 'auto',
  summary: 'Automation workflows with validation, dry-run, and confirmation',
  capabilities: createCapabilityLedger({ readsFiles: true, writesFiles: true }),
  commands: [
    { name: 'validate', summary: 'Validate an automation workflow file', status: 'available' },
    {
      name: 'plan',
      summary: 'Preview the execution plan for an automation workflow',
      status: 'available',
    },
    {
      name: 'run',
      summary: 'Run an automation workflow with dry-run and confirmation',
      status: 'available',
      sensitive: true,
    },
  ],
};
