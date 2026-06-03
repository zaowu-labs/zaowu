import { describe, expect, it } from 'vitest';
import { DOC_DOMAIN } from './index';

describe('doc domain', () => {
  it('declares document workflow commands', () => {
    expect(DOC_DOMAIN.name).toBe('doc');
    expect(DOC_DOMAIN.commands.map((command) => command.name)).toEqual([
      'summary',
      'extract',
      'convert',
    ]);
  });
});
