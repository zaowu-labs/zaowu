/* global console */
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliEntry = path.join(root, 'packages', 'cli', 'dist', 'index.js');
const scratch = mkdtempSync(path.join(tmpdir(), 'zaowu-rich-fixtures-'));
const dataRequire = createRequire(path.join(root, 'packages', 'data', 'package.json'));
const docRequire = createRequire(path.join(root, 'packages', 'doc', 'package.json'));
const XLSX = dataRequire('xlsx');
const JSZip = docRequire('jszip');

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const runJson = (args) =>
  JSON.parse(
    execFileSync('node', [cliEntry, ...args, '--json'], {
      cwd: scratch,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  );

const escapeXml = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const writeDocxFixture = async (filePath, text) => {
  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.folder('_rels')?.file(
    '.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
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

  writeFileSync(filePath, await zip.generateAsync({ type: 'nodebuffer' }));
};

const escapePdfText = (value) => value.replace(/[\\()]/g, '\\$&');

const createPdfFixture = (text) => {
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

const writeXlsxFixture = (filePath) => {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['region', 'amount', 'active'],
      ['north', 1200, true],
      ['south', 950, false],
    ]),
    'Details'
  );
  XLSX.writeFile(workbook, filePath);
};

try {
  const pdfPath = path.join(scratch, 'fixture.pdf');
  const docxPath = path.join(scratch, 'fixture.docx');
  const xlsxPath = path.join(scratch, 'sales.xlsx');

  writeFileSync(pdfPath, createPdfFixture('ZaoWu PDF Fixture'));
  await writeDocxFixture(docxPath, 'ZaoWu DOCX Fixture');
  writeXlsxFixture(xlsxPath);

  const pdfSearch = runJson(['doc', 'search', pdfPath, 'fixture']);
  assert(
    pdfSearch.matches?.some((match) => match.text === 'ZaoWu PDF Fixture'),
    'PDF fixture should be searchable through the CLI.'
  );

  const docxSummary = runJson(['doc', 'summary', docxPath]);
  assert(
    docxSummary.summary === 'ZaoWu DOCX Fixture',
    'DOCX fixture should be summarized through the CLI.'
  );

  const xlsxSchema = runJson(['data', 'schema', xlsxPath, '--sheet', 'Details']);
  assert(
    xlsxSchema.columns?.some((column) => column.column === 'amount' && column.type === 'number'),
    'XLSX fixture should infer numeric columns through the CLI.'
  );

  const xlsxSample = runJson(['data', 'sample', xlsxPath, '--sheet', 'Details', '--rows', '1']);
  assert(xlsxSample.rows?.[0]?.region === 'north', 'XLSX fixture should sample rows.');

  console.log('ZaoWu rich fixtures: ok');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
