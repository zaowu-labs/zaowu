import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { ZaoWuError } from '@zaowu-labs/core';

const WORD_NAMESPACES = new Set([
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  'http://purl.oclc.org/ooxml/wordprocessingml/main',
]);
const MAX_XML_BYTES = 8 * 1024 * 1024;
const MAX_DEPTH = 100;

const invalidDocx = (): Error => new Error('Invalid or unsupported DOCX XML.');
const tooLarge = (): ZaoWuError =>
  new ZaoWuError({
    code: 'DOCUMENT_INPUT_TOO_LARGE',
    message: 'Document is too large to extract safely.',
    why: 'A DOCX XML part exceeds 8 MiB, the archive exceeds 2,000 entries, or XML nesting exceeds 100 levels.',
    fix: 'Split the document or export a smaller text-only copy.',
  });

const children = (element: Element): Element[] => {
  const result: Element[] = [];
  for (let node = element.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 1) result.push(node as Element);
  }
  return result;
};
const word = (node: Element, name: string): boolean =>
  WORD_NAMESPACES.has(node.namespaceURI ?? '') && node.localName === name;
const child = (node: Element | undefined, name: string): Element | undefined =>
  node && children(node).find((item) => word(item, name));
const attr = (node: Element | undefined, name: string): string => {
  if (!node) return '';
  for (const ns of WORD_NAMESPACES) {
    if (node.hasAttributeNS(ns, name)) return node.getAttributeNS(ns, name) ?? '';
  }
  return '';
};

/** Pause the decompressor on actual inflated bytes, not ZIP size claims. */
const readXml = async (
  zip: JSZip,
  name: string,
  required = false
): Promise<Document | undefined> => {
  const entry = zip.file(name);
  if (!entry) {
    if (required) throw invalidDocx();
    return undefined;
  }
  const xml = await new Promise<string>((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    const stream = entry.nodeStream('nodebuffer');
    stream.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_XML_BYTES) {
        stream.pause();
        reject(tooLarge());
        return;
      }
      chunks.push(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.resume();
  });
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw invalidDocx();
  let malformed = false;
  const document = new DOMParser({
    errorHandler: () => {
      malformed = true;
    },
  }).parseFromString(xml, 'application/xml');
  if (malformed || !document.documentElement) throw invalidDocx();
  const stack: Array<[Element, number]> = [[document.documentElement, 1]];
  while (stack.length) {
    const [element, depth] = stack.pop()!;
    if (depth > MAX_DEPTH) throw tooLarge();
    for (const elementChild of children(element)) stack.push([elementChild, depth + 1]);
  }
  return document;
};

const safeLink = (target: string): string | undefined => {
  try {
    const url = new URL(target);
    if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) return undefined;
    if (url.username || url.password) return undefined;
    return url.toString().replaceAll('(', '%28').replaceAll(')', '%29');
  } catch {
    return undefined;
  }
};

