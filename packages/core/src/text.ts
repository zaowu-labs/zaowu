export const stripUtf8Bom = (content: string): string =>
  content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
