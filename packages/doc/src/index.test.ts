import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  convertDocument,
  DOC_DOMAIN,
  extractDocument,
  outlineDocument,
  searchDocument,
  summarizeDocument,
} from './index';

const escapeXml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const writeDocxFixture = async (filePath: string, text: string): Promise<void> => {
  const zip = new JSZip();
  const relationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.folder('_rels')?.file('.rels', relationships);
  zip.folder('word')?.file(
    'document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>${escapeXml(text)}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`
  );

  await writeFile(filePath, await zip.generateAsync({ type: 'nodebuffer' }));
};

const escapePdfText = (value: string): string => value.replace(/[\\()]/g, '\\$&');

const createPdfFixture = (text: string): Buffer => {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];
  const stream = `BT\n/F1 18 Tf\n72 720 Td\n(${escapePdfText(text)}) Tj\nET`;

  objects.push(
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream\nendobj\n`
  );

  let output = '%PDF-1.4\n';
  const offsets = [0];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(output, 'ascii'));
    output += object;
  }

  const xrefOffset = Buffer.byteLength(output, 'ascii');
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

  for (const offset of offsets.slice(1)) {
    output += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }

  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(output, 'ascii');
};

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

  it('summarizes empty supported documents without failing', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-doc-'));
    const filePath = path.join(root, 'empty.txt');

    await writeFile(filePath, '', 'utf8');

    try {
      await expect(summarizeDocument(filePath)).resolves.toEqual({
        status: 'ok',
        filePath,
        title: 'empty.txt',
        lineCount: 1,
        wordCount: 0,
        summary: 'No summary text found.',
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

  it('rejects empty document search keywords', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-doc-'));
    const filePath = path.join(root, 'note.md');

    await writeFile(filePath, '# Title\n\nInstall ZaoWu locally.\n', 'utf8');

    try {
      await expect(searchDocument(filePath, '   ')).rejects.toThrow('Search keyword is required.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reads real PDF text content', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-doc-'));
    const filePath = path.join(root, 'fixture.pdf');

    await writeFile(filePath, createPdfFixture('ZaoWu PDF Fixture'));

    try {
      await expect(searchDocument(filePath, 'fixture')).resolves.toMatchObject({
        status: 'ok',
        matches: expect.arrayContaining([
          {
            line: 1,
            text: 'ZaoWu PDF Fixture',
          },
        ]),
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);

  it('reads real DOCX text content', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-doc-'));
    const filePath = path.join(root, 'fixture.docx');

    await writeDocxFixture(filePath, 'ZaoWu DOCX Fixture');

    try {
      await expect(summarizeDocument(filePath)).resolves.toMatchObject({
        status: 'ok',
        title: 'fixture.docx',
        summary: 'ZaoWu DOCX Fixture',
      });
      await expect(searchDocument(filePath, 'docx')).resolves.toMatchObject({
        matches: [
          {
            line: 1,
            text: 'ZaoWu DOCX Fixture',
          },
        ],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects damaged PDF and DOCX files consistently', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-doc-'));
    const pdfPath = path.join(root, 'damaged.pdf');
    const docxPath = path.join(root, 'damaged.docx');

    await writeFile(pdfPath, 'not a pdf', 'utf8');
    await writeFile(docxPath, 'not a docx', 'utf8');

    try {
      await expect(summarizeDocument(pdfPath)).rejects.toThrow('Could not read document.');
      await expect(summarizeDocument(docxPath)).rejects.toThrow('Could not read document.');
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

  it('writes converted documents only after confirmation', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-doc-'));
    const filePath = path.join(root, 'note.md');
    const outputPath = path.join(root, 'note.txt');

    await writeFile(filePath, '# Title\n\nSee [docs](https://example.com).\n', 'utf8');

    try {
      await expect(convertDocument(filePath, { outputPath, yes: true })).resolves.toMatchObject({
        status: 'ok',
        outputPath,
        format: 'text',
        wroteFile: true,
        content: 'Title\n\nSee docs.\n',
      });
      await expect(readFile(outputPath, 'utf8')).resolves.toBe('Title\n\nSee docs.\n');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('refuses to overwrite document inputs or existing outputs', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-doc-'));
    const filePath = path.join(root, 'note.md');
    const outputPath = path.join(root, 'note.txt');

    await writeFile(filePath, '# Title\n\nBody.\n', 'utf8');
    await writeFile(outputPath, 'existing', 'utf8');

    try {
      await expect(convertDocument(filePath, { outputPath: filePath, yes: true })).rejects.toThrow(
        'Document output path conflicts with input path.'
      );
      await expect(convertDocument(filePath, { outputPath, yes: true })).rejects.toThrow(
        'Document output file already exists.'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects unsupported document formats', async () => {
    await expect(summarizeDocument('slides.pptx')).rejects.toThrow(
      'Document format is not supported yet.'
    );
  });
});
