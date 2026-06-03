import { describe, expect, it } from 'vitest';
import { createCapabilityLedger, findDomainCommand, type DomainDefinition } from './index';

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

  it('allows domains to declare capability ledgers', () => {
    const domain: DomainDefinition = {
      name: 'web',
      summary: 'Web workflows',
      capabilities: createCapabilityLedger({
        usesNetwork: true,
      }),
      commands: [],
    };

    expect(domain.capabilities?.usesNetwork).toBe(true);
    expect(domain.capabilities?.writesFiles).toBe(false);
  });
});
