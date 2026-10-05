// Decodes the linear barcode on a patient sticker, on-device (ZXing runs in the
// browser; nothing is uploaded). The sticker's barcode is Code 39 and holds the MRN
// plus a site suffix ("4872845.SYD"); see `mrnFromBarcode` in sticker.ts.

import { BarcodeFormat, BinaryBitmap, DecodeHintType, HybridBinarizer, MultiFormatReader, RGBLuminanceSource } from '@zxing/library';

const hints = new Map<DecodeHintType, unknown>([
  [DecodeHintType.TRY_HARDER, true],
  [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_39, BarcodeFormat.CODE_128, BarcodeFormat.CODE_93, BarcodeFormat.ITF, BarcodeFormat.CODABAR]],
]);

/** The text of the first barcode found, or undefined. Tries the photo as is, then at half size (very large photos blur the bars). */
export function decodeBarcode(canvas: HTMLCanvasElement): string | undefined {
  for (const scale of [1, 0.5]) {
    const c = scale === 1 ? canvas : shrink(canvas, scale);
    const { data, width, height } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
    const luminance = new Uint8ClampedArray(width * height);
    for (let i = 0; i < luminance.length; i++) luminance[i] = data[i * 4]; // the OCR canvas is already grayscale
    const reader = new MultiFormatReader();
    reader.setHints(hints);
    try {
      return reader.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, width, height)))).getText();
    } catch {
      // not found at this scale
    }
  }
  return undefined;
}

function shrink(src: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * scale);
  c.height = Math.round(src.height * scale);
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
