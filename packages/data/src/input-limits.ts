import JSZip from 'jszip';
import { readBoundedFile, ZaoWuError } from '@zaowu-labs/core';

export const MAX_DATA_ROWS = 250_000;
export const MAX_DATA_COLUMNS = 1_024;
const MAX_DATA_CELLS = 2_000_000;

export const dataTooLarge = (): ZaoWuError =>
  new ZaoWuError({
    code: 'DATA_INPUT_TOO_LARGE',
    message: 'Dataset is too large to process safely.',
    why: 'Limits: 20 MiB input, 250,000 data rows, 1,024 columns, two million cells; XLSX also allows 2,000 ZIP entries and 64 MiB inflated content.',
    fix: 'Split the dataset, remove unused rows/columns, or export a smaller CSV file.',
  });

export const assertTableSize = (rows: number, columns: number): void => {
  if (rows > MAX_DATA_ROWS || columns > MAX_DATA_COLUMNS || (rows + 1) * columns > MAX_DATA_CELLS)
    throw dataTooLarge();
};

export const readDataFile = (filePath: string): Promise<Buffer> =>
  readBoundedFile(filePath, 20 * 1024 * 1024, {
    failed: {
      code: 'DATA_READ_FAILED',
      message: 'Could not read data file.',
      why: `ZaoWu could not read \`${filePath}\` as a regular file.`,
      fix: 'Check the path and file permissions, then try again.',
    },
    tooLarge: dataTooLarge(),
  });

/** Inflate sequentially under an actual-byte budget before handing ZIP to SheetJS. */
export const assertWorkbookSize = async (buffer: Buffer): Promise<void> => {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files);
  if (entries.length > 2_000) throw dataTooLarge();
  let total = 0;
  for (const entry of entries) {
    if (entry.dir) continue;
    await new Promise<void>((resolve, reject) => {
      const stream = entry.nodeStream('nodebuffer');
      stream.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > 64 * 1024 * 1024) {
          stream.pause();
          reject(dataTooLarge());
        }
      });
      stream.on('error', reject);
      stream.on('end', resolve);
      stream.resume();
    });
  }
};
