import type { DomainDefinition } from '@zaowu/core';

export const DEV_DOMAIN: DomainDefinition = {
  name: 'dev',
  summary: 'Developer workflows for review, commit, and repository assistance',
  commands: [
    {
      name: 'commit',
      summary: 'Preview and prepare a Git commit message',
      status: 'planned',
      sensitive: true,
    },
    {
      name: 'review',
      summary: 'Review a repository change without modifying files',
      status: 'planned',
    },
  ],
};
