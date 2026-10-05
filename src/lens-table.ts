// Finds and reads the IOL power tables on an IOLMaster "IOL CALCULATION" page.
// Two layouts are handled:
// - Barrett Universal II (monofocal) page: six tables per eye row, both eyes.
//   Gives the spherical power only.
// - Barrett Toric page: tables stacked in one eye's column, each with a
//   "Toric Power" column listing three models; the middle (bold) one is the
//   recommended model.
import { columnEdges } from './extract';
import { modelForCylinder, roundToHalf, type Platform } from './lenses';
import type { OcrLine, OcrPass, OcrWord } from './ocr-types';
import type { Eye } from './types';

export type TablePlatform = Exclude<Platform, 'Other'>;

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface TableRegion {
  eye: Eye;
  platform: TablePlatform;
  /** Lens the table is for, as printed, e.g. "ZCB00", "ZCT". */
  label: string;
  /** IOL power and residual (Res. SE) columns. */
  power: Box;
  /** "Toric Power" column, on Barrett Toric pages only. */
  toric?: Box;
}

// OCR variants seen: "Barn", "[Barren", "[garrett", "Bartell", "Unwersai", "Tore", "Tone".
const isBarrett = (t: string) => /^\W*Barr?ett\W*$/i.test(t);
const isFormulaName = (t: string) => /^\W*(To[rn]|Un[iw])/i.test(t);

/** "Barrett" (or an OCR variant) followed by "Toric"/"Universal". */
function formulaAnchors(line: OcrLine): { word: OcrWord; toric: boolean }[] {
  const out: { word: OcrWord; toric: boolean }[] = [];
  line.words.forEach((w, i) => {
    const next = line.words[i + 1]?.text ?? '';
    if (isBarrett(w.text) || (/^\W*[BbGg]arr?\w{0,4}\W*$/.test(w.text) && isFormulaName(next))) {
      out.push({ word: w, toric: /^\W*To[rn]/i.test(next) });
    }
  });
  return out;
}

/**
 * Locates the tables for ZCU (Tecnis: "ZCB00" or toric "ZCT") and CNA0T
 * (Clareon "CNA 0Tx"; never AcrySof) for each eye, from the
 * full-page pass. Lens names OCR badly, so tables are anchored on their
 * "Barrett ..." formula header and classified by the fuzzy name above it; a
 * monofocal row of six unclassified tables falls back to the usual order
 * (Clareon, Clareon, ZCB00 per eye). Crop sizes scale with the width of the
 * word "Barrett", so any photo resolution works.
 */
export function findLensTables(pass: OcrPass, imageWidth: number): TableRegion[] {
  const rows = pass.lines.map(formulaAnchors).filter((r) => r.length);
  const barrettWidths = rows.flat().map((a) => a.word.x1 - a.word.x0).sort((a, b) => a - b);
  if (!barrettWidths.length) return [];
  const B = barrettWidths[Math.floor(barrettWidths.length / 2)];
  const split = eyeSplit(pass.lines, imageWidth);
  const words = pass.lines.flatMap((l) => l.words);

  const regions: TableRegion[] = [];
  for (const row of rows) {
    const classified = row.map(({ word: a, toric }) => {
      const header = words
        .filter((w) => w !== a && !isFormulaName(w.text) && !isBarrett(w.text))
        .filter((w) => w.y0 >= a.y0 - 1.6 * B && w.y0 <= a.y0 + 0.3 * B)
        .filter((w) => w.x0 >= a.x0 - 0.3 * B && w.x0 < a.x0 + 3.2 * B)
        .map((w) => w.text)
        .join(' ');
      return { a, toric, ...classify(header) };
    });
    // Fill unreadable lens names from the usual order, but only when every
    // readable name agrees with that order (other configurations exist).
    const usual = [['CNA0T', 'Clareon CNA 0Tx'], ['CNA0T', 'Clareon CNA 0Tx'], ['ZCU', 'ZCB00']] as const;
    if (
      classified.length === 6 &&
      !classified.some((c) => c.toric) &&
      classified.every((c, i) => !c.other && (!c.platform || c.platform === usual[i % 3][0]))
    ) {
      classified.forEach((c, i) => {
        if (!c.platform) [c.platform, c.label] = usual[i % 3];
      });
    }

    for (const c of classified) {
      if (!c.platform) continue;
      const eye: Eye = c.a.x0 < split ? 'Right' : 'Left';
      // One table per eye and kind: a toric table beats a monofocal one (it also
      // gives the cylinder); otherwise the first wins (Clareon appears twice).
      const existing = regions.findIndex((r) => r.eye === eye && r.platform === c.platform);
      if (existing >= 0 && (regions[existing].toric || !c.toric)) continue;
      if (existing >= 0) regions.splice(existing, 1);
      const { x0, y0 } = c.a;
      regions.push({
        eye,
        platform: c.platform,
        label: c.label!,
        power: { x0: x0 - 0.2 * B, x1: x0 + 3.6 * B, y0: y0 + 0.5 * B, y1: y0 + 4 * B },
        toric: c.toric ? { x0: x0 + 6.7 * B, x1: x0 + 11.6 * B, y0: y0 + 0.5 * B, y1: y0 + 3.6 * B } : undefined,
      });
    }
  }
  return regions;
}

