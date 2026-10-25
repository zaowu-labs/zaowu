import { describe, expect, it } from 'vitest';
import { escapeJSONControls, escapeTerminalText } from './terminal';

describe('terminal display text', () => {
  it('uses JSON unicode escapes without changing parsed values', () => {
    const value = { text: 'Keep \u009d and \u202e' };
    const rendered = escapeJSONControls(JSON.stringify(value));
    expect(rendered).not.toContain('\u009d');
    expect(rendered).toContain('\\u009d');
    expect(JSON.parse(rendered)).toEqual(value);
  });
  it('preserves readable Unicode, tabs, and line breaks', () => {
    expect(escapeTerminalText('造物 🛠️\nName\tValue')).toBe('造物 🛠️\nName\tValue');
  });
  it('exposes directional overrides rather than disguising a target name', () => {
    expect(escapeTerminalText('report\u202Etxt.exe\u2069')).toBe('report\\u202etxt.exe\\u2069');
  });
});
