import { describe, expect, it } from 'vitest';
import { DEV_DOMAIN } from './index';

describe('dev domain', () => {
  it('declares developer workflow commands', () => {
    expect(DEV_DOMAIN.name).toBe('dev');
    expect(DEV_DOMAIN.commands.map((command) => command.name)).toEqual(['commit', 'review']);
  });
});
