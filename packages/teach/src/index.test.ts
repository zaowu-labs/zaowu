import { describe, expect, it } from 'vitest';
import { TEACH_DOMAIN } from './index';

describe('teach domain', () => {
  it('declares teaching workflow commands', () => {
    expect(TEACH_DOMAIN.name).toBe('teach');
    expect(TEACH_DOMAIN.commands.map((command) => command.name)).toEqual(['plan', 'quiz']);
  });
});
