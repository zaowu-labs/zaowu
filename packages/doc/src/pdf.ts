/**
 * PDF text extraction runtime shims (foundation-phase workaround).
 *
 * pdf-parse (the library we use for .pdf -> text) has a hard/optional dependency
 * on @napi-rs/canvas for its full rendering pipeline. Even when we only request
 * text extraction, in many Node.js environments the module will:
 *   - log a noisy warning about the missing canvas package, and/or
 *   - assume certain DOM types (DOMMatrix, ImageData, Path2D) exist on the global.
 *
 * We therefore:
 *   1. Provide minimal, no-op shims for those three types **only if they are
 *      not already present** on globalThis. This is the smallest possible
 *      intervention that makes pdf-parse's text path work.
 *   2. Temporarily silence the exact canvas warning during the dynamic import.
 *
 * This is deliberately a "clever" but contained hack. It violates the spirit of
 * "readable code over clever code" and "no magic without control". A proper
 * long-term fix would be to replace pdf-parse with a pure-JS text extractor
 * (pdf.js node build, unpdf, or similar) that has no canvas requirement.
 *
 * The shims are intentionally named with a ZaoWu prefix inside the class
 * definitions so that stack traces / debug output make the origin obvious.
 *
 * See also: packages/doc/README.md (workaround documented).
 */

type PdfRuntimeGlobal = {
  DOMMatrix?: new (init?: unknown) => unknown;
  ImageData?: new (
    dataOrWidth: Uint8ClampedArray | number,
    width?: number,
    height?: number
  ) => unknown;
  Path2D?: new (path?: unknown) => unknown;
};

const PDF_SHIM_KEYS = ['DOMMatrix', 'ImageData', 'Path2D'] as const;

type PdfParseModule = typeof import('pdf-parse');

let pdfParseModulePromise: Promise<PdfParseModule> | undefined;

const ensurePdfTextRuntime = (): void => {
  const runtime = globalThis as unknown as PdfRuntimeGlobal;

  // Minimal DOMMatrix shim sufficient for pdf-parse text extraction.
  runtime.DOMMatrix ??= class ZaoWuPdfDomMatrix {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;

    constructor(init?: unknown) {
      if (Array.isArray(init) && init.length >= 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init.map(Number).slice(0, 6);
      }
    }

    multiplySelf(): this {
      return this;
    }
    preMultiplySelf(): this {
      return this;
    }
    translateSelf(): this {
      return this;
    }
    scaleSelf(): this {
      return this;
    }
    rotateSelf(): this {
      return this;
    }
    invertSelf(): this {
      return this;
    }

    transformPoint(point: { x?: number; y?: number; z?: number; w?: number } = {}) {
      return {
        x: point.x ?? 0,
        y: point.y ?? 0,
        z: point.z ?? 0,
        w: point.w ?? 1,
      };
    }
  };

  // Minimal ImageData shim.
  runtime.ImageData ??= class ZaoWuPdfImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;

    constructor(dataOrWidth: Uint8ClampedArray | number, width = 0, height = 0) {
      this.width = typeof dataOrWidth === 'number' ? dataOrWidth : width;
      this.height = height;
      this.data =
        dataOrWidth instanceof Uint8ClampedArray
          ? dataOrWidth
          : new Uint8ClampedArray(dataOrWidth * width * 4);
    }
  };

  // Path2D is referenced but never actually used in our text-only path.
  runtime.Path2D ??= class ZaoWuPdfPath2D {};
};

const importPdfParse = async (): Promise<PdfParseModule> => {
  ensurePdfTextRuntime();

  if (!pdfParseModulePromise) {
    const originalWarn = console.warn;

    // Only suppress the specific canvas-missing warning that pdf-parse emits
    // when it can't find its optional native module. Everything else is passed
    // through so we don't accidentally hide real problems.
    console.warn = (...values: unknown[]): void => {
      const message = values.map(String).join(' ');
      if (message.includes('Cannot load "@napi-rs/canvas" package')) {
        return;
      }
      originalWarn(...values);
    };

    pdfParseModulePromise = import('pdf-parse')
      .catch((error: unknown) => {
        pdfParseModulePromise = undefined;
        throw error;
      })
      .finally(() => {
        console.warn = originalWarn;
      });
  }

  return pdfParseModulePromise;
};

const extractPdfInternal = async (buffer: Buffer): Promise<string> => {
  const runtime = globalThis as unknown as PdfRuntimeGlobal;
  const saved = PDF_SHIM_KEYS.map((key) => ({ key, had: key in runtime, old: runtime[key] }));
  try {
    const { PDFParse } = await importPdfParse();
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const parsed = await parser.getText();
      return parsed.text ?? '';
    } finally {
      await parser.destroy();
    }
  } finally {
    for (const { key, had, old } of saved) {
      if (!had) delete runtime[key];
      else (runtime[key] as unknown) = old;
    }
  }
};

// Global runtime shims belong to one extraction at a time. Concurrent library
// callers must not snapshot another extraction's temporary globals as originals.
let extractionQueue = Promise.resolve();
export const extractPdf = async (buffer: Buffer): Promise<string> => {
  const previous = extractionQueue;
  let release!: () => void;
  extractionQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await extractPdfInternal(buffer);
  } finally {
    release();
  }
};
