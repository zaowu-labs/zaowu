import { ZaoWuError, type ZaoWuErrorOptions } from './errors.js';

export const stripUtf8Bom = (content: string): string =>
  content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;

/** Decode UTF-8 or BOM-marked UTF-16, rejecting malformed sequences and NULs. */
export const decodeTextBytes = (
  bytes: Uint8Array,
  error: ZaoWuErrorOptions,
  options: { preserveBom?: boolean } = {}
): string => {
  let encoding = 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be';
  try {
    const text = new TextDecoder(encoding, { fatal: true, ignoreBOM: options.preserveBom }).decode(
      bytes
    );
    if (!text.includes('\0')) return text;
  } catch {
    // Both malformed input and embedded NULs use the caller's recovery guidance.
  }
  throw new ZaoWuError(error);
};
