export interface MarkdownScan {
  headings: Array<{ level: number; title: string; line: number }>;
  prose: string[];
  codeBlockCount: number;
}

/** Only real headings/prose participate: YAML metadata and fenced code do not. */
export const scanMarkdown = (content: string): MarkdownScan => {
  const result: MarkdownScan = { headings: [], prose: [], codeBlockCount: 0 };
  const lines = content.split(/\r?\n/);
  const frontmatterEnd = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  let fence: { marker: string; length: number } | undefined;
  for (let index = 0; index < lines.length; index++) {
    if (frontmatterEnd > 0 && index <= frontmatterEnd) continue;
    const line = lines[index];
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (
        marker &&
        marker[1][0] === fence.marker &&
        marker[1].length >= fence.length &&
        !marker[2].trim()
      )
        fence = undefined;
      continue;
    }
    if (marker) {
      fence = { marker: marker[1][0], length: marker[1].length };
      result.codeBlockCount++;
      continue;
    }
    if (/^(?: {4}|\t)/.test(line)) continue;
    const heading = /^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/.exec(line);
    if (heading)
      result.headings.push({ level: heading[1].length, title: heading[2].trim(), line: index + 1 });
    else if (line.trim()) result.prose.push(line.trim());
  }
  return result;
};
