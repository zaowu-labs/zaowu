import type { DevDiffHunk } from './contracts.js';

export interface ParsedDiffHunk extends DevDiffHunk {
  addedText: string[];
  addedLineNumbers: number[];
  shownNewLines: number;
}

const decodeDiffPath = (value: string): string => {
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
  return decoded;
};

const stripDiffPath = (value: string): string =>
  value.startsWith('"')
    ? decodeDiffPath(value).replace(/^[ab]\//, '')
    : decodeDiffPath(value.replace(/^[ab]\//, ''));

const readMatchingHeaderPath = (header: string): string => {
  // A binary or mode-only change can have just the two paths in the diff
  // header. Equal paths have equal encoded lengths even when they contain spaces.
  const separator = Math.floor(header.length / 2);
  const oldPath = header.slice(0, separator);
  const newPath = header.slice(separator + 1);
  if (header[separator] !== ' ' || !/^"?a\//.test(oldPath) || !/^"?b\//.test(newPath)) return '';
  const decoded = stripDiffPath(newPath);
  return decoded === stripDiffPath(oldPath) ? decoded : '';
};

export const parseGitPatch = (diff: string) => {
  const files = new Set<string>();
  const hunks: ParsedDiffHunk[] = [];
  let currentFile = '';
  let confirmedFile = '';
  let currentHunk: ParsedDiffHunk | undefined;
  const lines = diff.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      if (confirmedFile) files.add(confirmedFile);
      confirmedFile = readMatchingHeaderPath(line.slice('diff --git '.length));
      const fileMatch = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
      currentFile = confirmedFile || (fileMatch ? decodeDiffPath(fileMatch[2]) : '');
      currentHunk = undefined;
      continue;
    }
    if (!currentHunk && line.startsWith('+++ ') && line.slice(4) !== '/dev/null') {
      currentFile = stripDiffPath(line.slice(4).replace(/\t$/, ''));
      confirmedFile = currentFile;
      continue;
    }
    if (!currentHunk && line.startsWith('--- ') && line.slice(4) !== '/dev/null') {
      currentFile = stripDiffPath(line.slice(4).replace(/\t$/, ''));
      confirmedFile = currentFile;
      continue;
    }

    if (!currentHunk) {
      const destination = /^(?:rename|copy) to (.+)$/.exec(line);
      if (destination) {
        currentFile = decodeDiffPath(destination[1]);
        confirmedFile = currentFile;
        continue;
      }
    }

    const hunkMatch = /^@@\s+-(?:\d+)(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/.exec(line);

    if (hunkMatch && currentFile) {
      const startLine = Number.parseInt(hunkMatch[1], 10);
      const lineCount = Number.parseInt(hunkMatch[2] ?? '1', 10);
      currentHunk = {
        filePath: currentFile,
        header: hunkMatch[0],
        addedLines: 0,
        removedLines: 0,
        startLine,
        endLine: Math.max(startLine, startLine + lineCount - 1),
        addedText: [],
        addedLineNumbers: [],
        shownNewLines: 0,
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
      currentHunk.addedLineNumbers.push(currentHunk.startLine + currentHunk.shownNewLines);
      currentHunk.shownNewLines += 1;
      continue;
    }

    if (line.startsWith('-')) {
      currentHunk.removedLines += 1;
      continue;
    }

    if (line.startsWith(' ') || line === '') {
      currentHunk.shownNewLines += 1;
    }
  }

  if (confirmedFile) files.add(confirmedFile);
  return { files: [...files], hunks };
};
