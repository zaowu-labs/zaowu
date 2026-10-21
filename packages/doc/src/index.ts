import path from 'node:path';
import { extractDocx } from './docx.js';
import { extractPdf } from './pdf.js';
import { scanMarkdown } from './markdown.js';
import {
  assertSafeOutputPath,
  createCapabilityLedger,
  stripUtf8Bom,
  readBoundedFile,
  writeTextFileExclusive,
  ZaoWuError,
  type DomainDefinition,
} from '@zaowu-labs/core';

export interface DocumentSummary {
  method: 'extractive';
  schemaVersion: 1;
  status: 'ok';
  filePath: string;
  title: string;
  lineCount: number;
  wordCount: number;
  summary: string;
}

export interface DocumentExtract {
  schemaVersion: 1;
  status: 'ok';
  filePath: string;
  headings: string[];
  links: string[];
  codeBlockCount: number;
  frontmatter: Record<string, string>;
}

export interface DocumentConversion {
  schemaVersion: 1;
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
  schemaVersion: 1;
  status: 'ok';
  filePath: string;
  outline: DocumentOutlineItem[];
}

export interface DocumentSearchMatch {
  line: number;
  text: string;
}

export interface DocumentSearchResult {
  schemaVersion: 1;
  status: 'ok';
  filePath: string;
  keyword: string;
  matches: DocumentSearchMatch[];
}

export const DOC_DOMAIN: DomainDefinition = {
  name: 'doc',
  summary: 'Document workflows for summary, extraction, and conversion',
  capabilities: createCapabilityLedger({
    readsFiles: true,
    writesFiles: true,
  }),
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
  '.pdf',
  '.docx',
  '.html',
  '.htm',
]);

const assertSupportedDocument = (filePath: string): void => {
  const extension = path.extname(filePath).toLowerCase();

  if (!SUPPORTED_TEXT_EXTENSIONS.has(extension)) {
    throw new ZaoWuError({
      code: 'DOCUMENT_FORMAT_UNSUPPORTED',
      message: 'Document format is not supported yet.',
      why: `ZaoWu can read text, Markdown-like, PDF, DOCX, and HTML files. It cannot parse \`${extension || 'unknown'}\` files yet.`,
      fix: 'Use `.txt`, `.md`, `.pdf`, `.docx`, `.html`, or `.htm`, or add a parser inside `packages/doc` before using this format.',
    });
  }
};

const stripHtmlBlocks = (html: string): string => {
  const uncommented: string[] = [];
  let cursor = 0;
  while (true) {
    const start = html.indexOf('<!--', cursor);
    if (start < 0) {
      uncommented.push(html.slice(cursor));
      break;
    }
    uncommented.push(html.slice(cursor, start));
    const end = html.indexOf('-->', start + 4);
    if (end < 0) break;
    cursor = end + 3;
  }
  const content = uncommented.join('');
  const chunks: string[] = [];
  const open = /<(head|script|style)\b[^<>]*>/gi;
  cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = open.exec(content))) {
    chunks.push(content.slice(cursor, match.index));
    const close = new RegExp(`</${match[1]}\\s*>`, 'gi');
    close.lastIndex = open.lastIndex;
    const end = close.exec(content);
    cursor = end ? close.lastIndex : content.length;
    open.lastIndex = cursor;
    if (!end) break;
  }
  chunks.push(content.slice(cursor));
  return chunks.join('');
};

