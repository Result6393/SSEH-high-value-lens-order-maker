// The "Patient sticker" photo step shared by the toric and tutoplast tabs: pick a
// photo, show it (for checking only; it is never sent), read it, report the result.

import { joinName } from './email';
import { prepareImage } from './image';
import { readSticker, type StickerRead } from './ocr';

export interface StickerStep {
  camera: HTMLInputElement;
  library: HTMLInputElement;
  preview: HTMLImageElement;
  status: HTMLElement;
}

/** The status line after a read: what was missing and where the MRN came from. */
export function stickerStatus(sticker: StickerRead): string {
  const missing = [!sticker.mrn && 'MRN', !sticker.surname && 'name'].filter(Boolean);
  const source = {
    barcode: 'MRN from the barcode. Check the name against the sticker.',
    text: "The barcode couldn't be read, so the MRN comes from the printed digits. Check every digit.",
    '': '',
  }[sticker.mrnSource];
  return (missing.length ? `Couldn't read the ${missing.join(' or the ')}. Fill it in by hand. ` : '') + source;
}

/** The name field text for a read: "SURNAME, First". */
export const stickerName = (s: StickerRead): string => (s.surname ? joinName(s.surname, s.firstName) : '');

/** Wires the pickers; `onRead` gets each successful read. Returns `reset` for "Next patient". */
export function initStickerStep(step: StickerStep, onRead: (sticker: StickerRead) => void): { reset(): void } {
  let token = 0;
  let url: string | undefined;
  const setStatus = (msg: string) => {
    step.status.textContent = msg;
    step.status.hidden = !msg;
  };

  async function onPhoto(file: File): Promise<void> {
    const mine = ++token;
    setStatus('Loading photo…');
    try {
      const { ocr, jpeg } = await prepareImage(file);
      if (mine !== token) return;
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(jpeg);
      step.preview.src = url;
      step.preview.hidden = false;
      const sticker = await readSticker(ocr, (stage) => mine === token && setStatus(stage));
      if (mine !== token) return;
      setStatus(stickerStatus(sticker));
      onRead(sticker);
    } catch (e) {
      setStatus(`Problem reading the photo: ${(e as Error).message}`);
    }
  }

  for (const picker of [step.camera, step.library]) {
    picker.addEventListener('change', () => {
      const file = picker.files?.[0];
      picker.value = '';
      if (file) void onPhoto(file);
    });
  }

  return {
    reset() {
      token++;
      if (url) URL.revokeObjectURL(url);
      url = undefined;
      step.preview.removeAttribute('src');
      step.preview.hidden = true;
      setStatus('');
    },
  };
}
