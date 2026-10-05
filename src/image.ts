const MAX_EDGE = 2400;

/**
 * Decodes the camera photo, applies EXIF rotation and downscales it.
 * Re-encoding through a canvas also strips EXIF (incl. GPS) from the attachment.
 */
export async function prepareImage(file: File): Promise<{ canvas: HTMLCanvasElement; jpeg: Blob }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const jpeg = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode photo'))), 'image/jpeg', 0.85),
  );
  return { canvas, jpeg };
}
