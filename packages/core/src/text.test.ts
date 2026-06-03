import { describe, expect, it } from 'vitest';
import { stripUtf8Bom } from './text';

describe('text utilities', () => {
  it('strips a UTF-8 BOM from the start of text', () => {
    expect(stripUtf8Bom('\uFEFFname: demo')).toBe('name: demo');
  });

  it('leaves non-BOM text unchanged', () => {
    expect(stripUtf8Bom('name: demo')).toBe('name: demo');
  });
});
