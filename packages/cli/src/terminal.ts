// Unicode control category covers C0/C1 without enumerating executable bytes.
const DISPLAY_CONTROLS = /[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu;

/** Display untrusted text without giving it control of a user's terminal. */
export const escapeTerminalText = (text: string): string =>
  text.replace(DISPLAY_CONTROLS, (character) => {
    if (character === '\n' || character === '\t') return character;
    const code = character.codePointAt(0)!;
    if (code === 13) return '\\r';
    return code <= 159
      ? `\\x${code.toString(16).padStart(2, '0')}`
      : `\\u${code.toString(16).padStart(4, '0')}`;
  });

/** Unicode escapes keep parsed JSON values intact while making display inert. */
export const escapeJSONControls = (json: string): string =>
  json.replace(DISPLAY_CONTROLS, (character) => {
    const code = character.codePointAt(0)!;
    // JSON.stringify already escapes C0 inside strings. Preserve formatting
    // whitespace outside strings, including pretty-printed JSON newlines.
    return code < 127 ? character : `\\u${code.toString(16).padStart(4, '0')}`;
  });
