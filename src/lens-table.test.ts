import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findLensTables, pickPower, suggestPowers } from './lens-table';
import { formatPower, roundToHalf } from './lenses';
import type { OcrPass } from './ocr-types';

describe('pickPower', () => {
  it('rounds the exact target power from real OCR of a pen-circled table', () => {
    // Digits-only OCR of the OD ZCB00 table; the circled +22.00 row was lost.
    expect(pickPower('10..\n+23.00 -0.75\n+2250-0.38\n+21.50 +0.35\n+2198 0.00\n42.09+4.0')).toEqual({ power: 22, uncertain: false });
  });

  it('interpolates when the exact row is unreadable', () => {
    expect(pickPower('+22.00 -0.77\n+21.50 -0.40\n+21.00 -0.04\n+20.50 +0.31')).toEqual({ power: 21, uncertain: false });
  });

  it('flags disagreement between the exact row and the step rows', () => {
    expect(pickPower('+22.50 -0.38\n+21.50 +0.35\n+2170 0.00')).toEqual({ power: 21.5, uncertain: true });
  });

  it('ignores unsigned residuals and returns nothing for junk', () => {
    expect(pickPower('+2300 085\n+2250 048')).toBeUndefined();
    expect(pickPower('LF +2.02 DF')).toBeUndefined();
  });
});

const photo: { passes: OcrPass[]; tables: Parameters<typeof suggestPowers>[0] } = JSON.parse(
  readFileSync(new URL('../test/fixtures/iolmaster-700-photo.json', import.meta.url), 'utf8'),
);

describe('real IOLMaster 700 photo', () => {
  it('suggests the power for each eye and lens family', () => {
    expect(suggestPowers(photo.tables)).toEqual({
      Right: { ZCU: { power: 22, uncertain: false }, CNA0T: { power: 22, uncertain: false } },
      Left: { ZCU: { power: 21, uncertain: false }, CNA0T: { power: 21, uncertain: false } },
    });
  });

  it('finds ZCB00 and Clareon tables for both eyes despite garbled lens names', () => {
    const full = photo.passes[photo.passes.length - 1];
    const found = findLensTables(full, 1500).map((r) => `${r.eye} ${r.platform} ${Math.round(r.x0)}`);
    expect(found).toHaveLength(4);
    // OD tables sit left of the OS column edge (~710px on this 1500px photo).
    expect(found.filter((f) => f.startsWith('Right')).every((f) => Number(f.split(' ')[2]) < 700)).toBe(true);
    expect(found.filter((f) => f.startsWith('Left')).every((f) => Number(f.split(' ')[2]) > 650)).toBe(true);
  });
});

describe('lens helpers', () => {
  it('formats and rounds powers', () => {
    expect(formatPower('22')).toBe('+22.0D');
    expect(formatPower('21.5')).toBe('+21.5D');
    expect(roundToHalf(21.98)).toBe(22);
    expect(roundToHalf(21.25)).toBe(21.5);
    expect(roundToHalf(21.07)).toBe(21);
  });
});