const stripHtmlTags = (html: string): string => {
  let clean = stripHtmlBlocks(html);
  clean = clean.replace(
    /<h([1-6])\b[^<>]*>/gi,
    (_match, level: string) => `${'#'.repeat(Number(level))} `
  );
  clean = clean.replace(/<\/h[1-6]>\s*/gi, '\n');
  clean = clean.replace(/<\/t[dh]>\s*/gi, ' | ');
  clean = clean.replace(/<\/tr>\s*/gi, '\n');
  clean = clean.replace(/<\/(p|div|li)>\s*/gi, '\n');
  clean = clean.replace(/<br\s*\/?>\s*/gi, '\n');
  clean = clean.replace(/<[^<>]*>/g, ' ');
  const decodeCodePoint = (match: string, codePoint: number): string => {
    if (!Number.isInteger(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) {
      return match;
    }

    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return match;
    }
  };

  // Decode numeric entities generically, then named entities. `&amp;` is
  // decoded last so `&amp;#60;` stays literal text instead of becoming `<`.
  clean = clean
    .replaceAll('&nbsp;', ' ')
    .replace(/&#x([0-9a-f]+);/gi, (match, hex: string) =>
      decodeCodePoint(match, Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (match, decimal: string) =>
      decodeCodePoint(match, Number.parseInt(decimal, 10))
    )
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
  return clean
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/\s+\|\s*$/g, '')
        .replace(/\s+\|\s+/g, ' | ')
        .trim()
    )
    .filter((line, idx, arr) => line || (idx > 0 && arr[idx - 1]))
    .join('\n')
    .trim();
};

const readTextDocument = async (
  filePath: string,
  format?: 'markdown' | 'text'
): Promise<string> => {
  assertSupportedDocument(filePath);
  const extension = path.extname(filePath).toLowerCase();

  const buffer = await readBoundedFile(filePath, 20 * 1024 * 1024, {
    failed: {
      code: 'DOCUMENT_READ_FAILED',
      message: 'Could not read document.',
      why: `ZaoWu could not read \`${filePath}\` as a regular file.`,
      fix: 'Check the path and file permissions, then run the command again.',
    },
    tooLarge: {
      code: 'DOCUMENT_INPUT_TOO_LARGE',
      message: 'Document is too large to extract safely.',
      why: 'Document inputs are limited to 20 MiB.',
      fix: 'Split the document or export a smaller text-only copy.',
    },
  });
  try {
    let content: string;
    if (extension === '.pdf') content = await extractPdf(buffer);
    else if (extension === '.docx') content = await extractDocx(buffer, format ?? 'markdown');
    else if (extension === '.html' || extension === '.htm')
      content = stripHtmlTags(buffer.toString('utf8'));
    else content = buffer.toString('utf8');
    if (content.length > 2_000_000) {
      throw new ZaoWuError({
        code: 'DOCUMENT_INPUT_TOO_LARGE',
        message: 'Extracted document text is too large.',
        why: 'Extracted text exceeds two million characters.',
        fix: 'Split the document into smaller parts.',
      });
    }
    if (extension === '.pdf' && !content.replace(/-- \d+ of \d+ --/g, '').trim()) {
      throw new ZaoWuError({
        code: 'DOCUMENT_TEXT_UNAVAILABLE',
        message: 'PDF has no extractable text.',
        why: 'The PDF may contain scanned images rather than a text layer. ZaoWu does not perform OCR.',
        fix: 'Run OCR in your PDF editor and export a searchable PDF or text file, then try again.',
      });
    }
    return stripUtf8Bom(content);
  } catch (error) {
    if (error instanceof ZaoWuError) throw error;
    throw new ZaoWuError({
      code: 'DOCUMENT_READ_FAILED',
      message: 'Could not read document.',
      why: `ZaoWu could not extract text from \`${filePath}\`. The file may be corrupt, encrypted, or contain unsupported document structures.`,
      fix: 'Open the file in its original editor, remove password protection if appropriate, and re-export it as PDF, DOCX, or plain text.',
    });
  }
};

const assertSafeDocumentOutputPath = (inputPath: string, outputPath: string): Promise<void> =>
  assertSafeOutputPath(inputPath, outputPath, {
    inputConflict: {
      code: 'DOCUMENT_OUTPUT_CONFLICT',
      message: 'Document output path conflicts with input path.',
      why: '`zw doc convert` refuses to overwrite the input document.',
      fix: 'Choose a different `--output` path.',
    },
    alreadyExists: {
      code: 'DOCUMENT_OUTPUT_CONFLICT',
      message: 'Document output file already exists.',
      why: `ZaoWu will not silently overwrite \`${outputPath}\`.`,
      fix: 'Choose a new `--output` path, or remove the existing file yourself first.',
    },
  });

