import { describe, expect, it } from 'vitest';
import { AUTO_DOMAIN } from './index';

describe('auto domain', () => {
  it('declares automation workflow commands', () => {
    expect(AUTO_DOMAIN.name).toBe('auto');
    expect(AUTO_DOMAIN.commands.map((command) => command.name)).toEqual(['validate', 'run']);
  });
});
