import type { DomainDefinition } from '@zaowu/core';

export const DOC_DOMAIN: DomainDefinition = {
  name: 'doc',
  summary: 'Document workflows for summary, extraction, and conversion',
  commands: [
    {
      name: 'summary',
      summary: 'Summarize a document',
      status: 'planned',
    },
    {
      name: 'extract',
      summary: 'Extract structured content from a document',
      status: 'planned',
    },
    {
      name: 'convert',
      summary: 'Convert a document with explicit output control',
      status: 'planned',
      sensitive: true,
    },
  ],
};
