import type { DevDiffHunk } from './contracts.js';

export interface ParsedDiffHunk extends DevDiffHunk {
  addedText: string[];
  addedLineNumbers: number[];
}

const stripDiffPath = (value: string): string => {
  let decoded = value;
  if (value.startsWith('"') && value.endsWith('"')) {
    const bytes: number[] = [];
    const raw = value.slice(1, -1);
    for (let index = 0; index < raw.length; ) {
      if (raw[index] === '\\') {
        const octal = /^[0-7]{1,3}/.exec(raw.slice(index + 1));
        if (octal) {
          bytes.push(Number.parseInt(octal[0], 8));
          index += octal[0].length + 1;
          continue;
        }
        const escapes: Record<string, string> = {
          n: '\n',
          t: '\t',
          r: '\r',
          b: '\b',
          f: '\f',
          v: '\v',
          a: '\x07',
        };
        bytes.push(...Buffer.from(escapes[raw[index + 1]] ?? raw[index + 1] ?? ''));
        index += 2;
      } else {
        const character = String.fromCodePoint(raw.codePointAt(index)!);
        bytes.push(...Buffer.from(character));
        index += character.length;
      }
    }
    decoded = Buffer.from(bytes).toString('utf8');
  }
  return decoded.replace(/^[ab]\//, '');
};

export const parseDiffHunks = (diff: string): ParsedDiffHunk[] => {
  const hunks: ParsedDiffHunk[] = [];
  let currentFile = '';
  let currentHunk: ParsedDiffHunk | undefined;
  let currentNewLine = 0;

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('diff --git ')) {
      const fileMatch = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
      currentFile = fileMatch ? stripDiffPath(fileMatch[2]) : '';
      currentHunk = undefined;
      currentNewLine = 0;
      continue;
    }
    if (!currentHunk && line.startsWith('+++ ') && line.slice(4) !== '/dev/null') {
      currentFile = stripDiffPath(line.slice(4).replace(/\t$/, ''));
      continue;
    }
    if (!currentHunk && line.startsWith('--- ') && line.slice(4) !== '/dev/null') {
      currentFile = stripDiffPath(line.slice(4).replace(/\t$/, ''));
      continue;
    }

    const hunkMatch = /^@@\s+-(?:\d+)(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/.exec(line);

    if (hunkMatch && currentFile) {
      const startLine = Number.parseInt(hunkMatch[1], 10);
      const lineCount = Number.parseInt(hunkMatch[2] ?? '1', 10);
      currentNewLine = startLine;
      currentHunk = {
        filePath: currentFile,
        header: hunkMatch[0],
        addedLines: 0,
        removedLines: 0,
        startLine,
        endLine: Math.max(startLine, startLine + lineCount - 1),
        addedText: [],
        addedLineNumbers: [],
      };
      hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) {
      continue;
    }

    if (line.startsWith('\\ No newline at end of file')) {
      continue;
    }

    if (line.startsWith('+')) {
      currentHunk.addedLines += 1;
      currentHunk.addedText.push(line.slice(1));
      currentHunk.addedLineNumbers.push(currentNewLine);
      currentNewLine += 1;
      continue;
    }

    if (line.startsWith('-')) {
      currentHunk.removedLines += 1;
      continue;
    }

    currentNewLine += 1;
  }

  return hunks;
};
