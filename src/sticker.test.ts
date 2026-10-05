import { describe, expect, it } from 'vitest';
import type { OcrPass } from './ocr-types';
import { extractSticker, mrnFromBarcode, parseName, stickerBand } from './sticker';

/** Builds an OCR pass from lines of text; `¦¦` between words leaves a wide gap (redaction, barcode). */
function pass(...texts: string[]): OcrPass {
  return {
    lines: texts.map((text, row) => {
      let x = 0;
      return {
        words: text.split(' ').filter(Boolean).map((t) => {
          if (t === '¦¦') x += 200;
          const w = { text: t, x0: x, x1: x + t.length * 10, y0: row * 30, y1: row * 30 + 20 };
          x += t.length * 10 + 10;
          return t === '¦¦' ? { ...w, text: '|' } : w;
        }),
      };
    }),
  };
}

describe('patient sticker', () => {
  it('reads the name from a sticker on its own and never the MRN', () => {
    const p = pass('12345678 Sydney/Sydney Eye Hospital', 'SMITH John Paul', '79 Mercer Road Pymble 2073', 'DOB: 14/05/1967 59y Sex: M Ph: 0400');
    expect(extractSticker([p])).toEqual({ surname: 'SMITH', firstName: 'John Paul' });
  });

  it('ignores the printed form labels around a sticker stuck on a form', () => {
    const p = pass('FAMILY NAME MRN', 'GIVEN NAME', 'D.O.P', '4871234 Sydney/Sydney Eye Hospital ¦¦ barcode', 'DIRAN Aram', '1 Alt Street Moss Vale 2577', 'DOB: 03/11/1962 55y Sex: M Ph:', 'COMPLETE ALL DETAILS OR AFFIX PATIENT LABEL HERE');
    expect(extractSticker([p])).toEqual({ surname: 'DIRAN', firstName: 'Aram' });
  });

  it('copes with a garbled hospital line and a lost given name', () => {
    const p = pass('GIVEN NAME', 'Eo 1284567O Syveyf Syiney Eye Fosota', 'BLACK', '11 Rd', 'DOB: 1979 46y Sex: F Ph');
    expect(extractSticker([p])).toEqual({ surname: 'BLACK', firstName: '' });
  });

  it('finds the sticker when the hospital line is unreadable, a gap splits it, and the given name is glued on', () => {
    const noHospital = pass('FAMILY NAME MRN', 'GIVEN NAME', '4875678 ¦¦ Sydney Eye ¦¦ barcode', 'DIRANAram', '1 A Street Moss Vale 2577', 'DOB: 03/11/1962 55y Sex: M');
    expect(extractSticker([noHospital])).toEqual({ surname: 'DIRAN', firstName: 'Aram' });
    const gapped = pass('12845678 Sydney Eye ¦¦ Hospital', 'SMITHJohn', '79 Me Road Pymble 2073');
    expect(extractSticker([gapped])).toEqual({ surname: 'SMITH', firstName: 'John' });
    expect(extractSticker([pass('FAMILY NAME', 'GIVEN NAME', 'COMPLETE ALL DETAILS')])).toEqual({ surname: '', firstName: '' });
  });

  it('prefers the first pass that finds a name', () => {
    const crop = pass('12345678 Sydney/Sydney Eye Hospital', 'BLACK Jo', 'DOB: 01/02/1979 46y Sex: F');
    const full = pass('1234567 Sydney Eye Hospital', 'BLACK');
    expect(extractSticker([crop, full])).toEqual({ surname: 'BLACK', firstName: 'Jo' });
    expect(extractSticker([pass('nothing useful here')])).toEqual({ surname: '', firstName: '' });
  });

  it('takes the MRN from the barcode text', () => {
    expect(mrnFromBarcode('4872845.SYD')).toBe('4872845');
    expect(mrnFromBarcode(' 487-28-45.syd ')).toBe('4872845');
    expect(mrnFromBarcode('4872845')).toBe('4872845');
    expect(mrnFromBarcode('SYD.4872845')).toBe('');
    expect(mrnFromBarcode('12')).toBe('');
    expect(mrnFromBarcode(undefined)).toBe('');
  });

  it('splits names', () => {
    expect(parseName('SMITH, John Paul')).toEqual({ surname: 'SMITH', firstName: 'John Paul' });
    expect(parseName('VAN DER BERG Anna')).toEqual({ surname: 'VAN DER BERG', firstName: 'Anna' });
    expect(parseName("O'NEIL JANE")).toEqual({ surname: "O'NEIL", firstName: 'JANE' });
    expect(parseName('[ro BLACK J')).toEqual({ surname: 'BLACK', firstName: 'J' });
    expect(parseName('SMITH John ¦ stamp')).toEqual({ surname: 'SMITH', firstName: 'John' });
    expect(parseName('= ¦ BLACK Mary')).toEqual({ surname: 'BLACK', firstName: 'Mary' });
    expect(parseName('~~ ¦ DIRANAram ¦ stamp')).toEqual({ surname: 'DIRAN', firstName: 'Aram' });
    expect(parseName('no capitals here')).toBeUndefined();
  });

  it('finds the sticker band in a full-page read', () => {
    const lines = [
      { text: 'GIVEN NAME', y0: 0, y1: 20 },
      { text: '12345678 Sydney/Sydney Eye Hospital', y0: 100, y1: 120 },
      { text: 'DOB: 01/02/1950 75y Sex: M', y0: 200, y1: 220 },
    ];
    expect(stickerBand(lines)).toEqual({ top: 70, bottom: 240 });
    expect(stickerBand([{ text: 'nothing', y0: 0, y1: 10 }])).toBeUndefined();
  });
});