const getTitle = (content: string, filePath: string): string =>
  parseHeadings(content).find((heading) => heading.level === 1)?.title ?? path.basename(filePath);

const getWords = (content: string): string[] => content.match(/[\p{L}\p{N}_-]+/gu) ?? [];

const getFirstMeaningfulLines = (content: string, count: number): string[] =>
  scanMarkdown(content).prose.slice(0, count);

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

const parseHeadings = (content: string): DocumentOutlineItem[] => scanMarkdown(content).headings;

export const summarizeDocument = async (filePath: string): Promise<DocumentSummary> => {
  const content = await readTextDocument(filePath);
  const lines = content.split(/\r?\n/);
  const words = getWords(content);
  const summaryLines = getFirstMeaningfulLines(content, 3);

  return {
    schemaVersion: 1,
    status: 'ok',
    filePath,
    method: 'extractive',
    title: getTitle(content, filePath),
    lineCount: lines.length,
    wordCount: words.length,
    summary: summaryLines.length > 0 ? summaryLines.join(' ') : 'No summary text found.',
  };
};

export const extractDocument = async (filePath: string): Promise<DocumentExtract> => {
  const content = await readTextDocument(filePath);
  const scan = scanMarkdown(content);
  const headings = scan.headings.map((heading) => heading.title);
  const links = [...content.matchAll(/(?<!\\)\[(?:\\.|[^[\]\\])+\]\(([^)]+)\)/gmu)].map((match) =>
    match[1].trim()
  );
  const codeBlockCount = scan.codeBlockCount;

  return {
    schemaVersion: 1,
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
    schemaVersion: 1,
    status: 'ok',
    filePath,
    outline: parseHeadings(content),
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
    schemaVersion: 1,
    status: 'ok',
    filePath,
    keyword: trimmedKeyword,
    matches,
  };
};

export const convertDocument = async (
  inputPath: string,
  options: {
    outputPath?: string;
    format?: 'markdown' | 'text';
    yes?: boolean;
    expectedContent?: string;
  } = {}
): Promise<DocumentConversion> => {
  const format =
    options.format ??
    (path.extname(options.outputPath ?? '').toLowerCase() === '.txt' ? 'text' : 'markdown');
  const content = await readTextDocument(inputPath, format);
  const converted =
    format === 'text' &&
    ['.md', '.markdown', '.html', '.htm'].includes(path.extname(inputPath).toLowerCase())
      ? content
          .replace(/^#{1,6}\s+/gmu, '')
          .replace(/(?<!\\)\[([^[\]\r\n]+)\]\([^)\r\n]+\)/gmu, '$1')
      : content;

  if (options.outputPath && options.yes) {
    if (options.expectedContent !== undefined && converted !== options.expectedContent)
      throw new ZaoWuError({
        code: 'OPERATION_PLAN_MISMATCH',
        message: 'Document content changed after plan verification.',
        why: 'The converted output no longer matches the content authorized by the operation plan. No file was written.',
        fix: 'Run the preview again and confirm its new fingerprint.',
      });
    await assertSafeDocumentOutputPath(inputPath, options.outputPath);
    await writeTextFileExclusive(options.outputPath, converted, {
      exists: {
        code: 'DOCUMENT_OUTPUT_CONFLICT',
        message: 'Document output file already exists.',
        why: `ZaoWu will not silently overwrite \`${options.outputPath}\`.`,
        fix: 'Choose a new `--output` path, or remove the existing file yourself first.',
      },
      failed: {
        code: 'DOCUMENT_WRITE_FAILED',
        message: 'Could not write converted document.',
        why: `ZaoWu tried to write \`${options.outputPath}\`, but the file system rejected the write.`,
        fix: 'Check the output directory and permissions, then run the command again.',
      },
    });
  }

  return {
    schemaVersion: 1,
    status: options.outputPath && !options.yes ? 'preview' : 'ok',
    inputPath,
    outputPath: options.outputPath,
    format,
    content: converted,
    wroteFile: Boolean(options.outputPath && options.yes),
  };
};
