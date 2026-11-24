import { describe, expect, it } from 'vitest';
import { decodeTextBytes, stripUtf8Bom } from './text';

describe('text utilities', () => {
  it('strips a UTF-8 BOM from the start of text', () => {
    expect(stripUtf8Bom('\uFEFFname: demo')).toBe('name: demo');
  });

  it('leaves non-BOM text unchanged', () => {
    expect(stripUtf8Bom('name: demo')).toBe('name: demo');
  });

  it('strips exactly one encoding mark unless the caller preserves it', () => {
    const text = '\uFEFF\uFEFF🌱';
    for (const bytes of [
      Buffer.from(text),
      Buffer.from(text, 'utf16le'),
      Buffer.from(text, 'utf16le').swap16(),
    ]) {
      const error = { code: 'DOCUMENT_READ_FAILED', message: 'Invalid text.' } as const;
      expect(decodeTextBytes(bytes, error)).toBe(text.slice(1));
      expect(decodeTextBytes(bytes, error, { preserveBom: true })).toBe(text);
    }
  });
});
