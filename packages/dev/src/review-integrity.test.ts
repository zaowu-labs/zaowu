import { describe, expect, it } from 'vitest';
import { parseDevAiReviewFindings } from './ai-assist';
const hunk = (startLine: number, header: string) => ({
  filePath: 'src/main.ts',
  startLine,
  endLine: startLine + 2,
  header,
  addedLines: 3,
  removedLines: 0,
});
const context = {
  files: ['src/main.ts'],
  hunks: [hunk(10, '@@ -10,3 +10,3 @@'), hunk(50, '@@ -50,3 +50,3 @@')],
};
const finding = {
  title: 'Example issue',
  detail: 'Concrete explanation',
  filePath: 'src/main.ts',
  line: 11,
};
describe('AI review evidence integrity', () => {
  it('does not combine a line in one hunk with a different hunk header', () => {
    const [result] = parseDevAiReviewFindings(
      JSON.stringify([{ ...finding, hunkHeader: context.hunks[1].header }]),
      context
    );
    expect(result.hunkHeader).toBeUndefined();
    expect(result.line).toBeUndefined();
    expect(result.detail).toContain('Location could not be verified');
  });
  it('does not validate a deletion-only anchor as a real new-file line', () => {
    const [result] = parseDevAiReviewFindings(JSON.stringify([finding]), {
      files: context.files,
      hunks: [{ ...hunk(11, '@@ -11,3 +11,0 @@'), endLine: 11, addedLines: 0, removedLines: 3 }],
    });
    expect(result.line).toBeUndefined();
  });
  it.each([
    '{"findings":[]}',
    'null',
    '42',
    '[{"title":"Issue","detail":"Explanation","severity":"fatal"}]',
    '[{"title":"Issue","detail":"Explanation","priority":"critical"}]',
    '[{"title":"Issue","detail":"Explanation","category":"unknown"}]',
    '',
    '[{invalid]',
    '```json\nnot JSON\n```',
    'true',
  ])('rejects invalid structured or empty reviews: %s', (text) => {
    expect(() => parseDevAiReviewFindings(text, context)).toThrow();
  });
  it('retains matching locations, omitted classification defaults, empty findings, and prose summaries', () => {
    const [result] = parseDevAiReviewFindings(
      JSON.stringify([{ ...finding, hunkHeader: context.hunks[0].header }]),
      context
    );
    expect(result).toMatchObject({
      line: 11,
      hunkHeader: context.hunks[0].header,
      severity: 'info',
      priority: 'medium',
      category: 'quality',
    });
    expect(parseDevAiReviewFindings('[]', context)).toEqual([]);
    expect(parseDevAiReviewFindings('Review needs more context.', context)[0].title).toBe(
      'AI Code Review Summary'
    );
  });
});

it('discloses an unverifiable header even when no line was supplied', () => {
  const [result] = parseDevAiReviewFindings(
    JSON.stringify([
      { title: 'Issue', detail: 'Explanation', filePath: 'src/main.ts', hunkHeader: 'invented' },
    ]),
    context
  );
  expect(result.hunkHeader).toBeUndefined();
  expect(result.detail).toContain('Location could not be verified');
});
