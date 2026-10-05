import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findLensTables, pickCylinder, pickPower, suggestLenses, type TableText } from './lens-table';
import { formatPower, modelForCylinder, roundToHalf } from './lenses';
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

  it('reads "+" misread as "4" and restores lost minus signs from the row order', () => {
    // Real OCR of a Barrett Toric ZCT table: no exact row ("---"), 22.00's minus lost.
    expect(pickPower('42250062\n422.00 0.26\n+21.50+0.09\n42100+044\n-- 000')).toEqual({ power: 21.5, uncertain: false });
  });

  it('ignores residuals whose sign cannot be worked out, and junk', () => {
    expect(pickPower('+2300 085\n+2250 048')).toBeUndefined();
    expect(pickPower('LF +2.02 DF')).toBeUndefined();
  });
});

const load = (name: string): { passes: OcrPass[]; tables: TableText[] } =>
  JSON.parse(readFileSync(new URL(`../test/fixtures/${name}`, import.meta.url), 'utf8'));

describe('Barrett Universal II page (real photo, both eyes)', () => {
  const photo = load('iolmaster-700-photo.json');

  it('suggests the power for each eye and lens family', () => {
    expect(suggestLenses(photo.tables)).toEqual({
      Right: {
        ZCU: { power: 22, uncertain: false, label: 'ZCB00' },
        CNA0T: { power: 22, uncertain: false, label: 'Clareon CNA 0Tx' },
      },
      Left: {
        ZCU: { power: 21, uncertain: false, label: 'ZCB00' },
        CNA0T: { power: 21, uncertain: false, label: 'Clareon CNA 0Tx' },
      },
    });
  });

  it('finds the tables despite garbled lens names, OD left of OS', () => {
    const found = findLensTables(photo.passes[photo.passes.length - 1], 1500);
    expect(found.map((r) => `${r.eye} ${r.platform}`).sort()).toEqual(['Left CNA0T', 'Left ZCU', 'Right CNA0T', 'Right ZCU']);
    expect(found.every((r) => (r.eye === 'Right' ? r.power.x0 < 700 : r.power.x0 > 650))).toBe(true);
    expect(found.every((r) => !r.toric)).toBe(true);
  });
});

describe('Barrett Toric page (real photo, OS only)', () => {
  const photo = load('iolmaster-700-toric-photo.json');

  it('finds the ZCT table for the left eye only, and ignores AcrySof tables', () => {
    const found = findLensTables(photo.passes[photo.passes.length - 1], 1035);
    expect(found.map((r) => `${r.eye} ${r.platform} ${r.label}`)).toEqual(['Left ZCU ZCT']);
    expect(found.every((r) => r.toric)).toBe(true);
  });

  it('suggests power and the recommended (bold, middle) toric model, no Clareon', () => {
    const s = suggestLenses(photo.tables);
    expect(s).toEqual({ Left: { ZCU: { power: 21.5, uncertain: false, label: 'ZCT', cyl: 3 } } });
    expect(modelForCylinder('ZCU', s.Left!.ZCU!.cyl!)).toBe('ZCU300');
    expect(modelForCylinder('CNA0T', 3)).toBe('CNA0T5');
  });
});

describe('pickCylinder', () => {
  it('takes the middle of three models, or the only one', () => {
    expect(pickCylinder('3753.75+0.10@90\n3003.00+041@\n225225+091@0')).toBe(3);
    expect(pickCylinder('T63.75+0.11 @90\nT53.00 +040@\nT4225+091@0')).toBe(3);
    expect(pickCylinder('3.00 +0.34@ 0')).toBe(3);
    expect(pickCylinder('3753.75+0.10@90\n3003.00+041@')).toBeUndefined();
  });
});

describe('lens helpers', () => {
  it('formats and rounds powers', () => {
    expect(formatPower('22')).toBe('+22.0D');
    expect(formatPower('21.5')).toBe('+21.5D');
    expect(roundToHalf(21.98)).toBe(22);
    expect(roundToHalf(21.25)).toBe(21.5);
    expect(roundToHalf(21.07)).toBe(21);
    expect(modelForCylinder('ZCU', 1)).toBe('ZCU100');
    expect(modelForCylinder('CNA0T', 6)).toBe('CNA0T9');
    expect(modelForCylinder('ZCU', 2)).toBeUndefined();
  });
});
