import { createWorker, type Worker } from 'tesseract.js';

let worker: Promise<Worker> | undefined;

// All OCR assets are served from our own origin (copied into public/ocr by
// scripts/copy-ocr-assets.mjs), so no image or text ever leaves the device.
function getWorker(onProgress: (p: number) => void): Promise<Worker> {
  const base = new URL('ocr/', document.baseURI).href;
  worker ??= createWorker('eng', 1, {
    workerPath: `${base}worker.min.js`,
    corePath: base,
    langPath: base,
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress(m.progress);
    },
  });
  return worker;
}

export async function recognise(image: HTMLCanvasElement, onProgress: (p: number) => void): Promise<string> {
  const w = await getWorker(onProgress);
  const { data } = await w.recognize(image);
  return data.text;
}
