import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findLensTables, pickCylinder, pickPower, suggestLenses, type TableText } from './lens-table';
import { formatPower, inferEye, modelForCylinder, parsePower, roundToHalf } from './lenses';
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

  it('extends the trend when the rows around zero were lost, flagged to check', () => {
    // Real OCR: "+17.50" read as "-1750", "+16.50" lost its "1".
    expect(pickPower('+18.00 -0.82\n-1750-048\n\n+17.00 -0.16\n\n6.50 +0.17\n-- 0.00')).toEqual({ power: 17, uncertain: true });
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
    const found = findLensTables(photo.passes[photo.passes.length - 1], 2400);
    expect(found.map((r) => `${r.eye} ${r.platform}`).sort()).toEqual(['Left CNA0T', 'Left ZCU', 'Right CNA0T', 'Right ZCU']);
    expect(found.every((r) => (r.eye === 'Right' ? r.power.x0 < 700 : r.power.x0 > 650))).toBe(true);
    expect(found.every((r) => !r.toric)).toBe(true);
  });
});

describe('Barrett Toric page (real photo, OS only)', () => {
  const photo = load('iolmaster-700-toric-photo.json');

  it('finds the ZCT table for the left eye only, and ignores AcrySof tables', () => {
    const found = findLensTables(photo.passes[photo.passes.length - 1], 2116);
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

describe('one-eye Barrett Universal II page, tables in a different order (real photo)', () => {
  const photo = load('iolmaster-700-os-photo.json');

  it('classifies tables by name, not position, and finds only the left eye', () => {
    const found = findLensTables(photo.passes[photo.passes.length - 1], 2400);
    expect(found.map((r) => `${r.eye} ${r.platform} ${r.label}`)).toEqual(['Left CNA0T Clareon CNA 0Tx', 'Left ZCU ZCB00']);
  });

  it('suggests ZCB00 +20.5 (exact 20.38) and Clareon +20.0 (exact 20.24)', () => {
    expect(suggestLenses(photo.tables)).toEqual({
      Left: {
        ZCU: { power: 20.5, uncertain: false, label: 'ZCB00' },
        CNA0T: { power: 20, uncertain: false, label: 'Clareon CNA 0Tx' },
      },
    });
  });
});

describe('both-eye page with monofocal and Barrett Toric TK tables (real photo)', () => {
  const photo = load('iolmaster-700-both-toric-photo.json');

  it('prefers the toric ZCT table over ZCB00, ignores other lenses, finds no Clareon', () => {
    const found = findLensTables(photo.passes[photo.passes.length - 1], 2400);
    expect(found.map((r) => `${r.eye} ${r.platform} ${r.label}`).sort()).toEqual(['Left ZCU ZCT', 'Right ZCU ZCT']);
  });

  it('suggests power and the middle toric model for each eye', () => {
    expect(suggestLenses(photo.tables)).toEqual({
      Right: { ZCU: { power: 17, uncertain: true, label: 'ZCT', cyl: 3 } },
      Left: { ZCU: { power: 16, uncertain: false, label: 'ZCT', cyl: 1.5 } },
    });
  });
});

describe('small tilted photo with the lens tables in the usual order (real photo)', () => {
  const photo = load('iolmaster-700-walt-photo.json');

  it('classifies each table by its own name, even at the page edge next to a neighbour', () => {
    const found = findLensTables(photo.passes[photo.passes.length - 1], 2400);
    expect(found.map((r) => `${r.eye} ${r.platform}`).sort()).toEqual(['Left CNA0T', 'Left ZCU', 'Right CNA0T', 'Right ZCU']);
  });

  it('suggests the power for each eye and family', () => {
    expect(suggestLenses(photo.tables)).toEqual({
      Right: { ZCU: { power: 15, uncertain: false, label: 'ZCB00' }, CNA0T: { power: 15, uncertain: false, label: 'Clareon CNA 0Tx' } },
      Left: { ZCU: { power: 18, uncertain: false, label: 'ZCB00' }, CNA0T: { power: 17.5, uncertain: false, label: 'Clareon CNA 0Tx' } },
    });
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
    expect(formatPower('16')).toBe('+16.0D');
    expect(formatPower('+16.0D')).toBe('+16.0D');
    expect(formatPower(' 16 d')).toBe('+16.0D');
    expect(formatPower('16,5')).toBe('+16.5D');
    expect(formatPower('-1.5')).toBe('-1.5D');
    expect(formatPower('0')).toBe('+0.0D');
    expect(formatPower('16.25')).toBe('+16.25D'); // not silently rounded
    expect(formatPower('abc')).toBe('abc');
    expect(formatPower('')).toBe('');
    expect(parsePower('+16.0D')).toBe(16);
    expect(parsePower('16.5.5')).toBeUndefined();
    expect(roundToHalf(21.98)).toBe(22);
    expect(roundToHalf(21.25)).toBe(21.5);
    expect(roundToHalf(21.07)).toBe(21);
    expect(modelForCylinder('ZCU', 1)).toBe('ZCU100');
    expect(modelForCylinder('CNA0T', 6)).toBe('CNA0T9');
    expect(modelForCylinder('ZCU', 2)).toBeUndefined();
  });
});

describe('inferEye', () => {
  const ast = (r?: string, l?: string) => ({ ...(r ? { Right: { power: r } } : {}), ...(l ? { Left: { power: l } } : {}) });

  it('uses the only eye with tables', () => {
    expect(inferEye(['Left'], ast('2.5', '2.6'), 2)?.eye).toBe('Left');
  });

  it('uses the only eye with Ast. K >= 2 D', () => {
    expect(inferEye(['Right', 'Left'], ast('2.12', '0.83'), 2)).toMatchObject({ eye: 'Right' });
    expect(inferEye([], ast('0.5', '-2.25'), 2)?.eye).toBe('Left');
    expect(inferEye([], ast('2.00', '1.99'), 2)?.eye).toBe('Right');
  });

  it('does not guess when both, neither or nothing qualifies', () => {
    expect(inferEye(['Right', 'Left'], ast('2.5', '3.1'), 2)).toBeUndefined();
    expect(inferEye(['Right', 'Left'], ast('0.5', '0.8'), 2)).toBeUndefined();
    expect(inferEye(['Right', 'Left'], {}, 2)).toBeUndefined();
    expect(inferEye(['Right', 'Left'], ast('2.4'), 2)?.eye).toBe('Right');
  });
});
