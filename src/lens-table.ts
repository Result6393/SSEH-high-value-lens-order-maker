// Finds and reads the IOL power tables on an IOLMaster "IOL CALCULATION" page.
import { columnEdges } from './extract';
import { roundToHalf, type Platform } from './lenses';
import type { OcrPass } from './ocr-types';
import type { Eye } from './types';

export interface TableRegion {
  eye: Eye;
  platform: Exclude<Platform, 'Other'>;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Locates the ZCB00 (Tecnis, for ZCU) and Clareon "CNA 0Tx" (for CNA0T) tables
 * for each eye from the full-page pass. Lens names OCR badly, so tables are
 * anchored on the first row of "Barrett Universal II" formula headers, then
 * classified by the (fuzzy) lens name above each; if that fails and the row has
 * the usual six tables, by position (Clareon, Clareon, ZCB00 per eye). Sizes
 * are relative to the OD-OS column distance so any photo resolution works.
 */
export function findLensTables(pass: OcrPass, imageWidth: number): TableRegion[] {
  const cols = columnEdges(pass.lines);
  const unit = cols ? cols.os - cols.od : imageWidth / 3;
  const osEdge = cols ? cols.os : imageWidth / 2;
  const formula = (t: string) => /^(Barr?ett|Univers\w*)$/i.test(t);

  const row = pass.lines.find((l) => l.words.filter((w) => formula(w.text)).length >= 3);
  if (!row) return [];
  // Group formula words into tables; anchor = left edge of "Barrett".
  const anchors: { x: number; y: number }[] = [];
  for (const w of row.words.filter((w) => formula(w.text))) {
    const x = /^Barr/i.test(w.text) ? w.x0 : w.x0 - 0.1 * unit;
    const near = anchors.find((a) => Math.abs(a.x - x) < 0.15 * unit);
    if (near) near.x = Math.min(near.x, x);
    else anchors.push({ x, y: w.y0 });
  }
  anchors.sort((a, b) => a.x - b.x);

  const words = pass.lines.flatMap((l) => l.words);
  const classified = anchors.map((a) => {
    const header = words
      .filter((w) => !formula(w.text) && w.y0 >= a.y - 0.12 * unit && w.y0 <= a.y + 0.02 * unit)
      .filter((w) => w.x0 >= a.x - 0.05 * unit && w.x0 < a.x + 0.28 * unit)
      .map((w) => w.text)
      .join(' ');
    const platform: TableRegion['platform'] | undefined = /ZC|B[0O]{2}/i.test(header)
      ? 'ZCU'
      : /CNA|\bNA\b|[0O]Tx|Cl\w*on/i.test(header)
        ? 'CNA0T'
        : undefined;
    return { ...a, platform };
  });
  if (anchors.length === 6) {
    const usual = ['CNA0T', 'CNA0T', 'ZCU'] as const;
    classified.forEach((c, i) => (c.platform ??= usual[i % 3]));
  }

  const regions: TableRegion[] = [];
  for (const c of classified) {
    if (!c.platform) continue;
    const eye: Eye = c.x < osEdge - 0.06 * unit ? 'Right' : 'Left';
    // First table of each kind per eye wins (Clareon appears twice, same values).
    if (regions.some((r) => r.eye === eye && r.platform === c.platform)) continue;
    regions.push({ eye, platform: c.platform, x0: c.x - 0.02 * unit, x1: c.x + 0.31 * unit, y0: c.y, y1: c.y + 0.4 * unit });
  }
  return regions;
}

interface Row {
  iol: number;
  se?: number;
}
export interface PowerPick {
  power: number;
  /** The two ways of reading the table disagreed. */
  uncertain: boolean;
}

/**
 * Picks the power from a table's digits-only OCR text. Each table lists IOL
 * powers in 0.5 D steps with their residual refraction, then the exact
 * (non-step) power for the target refraction, e.g. "+21.98  0.00". That exact
 * power rounded to the nearest 0.5 D is the lens. It's cross-checked against
 * interpolating the step rows where the residual crosses zero.
 */
export function pickPower(text: string): PowerPick | undefined {
  const rows: Row[] = [];
  for (const line of text.split('\n')) {
    const m = /([+-]?)(\d{2})\.?(\d{2})(?:\s*([+-]?)(\d)\.?(\d{2}))?/.exec(line);
    if (!m) continue;
    const iol = Number(`${m[2]}.${m[3]}`) * (m[1] === '-' ? -1 : 1);
    if (iol < 5 || iol > 35) continue;
    const seAbs = m[5] === undefined ? undefined : Number(`${m[5]}.${m[6]}`);
    // A residual's sign is often lost in OCR; only trust signed (or zero) values.
    const se = seAbs === 0 ? 0 : seAbs !== undefined && m[4] ? (m[4] === '-' ? -seAbs : seAbs) : undefined;
    rows.push({ iol, se });
  }
  const isStep = (r: Row) => Math.abs(r.iol * 2 - Math.round(r.iol * 2)) < 1e-6;
  const steps = rows.filter(isStep);
  const exact = rows.find((r) => !isStep(r));
  const fromExact = exact && roundToHalf(exact.iol);

  let fromRows: number | undefined;
  const signed = steps.filter((r) => r.se !== undefined).sort((a, b) => b.iol - a.iol);
  for (let i = 1; i < signed.length && fromRows === undefined; i++) {
    const [a, b] = [signed[i - 1], signed[i]];
    if (a.se! <= 0 && b.se! >= 0 && b.se! > a.se! && a.iol - b.iol <= 1) {
      fromRows = roundToHalf(a.iol - ((a.iol - b.iol) * -a.se!) / (b.se! - a.se!));
    }
  }

  const power = fromExact ?? fromRows;
  if (power === undefined) return undefined;
  return { power, uncertain: fromExact !== undefined && fromRows !== undefined && fromExact !== fromRows };
}

export type LensSuggestions = Partial<Record<Eye, Partial<Record<TableRegion['platform'], PowerPick>>>>;

export function suggestPowers(tables: { eye: Eye; platform: TableRegion['platform']; text: string }[]): LensSuggestions {
  const out: LensSuggestions = {};
  for (const t of tables) {
    const pick = pickPower(t.text);
    if (pick) (out[t.eye] ??= {})[t.platform] = pick;
  }
  return out;
}
