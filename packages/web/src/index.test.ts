import { describe, expect, it } from 'vitest';
import { WEB_DOMAIN } from './index';

describe('web domain', () => {
  it('declares web workflow commands', () => {
    expect(WEB_DOMAIN.name).toBe('web');
    expect(WEB_DOMAIN.commands.map((command) => command.name)).toEqual(['inspect', 'fetch']);
  });
});
