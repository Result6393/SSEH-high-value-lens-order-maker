import { PSM, createWorker, type Line, type Page, type Worker } from 'tesseract.js';
import { crop } from './image';
import { findLensTables, type TableText } from './lens-table';
import type { OcrPass } from './ocr-types';

export interface PrintoutRead {
  /** Header pass first, then the full page. */
  passes: OcrPass[];
  /** Digits-only reads of the lens power tables. */
  tables: TableText[];
}

let worker: Promise<Worker> | undefined;
let progress: (p: number) => void = () => {};

// All OCR assets are served from our own origin (copied into public/ocr by
// scripts/copy-ocr-assets.mjs), so no image or text ever leaves the device.
function getWorker(): Promise<Worker> {
  const base = new URL('ocr/', document.baseURI).href;
  worker ??= createWorker('eng', 1, {
    workerPath: `${base}worker.min.js`,
    corePath: base,
    langPath: base,
    logger: (m) => {
      if (m.status === 'recognizing text') progress(m.progress);
    },
  });
  return worker;
}

/**
 * Passes: the full page; a tight crop of the patient header (from "Patient" to
 * "Physician"), which reads small identifiers more reliably; then each lens
 * power table, upscaled and read as digits only.
 */
export async function readPrintout(image: HTMLCanvasElement, onProgress: (stage: string) => void): Promise<PrintoutRead> {
  const w = await getWorker();
  // SINGLE_BLOCK is tesseract.js's default; AUTO splits labels from their values.
  await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, tessedit_char_whitelist: '' });
  progress = (p) => onProgress(`Reading page… ${Math.round(p * 100)}%`);
  const page = (await w.recognize(image, {}, { blocks: true })).data;
  const full = toPass(page);
  const passes = [full];

  const region = headerRegion(linesOf(page), image.height);
  if (region) {
    progress = (p) => onProgress(`Checking patient details… ${Math.round(p * 100)}%`);
    const header = await w.recognize(crop(image, 0, region.top, image.width, region.bottom - region.top), {}, { blocks: true });
    passes.unshift(toPass(header.data));
  }

  const tables: TableText[] = [];
  const regions = findLensTables(full, image.width);
  await w.setParameters({ tessedit_char_whitelist: '0123456789.+-@T' });
  try {
    const read = async (b: { x0: number; y0: number; x1: number; y1: number }) =>
      (await w.recognize(crop(image, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0, 2))).data.text;
    for (const [i, r] of regions.entries()) {
      progress = () => onProgress(`Reading lens tables… ${i + 1}/${regions.length}`);
      tables.push({
        eye: r.eye,
        platform: r.platform,
        label: r.label,
        power: await read(r.power),
        ...(r.toric ? { toric: await read(r.toric) } : {}),
      });
    }
  } finally {
    await w.setParameters({ tessedit_char_whitelist: '' });
  }
  return { passes, tables };
}

const linesOf = (page: Page): Line[] => (page.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));

function toPass(page: Page): OcrPass {
  return {
    lines: linesOf(page).map((l) => ({
      words: l.words.map((w) => ({ text: w.text, x0: w.bbox.x0, x1: w.bbox.x1, y0: w.bbox.y0, y1: w.bbox.y1 })),
    })),
  };
}

function headerRegion(lines: Line[], height: number): { top: number; bottom: number } | undefined {
  const start = lines.find((l) => /\bpat[il1]?ent\b|date\s*of\s*b/i.test(l.text));
  if (!start) return undefined;
  const end = lines.find((l) => l.bbox.y0 >= start.bbox.y0 && /physician|pat[il1]?ent\s*[i1l]\s*d/i.test(l.text)) ?? start;
  const lineH = start.bbox.y1 - start.bbox.y0;
  return {
    top: Math.max(0, start.bbox.y0 - 2 * lineH),
    bottom: Math.min(height, end.bbox.y1 + 2 * lineH),
  };
}