/** `other`: a recognisably different lens, never filled in from position. */
function classify(header: string): { platform?: TablePlatform; label?: string; other?: boolean } {
  if (/B[0O]{2}/i.test(header)) return { platform: 'ZCU', label: 'ZCB00' };
  if (/\b[Z2][CE][TU]\b/i.test(header)) return { platform: 'ZCU', label: 'ZCT' }; // OCR: "zet"
  // AcrySof tables (e.g. SN6AT) are deliberately not used for Clareon: different lens constants.
  if (/SN\w?A[TW]|SN6|Acry|ASPH|PMMA|MTA|Lux|ZA9|TORBI|MA[56]0/i.test(header)) return { other: true };
  if (/CNA|\bNA\b|[0O]Tx|Cl\w*on/i.test(header)) return { platform: 'CNA0T', label: 'Clareon CNA 0Tx' };
  return {};
}

/** x coordinate dividing the OD (right eye) and OS (left eye) halves of the page. */
function eyeSplit(lines: OcrLine[], imageWidth: number): number {
  const cols = columnEdges(lines);
  if (cols) return cols.os - 0.06 * (cols.os - cols.od);
  // Barrett Toric pages have no biometry columns; use the "OD right ... left OS" heading.
  const words = lines.flatMap((l) => l.words);
  const os = words.find((w) => w.text === 'OS');
  const od = os && words.find((w) => /^.?OD$/.test(w.text) && Math.abs(w.y0 - os.y0) < 3 * (os.y1 - os.y0));
  return od && os ? (od.x0 + os.x0) / 2 : imageWidth / 2;
}

// ---- Reading the tables ----------------------------------------------------

interface Row {
  iol: number;
  /** Residual refraction; undefined when OCR lost its sign. */
  se?: number;
  seAbs?: number;
}

export interface PowerPick {
  power: number;
  /** The table was only partly readable, or two ways of reading it disagreed. */
  uncertain: boolean;
}

/**
 * Picks the power from a table's digits-only OCR text. Tables list IOL powers
 * in 0.5 D steps with their residual refraction; monofocal tables then give
 * the exact (non-step) power for the target refraction, e.g. "+21.98  0.00".
 * That exact power rounded to the nearest 0.5 D is the lens, cross-checked by
 * interpolating the step rows where the residual crosses zero (the only method
 * on toric pages, which print "---" instead).
 */
