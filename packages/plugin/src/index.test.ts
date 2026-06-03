import { describe, expect, it } from 'vitest';
import { PLUGIN_DOMAIN } from './index';

describe('plugin domain', () => {
  it('declares plugin workflow commands', () => {
    expect(PLUGIN_DOMAIN.name).toBe('plugin');
    expect(PLUGIN_DOMAIN.commands.map((command) => command.name)).toEqual([
      'list',
      'install',
      'remove',
    ]);
  });
});
