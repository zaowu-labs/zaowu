import { describe, expect, it } from 'vitest';
import { DATA_DOMAIN } from './index';

describe('data domain', () => {
  it('declares data workflow commands', () => {
    expect(DATA_DOMAIN.name).toBe('data');
    expect(DATA_DOMAIN.commands.map((command) => command.name)).toEqual([
      'inspect',
      'analyze',
      'clean',
    ]);
  });
});