export function pickPower(text: string): PowerPick | undefined {
  const rows: Row[] = [];
  for (const raw of text.split('\n')) {
    // OCR often reads a leading "+" as "4": "42250" is "+22.50" (no IOL is 41-43 D).
    const line = raw.replace(/(^|\s)4(?=[1-3]\d\.?\d{2})/, '$1+');
    const m = /([+-]?)(\d{2})\.?(\d{2})(?:\s*([+-]?)(\d)\.?(\d{2}))?/.exec(line);
    if (!m) continue;
    // Sign ignored: no negative IOLs here, and OCR reads "+" as "-" ("-1750").
    const iol = Number(`${m[2]}.${m[3]}`);
    if (iol < 5 || iol > 35) continue;
    const seAbs = m[5] === undefined ? undefined : Number(`${m[5]}.${m[6]}`);
    const se = seAbs === 0 ? 0 : seAbs !== undefined && m[4] ? (m[4] === '-' ? -seAbs : seAbs) : undefined;
    rows.push({ iol, se, seAbs: seAbs !== undefined && seAbs < 3 ? seAbs : undefined });
  }
  const isStep = (r: Row) => Math.abs(r.iol * 2 - Math.round(r.iol * 2)) < 1e-6;
  const steps = rows.filter(isStep).sort((a, b) => b.iol - a.iol);
  const exact = rows.find((r) => !isStep(r));
  const fromExact = exact && roundToHalf(exact.iol);

  resolveSigns(steps);
  let fromRows: number | undefined;
  const signed = steps.filter((r) => r.se !== undefined);
  for (let i = 1; i < signed.length && fromRows === undefined; i++) {
    const [a, b] = [signed[i - 1], signed[i]];
    if (a.se! <= 0 && b.se! >= 0 && b.se! > a.se! && a.iol - b.iol <= 1) {
      fromRows = roundToHalf(a.iol - ((a.iol - b.iol) * -a.se!) / (b.se! - a.se!));
    }
  }

  // No crossing read (rows lost): extend the trend of the two rows nearest zero
  // by at most 0.5 D, and ask the user to check.
  let extrapolated: number | undefined;
  if (fromExact === undefined && fromRows === undefined && signed.length >= 2) {
    const [a, b] = [...signed].sort((p, q) => Math.abs(p.se!) - Math.abs(q.se!));
    const slope = (b.se! - a.se!) / (b.iol - a.iol); // residual per dioptre, negative
    const zero = slope < 0 ? a.iol - a.se! / slope : NaN;
    if (Math.abs(zero - a.iol) <= 0.5) extrapolated = roundToHalf(zero);
  }

  const power = fromExact ?? fromRows ?? extrapolated;
  if (power === undefined) return undefined;
  return {
    power,
    uncertain: extrapolated !== undefined || (fromExact !== undefined && fromRows !== undefined && fromExact !== fromRows),
  };
}

/**
 * Residuals rise as the IOL power falls. Where OCR dropped a residual's sign,
 * choose the only sign that keeps that order against the signed rows.
 */
function resolveSigns(steps: Row[]): void {
  for (let pass = 0; pass < 2; pass++) {
    steps.forEach((r, i) => {
      if (r.se !== undefined || r.seAbs === undefined) return;
      const above = steps.slice(0, i).filter((s) => s.se !== undefined).at(-1)?.se; // higher power: smaller residual
      const below = steps.slice(i + 1).find((s) => s.se !== undefined)?.se; // lower power: larger residual
      const ok = (v: number) => (above === undefined || v > above) && (below === undefined || v < below);
      const options = [r.seAbs, -r.seAbs].filter(ok);
      if (options.length === 1 && (above !== undefined || below !== undefined)) r.se = options[0];
    });
  }
}


/**
 * Reads the "Toric Power" column (e.g. "375 3.75 +0.10@90", "T5 3.00 +0.40@0")
 * and returns the recommended cylinder: the middle of the three listed, or the
 * only one. Each cylinder is the value just before the residual astigmatism's sign.
 */
export function pickCylinder(text: string): number | undefined {
  const cyls: number[] = [];
  for (const line of text.split('\n')) {
    const m = /(\d)\.?(\d{2})\s*[+-]\s*\d/.exec(line);
    if (!m) continue;
    const cyl = Number(`${m[1]}.${m[2]}`);
    if (modelForCylinder('ZCU', cyl)) cyls.push(cyl);
  }
  if (cyls.length === 3) return cyls[1];
  if (cyls.length === 1) return cyls[0];
  return undefined;
}

export interface TableText {
  eye: Eye;
  platform: TablePlatform;
  label: string;
  power: string;
  toric?: string;
}

export interface LensSuggestion extends PowerPick {
  /** Table it came from, e.g. "ZCB00". */
  label: string;
  /** Recommended toric cylinder, from Barrett Toric pages. */
  cyl?: number;
}

export type LensSuggestions = Partial<Record<Eye, Partial<Record<TablePlatform, LensSuggestion>>>>;

export function suggestLenses(tables: TableText[]): LensSuggestions {
  const out: LensSuggestions = {};
  for (const t of tables) {
    const pick = pickPower(t.power);
    if (!pick) continue;
    const cyl = t.toric === undefined ? undefined : pickCylinder(t.toric);
    (out[t.eye] ??= {})[t.platform] = { ...pick, label: t.label, ...(cyl === undefined ? {} : { cyl }) };
  }
  return out;
}
