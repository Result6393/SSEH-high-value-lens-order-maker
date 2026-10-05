// Pulls patient details and per-eye astigmatism out of OCR text from a Zeiss
// IOLMaster "IOL CALCULATION" printout (other layouts handled best-effort).
// Heuristic by design: the user always reviews the fields before sending.

import type { OcrLine, OcrPass } from './ocr-types';
import type { Eye } from './types';

/** Inserted between words separated by a wide gap (column break, stray pen mark). */
const GAP = '¦';

export interface AstK {
  power: string;
  axis: string;
}

export interface Extracted {
  surname: string;
  firstName: string;
  mrn: string;
  dob: string;
  astK: Partial<Record<Eye, AstK>>;
  /** OCR passes disagreed on the MRN: the user must check it carefully. */
  mrnUncertain: boolean;
}

/**
 * Merges several OCR readings of the same printout. Earlier texts win
 * (pass the tight header crop first, then the full page).
 */
export function extractBiometry(passes: OcrPass[]): Extracted {
  const parsed = passes.map(parseOne);
  const first = <T>(pick: (p: ReturnType<typeof parseOne>) => T | undefined): T | undefined =>
    parsed.map(pick).find((v) => v !== undefined && v !== '');

  const name = pickName(parsed.map((p) => p.name).filter((n) => n !== undefined));
  const mrns = new Set(parsed.map((p) => p.mrn).filter(Boolean));
  return {
    surname: name?.surname ?? '',
    firstName: name?.firstName ?? '',
    mrn: first((p) => p.mrn) ?? '',
    dob: first((p) => p.dob) ?? '',
    astK: { Right: first((p) => p.astK.Right), Left: first((p) => p.astK.Left) },
    mrnUncertain: mrns.size > 1,
  };
}

/**
 * OCR tends to append junk (tick marks, stamps) after the name. When one
 * reading is a prefix of all the others, the shorter one is the clean name.
 */
function pickName(names: { surname: string; firstName: string }[]) {
  const full = (n: { surname: string; firstName: string }) => `${n.surname}, ${n.firstName}`.toLowerCase();
  return names.find((n) => names.every((o) => full(o).startsWith(full(n)))) ?? names[0];
}

function parseOne(pass: OcrPass) {
  const lines = pass.lines.map(lineText).filter(Boolean);
  return { name: findName(lines), mrn: findMrn(lines), dob: findDob(lines), astK: findAstK(pass.lines) };
}

/** Joins a line's words, marking gaps wider than ~1.5 character heights. */
export function lineText(line: OcrLine): string {
  const words = line.words.filter((w) => w.text.trim() && w.text !== '|');
  const heights = words.map((w) => w.y1 - w.y0).sort((a, b) => a - b);
  const h = heights[Math.floor(heights.length / 2)] ?? 0;
  return words
    .map((w, i) => (i > 0 && w.x0 - words[i - 1].x1 > 1.5 * h ? `${GAP} ${w.text}` : w.text))
    .join(' ')
    .trim();
}

/** Text after a label, skipping separators and at most one column gap. */
const afterLabel = (line: string, m: RegExpExecArray) =>
  line.slice(m.index + m[0].length).replace(new RegExp(`^[\\s:.#]*(?:${GAP}[\\s:.#]*)?`), '');

// ---- MRN ----------------------------------------------------------------

const MRN_LABELS = [
  /\bpat[il1]?ent\s*[i1l]\s*d\b/i, // "Patient ID", "PatientID", OCR'd "Patient 1D" / "Patent ID"
  /\bpat\.?\s*id\b/i,
  /\bmrn\b/i,
  /\bu\.?r\.?n?\.?(?:\s*(?:no|number))?\b/i,
  /\bhospital\s*(?:no|number)\b/i,
];

function findMrn(lines: string[]): string {
  for (const label of MRN_LABELS) {
    for (const line of lines) {
      const m = label.exec(line);
      if (!m) continue;
      const v = /^([A-Z0-9][A-Z0-9-]{3,14})\b/i.exec(afterLabel(line, m));
      if (v && /\d/.test(v[1])) return cleanMrn(v[1]);
    }
  }
  return '';
}

/** In mostly-numeric IDs, OCR often reads 0 as O and 1 as I/l. */
function cleanMrn(raw: string): string {
  const digits = raw.replace(/\D/g, '').length;
  if (digits >= raw.length - 2) return raw.replace(/[Oo]/g, '0').replace(/[Il]/g, '1');
  return raw.toUpperCase();
}

// ---- Name -----------------------------------------------------------------

const NAME_STOP =
  /\b(?:first\s*name|given\s*names?|forenames?|last\s*name|surname|d\.?o\.?b|date|birth|born|pat[il1]?ent\s*[i1l]\s*d|pat\.?\s*id|id|sex|gender|mrn|u\.?r\.?n?|age)\b/i;

function findName(lines: string[]): { surname: string; firstName: string } | undefined {
  // Separate surname / first-name fields (e.g. Lenstar).
  const last = labelled(lines, /\b(?:last\s*name|surname|family\s*name)\b/i);
  const first = labelled(lines, /\b(?:first\s*name|given\s*names?|forenames?)\b/i);
  if (last && first) return { surname: last, firstName: first };

  // Single field, e.g. IOLMaster "Patient   SURNAME, First" (no colon).
  // OCR may drop or swap the "i": "Patent", "Patlent".
  const single = labelled(lines, /\b(?:pat[il1]?ent\s*name|pat[il1]?ent(?!\s*[i1l]\s*d\b)|name)\b/i);
  if (single) return splitName(single);
  return last ? { surname: last, firstName: '' } : undefined;
}

