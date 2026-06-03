import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  convertDocument,
  DOC_DOMAIN,
  extractDocument,
  outlineDocument,
  searchDocument,
  summarizeDocument,
} from './index';

describe('doc domain', () => {
  it('declares document workflow commands', () => {
    expect(DOC_DOMAIN.name).toBe('doc');
    expect(DOC_DOMAIN.commands.map((command) => command.name)).toEqual([
      'summary',
      'extract',
      'convert',
      'outline',
      'search',
    ]);
  });

  it('summarizes a Markdown document', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-doc-'));
    const filePath = path.join(root, 'note.md');

    await writeFile(filePath, '# Title\n\nFirst line.\nSecond line.\n', 'utf8');

    try {
      await expect(summarizeDocument(filePath)).resolves.toMatchObject({
        status: 'ok',
        title: 'Title',
        wordCount: 5,
        summary: 'First line. Second line.',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('summarizes documents with a UTF-8 BOM', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-doc-'));
    const filePath = path.join(root, 'note.md');

    await writeFile(filePath, '\uFEFF# Demo\n\nHello world.\n', 'utf8');

    try {
      await expect(summarizeDocument(filePath)).resolves.toMatchObject({
        title: 'Demo',
        summary: 'Hello world.',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('extracts headings and links', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-doc-'));
    const filePath = path.join(root, 'note.md');

    await writeFile(
      filePath,
      '---\nauthor: team\n---\n# Title\n\nSee [docs](https://example.com).\n```ts\nx\n```\n',
      'utf8'
    );

    try {
      await expect(extractDocument(filePath)).resolves.toMatchObject({
        headings: ['Title'],
        links: ['https://example.com'],
        codeBlockCount: 1,
        frontmatter: {
          author: 'team',
        },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('creates a heading outline', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-doc-'));
    const filePath = path.join(root, 'note.md');

    await writeFile(filePath, '# Title\n\n## Step one\n\n### Detail\n', 'utf8');

    try {
      await expect(outlineDocument(filePath)).resolves.toMatchObject({
        outline: [
          {
            level: 1,
            title: 'Title',
            line: 1,
          },
          {
            level: 2,
            title: 'Step one',
            line: 3,
          },
          {
            level: 3,
            title: 'Detail',
            line: 5,
          },
        ],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('searches supported documents by keyword', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-doc-'));
    const filePath = path.join(root, 'note.md');

    await writeFile(filePath, '# Title\n\nInstall ZaoWu locally.\nRun tests.\n', 'utf8');

    try {
      await expect(searchDocument(filePath, 'zaowu')).resolves.toEqual({
        status: 'ok',
        filePath,
        keyword: 'zaowu',
        matches: [
          {
            line: 3,
            text: 'Install ZaoWu locally.',
          },
        ],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('previews document conversion without writing by default', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-doc-'));
    const filePath = path.join(root, 'note.md');
    const outputPath = path.join(root, 'note.txt');

    await writeFile(filePath, '# Title\n\nSee [docs](https://example.com).\n', 'utf8');

    try {
      await expect(convertDocument(filePath, { outputPath })).resolves.toMatchObject({
        status: 'preview',
        format: 'text',
        wroteFile: false,
        content: 'Title\n\nSee docs.\n',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects unsupported document formats', async () => {
    await expect(summarizeDocument('report.pdf')).rejects.toThrow(
      'Document format is not supported yet.'
    );
  });
});
