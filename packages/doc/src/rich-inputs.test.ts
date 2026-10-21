import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { afterEach, describe, expect, it } from 'vitest';
import { convertDocument, extractDocument, outlineDocument, summarizeDocument } from './index';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const fixture = async (body: string, parts: Record<string, string> = {}): Promise<string> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-rich-doc-'));
  roots.push(root);
  const file = path.join(root, 'report.docx');
  const zip = new JSZip();
  zip.file(
    'word/document.xml',
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}</w:body></w:document>`
  );
  for (const [name, content] of Object.entries(parts)) zip.file(name, content);
  await writeFile(file, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  return file;
};
const p = (text: string, properties = ''): string =>
  `<w:p>${properties}<w:r><w:t>${text}</w:t></w:r></w:p>`;

describe('bounded rich document extraction', () => {
  it('retains inherited headings, Unicode, safe links, lists, and tables in a real DOCX', async () => {
    const file = await fixture(
      [
        p('季度报告', '<w:pPr><w:pStyle w:val="CustomTitle"/></w:pPr>'),
        p(
          'First &amp; second',
          '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>'
        ),
        '<w:p><w:hyperlink r:id="safe"><w:r><w:t>文档</w:t></w:r></w:hyperlink><w:hyperlink r:id="unsafe"><w:r><w:t>unsafe label</w:t></w:r></w:hyperlink></w:p>',
        `<w:tbl><w:tr><w:tc>${p('Name')}</w:tc><w:tc>${p('Value')}</w:tc></w:tr><w:tr><w:tc>${p('A')}</w:tc><w:tc>${p('10')}</w:tc></w:tr></w:tbl>`,
        `<w:del>${p('DELETED')}</w:del>`,
      ].join(''),
      {
        'word/styles.xml':
          '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:styleId="Base"><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style><w:style w:styleId="CustomTitle"><w:basedOn w:val="Base"/></w:style></w:styles>',
        'word/numbering.xml':
          '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>',
        'word/_rels/document.xml.rels':
          '<Relationships><Relationship Id="safe" Type="relationships/hyperlink" TargetMode="External" Target="https://example.com/docs"/><Relationship Id="unsafe" Type="relationships/hyperlink" TargetMode="External" Target="javascript:alert(1)"/></Relationships>',
      }
    );
    const converted = await convertDocument(file);
    expect(converted.content).toContain('# 季度报告');
    expect(converted.content).toContain('- First & second');
    expect(converted.content).toContain('[文档](https://example.com/docs)');
    expect(converted.content).toContain('| Name | Value |\n| --- | --- |\n| A | 10 |');
    expect(converted.content).not.toMatch(/DELETED|javascript:/);
    await expect(outlineDocument(file)).resolves.toMatchObject({
      outline: [{ level: 1, title: '季度报告', line: 1 }],
    });
    await expect(extractDocument(file)).resolves.toMatchObject({
      links: ['https://example.com/docs'],
    });
    const text = await convertDocument(file, { format: 'text' });
    expect(text.content).toContain('Name\tValue\nA\t10');
    expect(text.content).not.toMatch(/# |\[文档\]|\| ---/);
  });

  it('handles long malformed HTML and Markdown without repeated delimiter rescanning', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-delimiters-'));
    roots.push(root);
    const html = path.join(root, 'malformed.html');
    await writeFile(html, '<'.repeat(250_000));
    expect((await convertDocument(html)).content.length).toBe(250_000);
    await writeFile(html, '<p>Visible</p>' + '<script>'.repeat(30_000));
    expect((await convertDocument(html)).content).toBe('Visible');
    const markdown = path.join(root, 'malformed.md');
    await writeFile(markdown, '['.repeat(250_000));
    await expect(extractDocument(markdown)).resolves.toMatchObject({ links: [] });
    expect((await convertDocument(markdown, { format: 'text' })).content.length).toBe(250_000);
  });

  it('does not treat literal Word text as Markdown headings or links', async () => {
    const file = await fixture(p('# Fake heading') + p('[fake](https://example.invalid)'));
    await expect(outlineDocument(file)).resolves.toMatchObject({ outline: [] });
    await expect(extractDocument(file)).resolves.toMatchObject({ links: [] });
  });

  it('supports arbitrary namespace prefixes and strict WordprocessingML', async () => {
    const file = await fixture('');
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      '<x:document xmlns:x="http://purl.oclc.org/ooxml/wordprocessingml/main"><x:body><x:p><x:pPr><x:pStyle x:val="Heading2"/></x:pPr><x:r><x:t>Strict</x:t></x:r></x:p></x:body></x:document>'
    );
    await writeFile(file, await zip.generateAsync({ type: 'nodebuffer' }));
    await expect(outlineDocument(file)).resolves.toMatchObject({
      outline: [{ level: 2, title: 'Strict' }],
    });
  });

  it.each(['<w:p><w:r></w:p>', '<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><w:p/>'])(
    'rejects malformed or DTD-bearing XML with re-export guidance',
    async (body) => {
      const file = await fixture(body);
      await expect(summarizeDocument(file)).rejects.toMatchObject({
        code: 'DOCUMENT_READ_FAILED',
        fix: expect.stringContaining('re-export'),
      });
    }
  );

  it('stops actual XML decompression before processing a compressed oversized part', async () => {
    const file = await fixture(p('a'.repeat(8 * 1024 * 1024)));
    await expect(summarizeDocument(file)).rejects.toMatchObject({
      code: 'DOCUMENT_INPUT_TOO_LARGE',
    });
  });

  it('rejects deeply nested content and oversized plain files', async () => {
    const file = await fixture('<w:sdt>'.repeat(110) + p('deep') + '</w:sdt>'.repeat(110));
    await expect(summarizeDocument(file)).rejects.toMatchObject({
      code: 'DOCUMENT_INPUT_TOO_LARGE',
    });
    const large = path.join(path.dirname(file), 'large.txt');
    const handle = await open(large, 'w');
    try {
      await handle.truncate(20 * 1024 * 1024 + 1);
    } finally {
      await handle.close();
    }
    await expect(summarizeDocument(large)).rejects.toMatchObject({
      code: 'DOCUMENT_INPUT_TOO_LARGE',
    });
  });

  it('rejects missing and directory inputs with path guidance', async () => {
    const file = await fixture(p('text'));
    await expect(summarizeDocument(`${file}.missing.txt`)).rejects.toMatchObject({
      code: 'DOCUMENT_READ_FAILED',
      fix: expect.stringContaining('path'),
    });
    const directory = path.join(path.dirname(file), 'folder.txt');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(directory);
    await expect(summarizeDocument(directory)).rejects.toMatchObject({
      code: 'DOCUMENT_READ_FAILED',
    });
  });
});
