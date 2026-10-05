// Copies Tesseract's worker, WASM core and English model into public/ocr so
// OCR runs entirely from our own origin (no CDN fetches, works offline).
import { cpSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const out = new URL('../public/ocr/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const tesseractDist = join(dirname(require.resolve('tesseract.js/package.json')), 'dist');
const core = dirname(require.resolve('tesseract.js-core/package.json'));
const lang = join(dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int');

cpSync(join(tesseractDist, 'worker.min.js'), join(out, 'worker.min.js'));
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
  cpSync(join(core, f), join(out, f));
}
cpSync(join(lang, 'eng.traineddata.gz'), join(out, 'eng.traineddata.gz'));
console.log('OCR assets copied to public/ocr');
