const ATTACHMENT_MAX_EDGE = 2400;
const OCR_MAX_EDGE = 3200;

/**
 * Decodes the camera photo (applying EXIF rotation) into a JPEG attachment and
 * a grayscale, contrast-boosted canvas for OCR. Re-encoding through a canvas
 * also strips EXIF (incl. GPS) from the attachment.
 */
export async function prepareImage(file: File): Promise<{ ocr: HTMLCanvasElement; jpeg: Blob }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const attachment = drawScaled(bitmap, ATTACHMENT_MAX_EDGE);
  const ocr = drawScaled(bitmap, OCR_MAX_EDGE);
  bitmap.close();
  grayscaleContrast(ocr);
  return { ocr, jpeg: await toJpeg(attachment) };
}

/** An extra image for the email: rotated, downscaled and stripped of EXIF/GPS like the biometry photo. */
export async function prepareAttachment(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const canvas = drawScaled(bitmap, ATTACHMENT_MAX_EDGE);
  bitmap.close();
  return toJpeg(canvas);
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode photo'))), 'image/jpeg', 0.85),
  );
}

export function crop(src: HTMLCanvasElement, x: number, y: number, w: number, h: number, scale = 1): HTMLCanvasElement {
  x = Math.max(0, x);
  y = Math.max(0, y);
  w = Math.min(w, src.width - x);
  h = Math.min(h, src.height - y);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
  return c;
}

function drawScaled(bitmap: ImageBitmap, maxEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bitmap.width * scale);
  c.height = Math.round(bitmap.height * scale);
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(bitmap, 0, 0, c.width, c.height);
  return c;
}

/** Grayscale + contrast stretch; markedly improves OCR on coloured (e.g. blue) printouts. */
function grayscaleContrast(c: HTMLCanvasElement, contrast = 1.4): void {
  const g = c.getContext('2d')!;
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = (y - 128) * contrast + 128;
  }
  g.putImageData(img, 0, 0);
}
