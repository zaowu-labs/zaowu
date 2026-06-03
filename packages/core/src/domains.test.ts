import { describe, expect, it } from 'vitest';
import { findDomainCommand, type DomainDefinition } from './domains';

describe('domain definitions', () => {
  it('finds commands within a domain', () => {
    const domain: DomainDefinition = {
      name: 'dev',
      summary: 'Development workflows',
      commands: [
        {
          name: 'review',
          summary: 'Review a code change',
          status: 'planned',
        },
      ],
    };

    expect(findDomainCommand(domain, 'review')?.summary).toBe('Review a code change');
    expect(findDomainCommand(domain, 'missing')).toBeUndefined();
  });
});
