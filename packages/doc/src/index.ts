import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stripUtf8Bom, type DomainDefinition } from '@zaowu/core';
import { ZaoWuError } from '@zaowu/core';

export interface DocumentSummary {
  status: 'ok';
  filePath: string;
  title: string;
  lineCount: number;
  wordCount: number;
  summary: string;
}

export interface DocumentExtract {
  status: 'ok';
  filePath: string;
  headings: string[];
  links: string[];
  codeBlockCount: number;
  frontmatter: Record<string, string>;
}

export interface DocumentConversion {
  status: 'ok' | 'preview';
  inputPath: string;
  outputPath?: string;
  format: 'markdown' | 'text';
  content: string;
  wroteFile: boolean;
}

export interface DocumentOutlineItem {
  level: number;
  title: string;
  line: number;
}

export interface DocumentOutline {
  status: 'ok';
  filePath: string;
  outline: DocumentOutlineItem[];
}

export interface DocumentSearchMatch {
  line: number;
  text: string;
}

export interface DocumentSearchResult {
  status: 'ok';
  filePath: string;
  keyword: string;
  matches: DocumentSearchMatch[];
}

export const DOC_DOMAIN: DomainDefinition = {
  name: 'doc',
  summary: 'Document workflows for summary, extraction, and conversion',
  commands: [
    {
      name: 'summary',
      summary: 'Summarize a document',
      status: 'available',
    },
    {
      name: 'extract',
      summary: 'Extract structured content from a document',
      status: 'available',
    },
    {
      name: 'convert',
      summary: 'Convert a document with explicit output control',
      status: 'available',
      sensitive: true,
    },
    {
      name: 'outline',
      summary: 'Create an outline from document headings',
      status: 'available',
    },
    {
      name: 'search',
      summary: 'Search a supported document for a keyword',
      status: 'available',
    },
  ],
};

const SUPPORTED_TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.json',
  '.yml',
  '.yaml',
]);

const assertSupportedDocument = (filePath: string): void => {
  const extension = path.extname(filePath).toLowerCase();

  if (!SUPPORTED_TEXT_EXTENSIONS.has(extension)) {
    throw new ZaoWuError({
      code: 'DOCUMENT_FORMAT_UNSUPPORTED',
      message: 'Document format is not supported yet.',
      why: `This first version reads text and Markdown-like files. It cannot parse \`${extension || 'unknown'}\` files yet.`,
      fix: 'Convert the file to `.txt` or `.md`, or add a parser inside `packages/doc` before using this format.',
    });
  }
};

const readTextDocument = async (filePath: string): Promise<string> => {
  assertSupportedDocument(filePath);

  try {
    return stripUtf8Bom(await readFile(filePath, 'utf8'));
  } catch {
    throw new ZaoWuError({
      code: 'DOCUMENT_READ_FAILED',
      message: 'Could not read document.',
      why: `ZaoWu tried to read \`${filePath}\`, but the file was not readable.`,
      fix: 'Check the path and file permissions, then run the command again.',
    });
  }
};

const getTitle = (content: string, filePath: string): string => {
  const heading = content
    .split(/\r?\n/)
    .map((line) => /^#\s+(.+)$/.exec(line.trim())?.[1])
    .find((value): value is string => Boolean(value));

  return heading ?? path.basename(filePath);
};

const getWords = (content: string): string[] => content.match(/[\p{L}\p{N}_-]+/gu) ?? [];

const getFirstMeaningfulLines = (content: string, count: number): string[] =>
  content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .slice(0, count);

const getFrontmatter = (content: string): Record<string, string> => {
  const lines = content.split(/\r?\n/);

  if (lines[0] !== '---') {
    return {};
  }

  const endIndex = lines.slice(1).findIndex((line) => line === '---');

  if (endIndex < 0) {
    return {};
  }

  const frontmatter: Record<string, string> = {};

  for (const line of lines.slice(1, endIndex + 1)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.+)$/.exec(line);

    if (match) {
      frontmatter[match[1]] = match[2].trim();
    }
  }

  return frontmatter;
};

const getOutline = (content: string): DocumentOutlineItem[] =>
  content
    .split(/\r?\n/)
    .map((line, index) => {
      const match = /^(#{1,6})\s+(.+)$/.exec(line.trim());

      return match
        ? {
            level: match[1].length,
            title: match[2].trim(),
            line: index + 1,
          }
        : null;
    })
    .filter((item): item is DocumentOutlineItem => Boolean(item));

export const summarizeDocument = async (filePath: string): Promise<DocumentSummary> => {
  const content = await readTextDocument(filePath);
  const lines = content.split(/\r?\n/);
  const words = getWords(content);
  const summaryLines = getFirstMeaningfulLines(content, 3);

  return {
    status: 'ok',
    filePath,
    title: getTitle(content, filePath),
    lineCount: lines.length,
    wordCount: words.length,
    summary: summaryLines.length > 0 ? summaryLines.join(' ') : 'No summary text found.',
  };
};

export const extractDocument = async (filePath: string): Promise<DocumentExtract> => {
  const content = await readTextDocument(filePath);
  const headings = [...content.matchAll(/^#{1,6}\s+(.+)$/gmu)].map((match) => match[1].trim());
  const links = [...content.matchAll(/\[[^\]]+\]\(([^)]+)\)/gmu)].map((match) => match[1].trim());
  const codeBlockCount = [...content.matchAll(/^```/gmu)].length / 2;

  return {
    status: 'ok',
    filePath,
    headings,
    links,
    codeBlockCount: Math.floor(codeBlockCount),
    frontmatter: getFrontmatter(content),
  };
};

export const outlineDocument = async (filePath: string): Promise<DocumentOutline> => {
  const content = await readTextDocument(filePath);

  return {
    status: 'ok',
    filePath,
    outline: getOutline(content),
  };
};

export const searchDocument = async (
  filePath: string,
  keyword: string
): Promise<DocumentSearchResult> => {
  const trimmedKeyword = keyword.trim();

  if (!trimmedKeyword) {
    throw new ZaoWuError({
      code: 'DOCUMENT_SEARCH_KEYWORD_REQUIRED',
      message: 'Search keyword is required.',
      why: '`zw doc search` needs a non-empty keyword.',
      fix: 'Run `zw doc search README.md install`.',
    });
  }

  const content = await readTextDocument(filePath);
  const lowerKeyword = trimmedKeyword.toLowerCase();
  const matches = content
    .split(/\r?\n/)
    .map((line, index) => ({
      line: index + 1,
      text: line.trim(),
    }))
    .filter((match) => match.text.toLowerCase().includes(lowerKeyword));

  return {
    status: 'ok',
    filePath,
    keyword: trimmedKeyword,
    matches,
  };
};

export const convertDocument = async (
  inputPath: string,
  options: { outputPath?: string; format?: 'markdown' | 'text'; yes?: boolean } = {}
): Promise<DocumentConversion> => {
  const content = await readTextDocument(inputPath);
  const format =
    options.format ??
    (path.extname(options.outputPath ?? '').toLowerCase() === '.txt' ? 'text' : 'markdown');
  const converted =
    format === 'text'
      ? content.replace(/^#{1,6}\s+/gmu, '').replace(/\[([^\]]+)\]\([^)]+\)/gmu, '$1')
      : content;

  if (options.outputPath && options.yes) {
    await writeFile(options.outputPath, converted, 'utf8');
  }

  return {
    status: options.outputPath && !options.yes ? 'preview' : 'ok',
    inputPath,
    outputPath: options.outputPath,
    format,
    content: converted,
    wroteFile: Boolean(options.outputPath && options.yes),
  };
};