function labelled(lines: string[], label: RegExp): string | undefined {
  for (const line of lines) {
    const m = label.exec(line);
    if (!m) continue;
    let rest = afterLabel(line, m);
    const stop = NAME_STOP.exec(rest);
    if (stop) rest = rest.slice(0, stop.index);
    // Keep leading name-like tokens; stop at a wide gap or OCR junk ("=", "@D", "\/").
    const tokens: string[] = [];
    for (const t of rest.split(/\s+/).filter(Boolean)) {
      if (!/^[A-Za-z'’-]*[A-Za-z][A-Za-z'’-]*,?$/.test(t)) break;
      tokens.push(t);
    }
    const name = tokens.join(' ').replace(/,$/, '');
    if (/[A-Za-z]{2,}/.test(name)) return name;
  }
  return undefined;
}

function splitName(full: string): { surname: string; firstName: string } {
  const comma = full.indexOf(',');
  if (comma >= 0) return { surname: full.slice(0, comma).trim(), firstName: full.slice(comma + 1).trim() };
  const words = full.split(' ');
  const caps = words.findIndex((w) => w.length > 1 && w === w.toUpperCase());
  if (caps >= 0) return { surname: words[caps], firstName: words.filter((_, i) => i !== caps).join(' ') };
  return { surname: words.at(-1)!, firstName: words.slice(0, -1).join(' ') };
}

// ---- Date of birth --------------------------------------------------------

function findDob(lines: string[]): string {
  for (const line of lines) {
    const m = /\b(?:date\s*of\s*birth|d\.?o\.?b\.?|birth\s*date)\b/i.exec(line);
    if (!m) continue;
    const d = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(line.slice(m.index + m[0].length));
    if (!d) continue;
    const [day, month, year] = [Number(d[1]), Number(d[2]), Number(d[3])];
    if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > new Date().getFullYear()) continue;
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
  }
  return '';
}

// ---- Astigmatism ----------------------------------------------------------

/**
 * IOLMaster prints "Ast. K +2.39 D @ 60°" once per eye, in the OD (right eye)
 * column and the OS (left eye) column. Each label is assigned to an eye by
 * lining it up with the column's row labels (AL, ACD, LT, ...), which share its
 * left edge. If those can't be found, falls back to reading order (OD first)
 * when exactly two labels were read.
 */
function findAstK(lines: OcrLine[]): Partial<Record<Eye, AstK>> {
  const found: { x: number; value?: AstK }[] = [];
  for (const line of lines) {
    const words = line.words;
    words.forEach((w, i) => {
      let next = i + 1;
      if (/^Ast\.?K$/i.test(w.text)) next = i + 1;
      else if (/^Ast\.?$/i.test(w.text) && words[i + 1]?.text === 'K') next = i + 2;
      else return;
      const end = words.findIndex((v, j) => j >= next && /^Ast/i.test(v.text));
      const seg = words.slice(next, end < 0 ? next + 5 : end).map((v) => v.text).join(' ');
      found.push({ x: w.x0, value: parseAstK(seg) });
    });
  }

  const columns = columnEdges(lines);
  const out: Partial<Record<Eye, AstK>> = {};
  found.forEach((f, i) => {
    let eye: Eye | undefined;
    if (columns) eye = Math.abs(f.x - columns.od) < Math.abs(f.x - columns.os) ? 'Right' : 'Left';
    else if (found.length === 2) eye = i === 0 ? 'Right' : 'Left';
    if (eye && f.value && !out[eye]) out[eye] = f.value;
  });
  return out;
}

function parseAstK(seg: string): AstK | undefined {
  const p = /([+-]?)(\d{1,2})[.,]?(\d{2})\s*D/.exec(seg);
  if (!p) return undefined;
  const a = /(?:@|°)\s*(\d{1,3})|(\d{1,3})\s*°/.exec(seg.slice(p.index + p[0].length));
  const axis = a ? Number(a[1] ?? a[2]) : NaN;
  return { power: `${Number(p[2])}.${p[3]}`, axis: axis >= 0 && axis <= 180 ? String(axis) : '' };
}

/** Left edges of the OD and OS biometry columns, from their row labels. */
export function columnEdges(lines: OcrLine[]): { od: number; os: number } | undefined {
  const xs = lines
    .flatMap((l) => l.words)
    .filter((w) => /^(AL|ACD|LT|CCT|K1|K2)$/.test(w.text))
    .map((w) => w.x0)
    .sort((a, b) => a - b);
  if (xs.length < 2) return undefined;
  // Split at the widest gap; both groups must be real columns, not one stray word.
  let split = 1;
  for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > xs[split] - xs[split - 1]) split = i;
  const left = xs.slice(0, split);
  const right = xs.slice(split);
  if (left.length < 2 || right.length < 2) return undefined;
  const median = (a: number[]) => a[Math.floor(a.length / 2)];
  return { od: median(left), os: median(right) };
}
