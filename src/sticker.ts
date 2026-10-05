// Reads the patient name from a hospital patient sticker's OCR text (the MRN comes
// from the barcode only; see barcode.ts).
// The SSEH sticker looks like:
//
//   12345678   Sydney/Sydney Eye Hospital     |||| barcode ||||
//   SURNAME Given names
//   1 Example Street Suburb 2000
//   DOB: 01/02/1950 75y Sex: M Ph: ...   (only used to find where the name ends)
//
// It is often photographed stuck onto a form with printed labels ("FAMILY NAME",
// "GIVEN NAME", "MRN", "D.O.B") around it, so the fields are located by the
// sticker's own landmarks (hospital line, DOB line) rather than by those labels.
// Heuristic by design: the user always reviews the fields before sending.

import { lineText } from './extract';
import type { OcrPass } from './ocr-types';

export interface Sticker {
  surname: string;
  firstName: string;
}

const HOSPITAL = /\beye[\s¦]+[fh]os/i; // "Sydney/Sydney Eye Hospital", OCR'd "Eye Fospts"
const DOB_LINE = /\bD[O0][B8R]\b.*(?:\bsex\b|\b\d{2,3}\s?y\b|\d{4})|\bsex\s*:/i;
const ID_LINE = /\d[\d-]{4,}\d/; // the line carrying the MRN, used only to find the top of the sticker
const STREET = /\b(?:st|street|rd|road|ave|avenue|dr|drive|pde|parade|lane|ln|cres|crescent|pl|place|hwy|way|court|ct|blvd|close|unit)\b/i;

/**
 * The MRN in a sticker barcode: Code 39 text like "4872845.SYD" (MRN, then a site
 * suffix). Returns '' when the text isn't a 6-10 digit number. The MRN is never read
 * from the sticker's printed text: OCR misreads digits.
 */
export function mrnFromBarcode(text: string | undefined): string {
  const digits = (text ?? '').trim().replace(/\.[A-Za-z]{2,4}$/, '').replace(/[-\s]/g, '');
  return /^\d{6,10}$/.test(digits) ? digits : '';
}

/** Earlier passes win (pass the tight crop first, then the full photo). */
export function extractSticker(passes: OcrPass[]): Sticker {
  const name = passes.map(findStickerName).find(Boolean);
  return { surname: name?.surname ?? '', firstName: name?.firstName ?? '' };
}

function findStickerName(pass: OcrPass) {
  const lines = pass.lines.map(lineText).filter(Boolean);
  const dob = lines.findIndex((l) => DOB_LINE.test(l));
  const above = dob >= 0 ? lines.slice(0, dob) : lines;
  // The sticker starts at its ID line (the hospital line, else the first line with a long
  // number) and ends at the DOB line; the form's printed labels sit above it.
  let start = above.findIndex((l) => HOSPITAL.test(l));
  if (start < 0) start = above.findIndex((l) => ID_LINE.test(l));
  return start < 0 ? undefined : findName(lines.slice(start, dob >= 0 ? dob : start + 4));
}

function findName(lines: string[]): { surname: string; firstName: string } | undefined {
  // The first line with a capitalised name and no digits: the ID line and the address
  // (street numbers) are skipped, and the labels printed around the sticker are above
  // the window when the hospital line was found.
  for (const line of lines) {
    if (HOSPITAL.test(line) || /\d/.test(line) || STREET.test(line)) continue;
    const name = parseName(line);
    if (name) return name;
  }
  return undefined;
}

/** "SMITH John", "SMITH, John Paul", "SMITH JOHN"; junk before the name and after a wide gap is dropped. */
export function parseName(line: string): { surname: string; firstName: string } | undefined {
  for (const segment of line.split('¦')) {
    const name = parseSegment(segment);
    if (name) return name;
  }
  return undefined;
}

function parseSegment(text: string): { surname: string; firstName: string } | undefined {
  // OCR often glues the given name to the surname: "SMITHJohn".
  const tokens = text.split(/\s+/).filter(Boolean).flatMap((t) => /^([A-Z][A-Z'’-]+)([A-Z][a-z][a-z'’-]*)$/.exec(t)?.slice(1) ?? [t]);
  const start = tokens.findIndex((t) => /^[A-Z][A-Z'’-]+,?$/.test(t));
  if (start < 0) return undefined;
  const words: string[] = [];
  for (const t of tokens.slice(start)) {
    if (!/^[A-Za-z'’-]*[A-Za-z][A-Za-z'’-]*,?$/.test(t)) break;
    words.push(t);
  }
  const comma = words.findIndex((w) => w.endsWith(','));
  if (comma >= 0) {
    return { surname: words.slice(0, comma + 1).join(' ').replace(/,$/, ''), firstName: words.slice(comma + 1).join(' ') };
  }
  const isCaps = (w: string) => w === w.toUpperCase();
  const caps = words.findIndex((w) => !isCaps(w));
  // "SMITH John": the capitals are the surname. "SMITH JOHN": first word is.
  if (caps > 0) return { surname: words.slice(0, caps).join(' '), firstName: words.slice(caps).join(' ') };
  return { surname: words[0], firstName: words.slice(1).join(' ') };
}

/** Vertical band of the sticker (hospital line to DOB line) in a full-photo read, for a tighter second pass. */
export function stickerBand(lines: { text: string; y0: number; y1: number }[]): { top: number; bottom: number } | undefined {
  const dob = lines.find((l) => DOB_LINE.test(l.text));
  const hospital = lines.find((l) => HOSPITAL.test(l.text));
  const anchor = dob ?? hospital;
  if (!anchor) return undefined;
  const h = anchor.y1 - anchor.y0;
  return {
    top: Math.max(0, (hospital && (!dob || hospital.y0 < dob.y0) ? hospital.y0 : anchor.y0 - 7 * h) - 1.5 * h),
    bottom: (dob ?? anchor).y1 + h,
  };
}
