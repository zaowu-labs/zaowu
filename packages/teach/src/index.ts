import type { DomainDefinition } from '@zaowu/core';

export const TEACH_DOMAIN: DomainDefinition = {
  name: 'teach',
  summary: 'Teaching workflows for lesson planning and practice materials',
  commands: [
    {
      name: 'plan',
      summary: 'Create a teaching plan',
      status: 'planned',
    },
    {
      name: 'quiz',
      summary: 'Create practice questions from provided material',
      status: 'planned',
    },
  ],
};
