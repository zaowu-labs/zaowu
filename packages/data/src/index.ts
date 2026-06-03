import type { DomainDefinition } from '@zaowu/core';

export const DATA_DOMAIN: DomainDefinition = {
  name: 'data',
  summary: 'Data workflows for inspection, analysis, and cleanup',
  commands: [
    {
      name: 'inspect',
      summary: 'Inspect a dataset or spreadsheet',
      status: 'planned',
    },
    {
      name: 'analyze',
      summary: 'Analyze a dataset or spreadsheet',
      status: 'planned',
    },
    {
      name: 'clean',
      summary: 'Clean data with preview and explicit output control',
      status: 'planned',
      sensitive: true,
    },
  ],
};