export const extractDocx = async (buffer: Buffer, format: 'markdown' | 'text'): Promise<string> => {
  const zip = await JSZip.loadAsync(buffer);
  if (Object.keys(zip.files).length > 2_000) throw tooLarge();
  // Read only known parts. Never follow internal paths or external relationships.
  const document = await readXml(zip, 'word/document.xml', true);
  const styles = await readXml(zip, 'word/styles.xml');
  const numbering = await readXml(zip, 'word/numbering.xml');
  const relationships = await readXml(zip, 'word/_rels/document.xml.rels');
  const root = document!.documentElement;
  if (!word(root, 'document')) throw invalidDocx();
  const body = child(root, 'body');
  if (!body) throw invalidDocx();

  const links = new Map<string, string>();
  if (relationships) {
    for (const rel of children(relationships.documentElement)) {
      if (rel.localName !== 'Relationship' || rel.getAttribute('TargetMode') !== 'External')
        continue;
      if (!(rel.getAttribute('Type') ?? '').endsWith('/hyperlink')) continue;
      const target = safeLink(rel.getAttribute('Target') ?? '');
      if (target) links.set(rel.getAttribute('Id') ?? '', target);
    }
  }
  const styleMap = new Map<string, { level?: number; basedOn: string }>();
  if (styles) {
    for (const style of children(styles.documentElement)) {
      if (!word(style, 'style')) continue;
      const id = attr(style, 'styleId');
      const outline = attr(child(child(style, 'pPr'), 'outlineLvl'), 'val');
      const name = attr(child(style, 'name'), 'val');
      const match = /^(?:heading|标题)\s*([1-6])$/i.exec(name || id);
      const level =
        outline && /^[0-5]$/.test(outline)
          ? Number(outline) + 1
          : match
            ? Number(match[1])
            : undefined;
      styleMap.set(id, { level, basedOn: attr(child(style, 'basedOn'), 'val') });
    }
  }
  const styleLevel = (id: string, seen = new Set<string>()): number | undefined => {
    if (seen.has(id) || seen.size >= MAX_DEPTH) return undefined;
    seen.add(id);
    const style = styleMap.get(id);
    return (
      style?.level ??
      (style?.basedOn ? styleLevel(style.basedOn, seen) : undefined) ??
      (/^Heading([1-6])$/i.test(id) ? Number(id.slice(-1)) : undefined)
    );
  };
  const numIds = new Map<string, string>();
  const numFormats = new Map<string, string>();
  if (numbering) {
    for (const item of children(numbering.documentElement)) {
      if (word(item, 'num'))
        numIds.set(attr(item, 'numId'), attr(child(item, 'abstractNumId'), 'val'));
      if (word(item, 'abstractNum')) {
        for (const level of children(item).filter((node) => word(node, 'lvl'))) {
          numFormats.set(
            `${attr(item, 'abstractNumId')}:${attr(level, 'ilvl')}`,
            attr(child(level, 'numFmt'), 'val')
          );
        }
      }
    }
  }
  const inline = (element: Element): string => {
    if (word(element, 'del') || word(element, 'instrText') || word(element, 'pPr')) return '';
    if (word(element, 't')) {
      const text = element.textContent ?? '';
      return format === 'markdown' ? text.replace(/[\\`*_[\]<>#]/g, '\\$&') : text;
    }
    if (word(element, 'tab')) return '\t';
    if (word(element, 'br') || word(element, 'cr')) return '\n';
    let text = children(element).map(inline).join('');
    if (format === 'markdown' && word(element, 'hyperlink')) {
      const id =
        element.getAttribute('r:id') ||
        element.getAttributeNS(
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
          'id'
        );
      const target = links.get(id ?? '');
      if (target && text) text = `[${text}](${target})`;
    }
    return text;
  };
  const paragraph = (element: Element): string => {
    const text = inline(element).trim();
    if (!text || format === 'text') return text;
    const properties = child(element, 'pPr');
    const outline = attr(child(properties, 'outlineLvl'), 'val');
    const level = /^[0-5]$/.test(outline)
      ? Number(outline) + 1
      : styleLevel(attr(child(properties, 'pStyle'), 'val'));
    if (level) return `${'#'.repeat(level)} ${text}`;
    const numPr = child(properties, 'numPr');
    const numId = attr(child(numPr, 'numId'), 'val');
    if (numId && numId !== '0') {
      const ilvl = attr(child(numPr, 'ilvl'), 'val') || '0';
      const indent = '  '.repeat(Math.min(8, Number(ilvl) || 0));
      const marker = numFormats.get(`${numIds.get(numId)}:${ilvl}`) === 'bullet' ? '-' : '1.';
      return `${indent}${marker} ${text}`;
    }
    return text;
  };
  const blocks = (element: Element): string[] =>
    children(element).flatMap((item): string[] => {
      if (word(item, 'p')) return [paragraph(item)];
      if (word(item, 'del')) return [];
      if (word(item, 'tbl')) {
        const rows = children(item)
          .filter((node) => word(node, 'tr'))
          .map((row) =>
            children(row)
              .filter((node) => word(node, 'tc'))
              .map((cell) => blocks(cell).filter(Boolean).join(' '))
          );
        if (format === 'text') return rows.map((row) => row.join('\t'));
        const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
        const lines = rows.map(
          (row) =>
            `| ${Array.from({ length: width }, (_, i) => (row[i] ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')).join(' | ')} |`
        );
        if (lines.length) lines.splice(1, 0, `| ${Array(width).fill('---').join(' | ')} |`);
        return lines;
      }
      // Structured document tags and inserted content may wrap normal blocks.
      return blocks(item);
    });
  return blocks(body).join('\n').trim();
};
