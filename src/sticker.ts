// Reads a hospital patient sticker (MRN, name, date of birth) from OCR text.
// The SSEH sticker looks like:
//
//   12345678   Sydney/Sydney Eye Hospital     |||| barcode ||||
//   SURNAME Given names
//   1 Example Street Suburb 2000
//   DOB: 01/02/1950 75y Sex: M Ph: ...
//
// It is often photographed stuck onto a form with printed labels ("FAMILY NAME",
// "GIVEN NAME", "MRN", "D.O.B") around it, so the fields are located by the
// sticker's own landmarks (hospital line, DOB line) rather than by those labels.
// Heuristic by design: the user always reviews the fields before sending.

import { lineText } from './extract';
import type { OcrPass } from './ocr-types';

export interface Sticker {
  mrn: string;
  surname: string;
  firstName: string;
  /** dd/mm/yyyy, or empty when it could not be read. */
  dob: string;
}

const HOSPITAL = /\beye[\s¦]+[fh]os/i; // "Sydney/Sydney Eye Hospital", OCR'd "Eye Fospts"
const DOB_LINE = /\bD[O0][B8R]\b.*(?:\bsex\b|\b\d{2,3}\s?y\b|\d{4})|\bsex\s*:/i;
const STREET = /\b(?:st|street|rd|road|ave|avenue|dr|drive|pde|parade|lane|ln|cres|crescent|pl|place|hwy|way|court|ct|blvd|close|unit)\b/i;

export const hospitalLine = (text: string): boolean => HOSPITAL.test(text);
export const dobLine = (text: string): boolean => DOB_LINE.test(text);

/**
 * The MRN in a sticker barcode: Code 39 text like "4872845.SYD" (MRN, then a site
 * suffix). Returns '' when the text isn't a 6-10 digit number.
 */
export function mrnFromBarcode(text: string | undefined): string {
  const digits = (text ?? '').trim().replace(/\.[A-Za-z]{2,4}$/, '').replace(/[-\s]/g, '');
  return /^\d{6,10}$/.test(digits) ? digits : '';
}

/** Earlier passes win field by field (pass the tight crop first, then the full photo). */
export function extractSticker(passes: OcrPass[]): Sticker {
  const parsed = passes.map(parseOne);
  const name = parsed.find((p) => p.name)?.name;
  return {
    mrn: parsed.map((p) => p.mrn).find(Boolean) ?? '',
    surname: name?.surname ?? '',
    firstName: name?.firstName ?? '',
    dob: parsed.map((p) => p.dob).find(Boolean) ?? '',
  };
}

function parseOne(pass: OcrPass) {
  const lines = pass.lines.map(lineText).filter(Boolean);
  const dob = lines.findIndex((l) => DOB_LINE.test(l));
  const above = dob >= 0 ? lines.slice(0, dob) : lines;
  // The sticker starts at its ID line (the hospital line, else the first line with an
  // MRN-like number) and ends at the DOB line; the form's printed labels sit above it.
  let start = above.findIndex((l) => HOSPITAL.test(l));
  if (start < 0) start = above.findIndex((l) => findMrn([l]));
  const window = start < 0 ? [] : lines.slice(start, dob >= 0 ? dob : start + 4);
  return {
    mrn: findMrn(window),
    name: findName(window),
    dob: dob >= 0 ? findDob(lines[dob]) : '',
  };
}

/**
 * A standalone 6-10 digit number; OCR often reads 0 as O and 1 as I/l in IDs. The sticker
 * prints it with dashes ("487-28-45"), which are dropped.
 */
function findMrn(lines: string[]): string {
  for (const line of lines) {
    for (const token of line.split(/\s+/)) {
      const t = token.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
      if (/^\d{2,4}(?:-\d{2,4}){1,3}$/.test(t) && /^\d{6,10}$/.test(t.replace(/-/g, ''))) return t.replace(/-/g, '');
      if (/^[0-9OoIl]{6,10}$/.test(t) && (t.match(/\d/g)?.length ?? 0) >= 5) return t.replace(/[Oo]/g, '0').replace(/[Il]/g, '1');
    }
  }
  return '';
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

function findDob(line: string): string {
  const after = line.slice(/\bD[O0][B8R]\b/i.exec(line)?.index ?? 0);
  // "/" is sometimes misread as "1" ("0110211950").
  const d = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(after) ?? /(\d{2})1(\d{2})1((?:19|20)\d{2})/.exec(after);
  if (!d) return '';
  const [day, month, year] = [Number(d[1]), Number(d[2]), Number(d[3])];
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > new Date().getFullYear()) return '';
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
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
