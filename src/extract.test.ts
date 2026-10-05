import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractBiometry, lineText } from './extract';
import type { OcrPass } from './ocr-types';

/** Fake OCR pass from text: 10px per character, so 2+ spaces make a wide gap. */
function pass(text: string): OcrPass {
  return {
    lines: text.split('\n').map((line, row) => ({
      words: [...line.matchAll(/\S+/g)].map((m) => ({
        text: m[0], x0: m.index * 10, x1: (m.index + m[0].length) * 10, y0: row * 20, y1: row * 20 + 10,
      })),
    })),
  };
}
const extract = (...texts: string[]) => extractBiometry(texts.map(pass));

describe('extractBiometry', () => {
  it('reads a real IOLMaster 700 photo (browser OCR output, fake identifiers)', () => {
    const { passes }: { passes: OcrPass[] } = JSON.parse(readFileSync(new URL('../test/fixtures/iolmaster-700-photo.json', import.meta.url), 'utf8'));
    const r = extractBiometry(passes);
    expect(r).toMatchObject({ surname: 'CITIZEN', mrn: '7654321', dob: '01/02/1950' });
    expect(r.firstName).toBe('Jane');
    // The full-page pass misreads the MRN (7054321), so the user is warned.
    expect(r.mrnUncertain).toBe(true);
    // OD's Ast. K is circled in pen and unreadable; OS must not be mistaken for OD.
    expect(r.astK).toEqual({ Left: { power: '0.31', axis: '106' } });
  });

  it('reads a real Barrett Toric page photo (fake identifiers)', () => {
    const { passes }: { passes: OcrPass[] } = JSON.parse(readFileSync(new URL('../test/fixtures/iolmaster-700-toric-photo.json', import.meta.url), 'utf8'));
    expect(extractBiometry(passes)).toMatchObject({ surname: 'KNIGHT', firstName: 'Tess', mrn: '3721234' });
  });

  it('reads a real one-eye (OS) page photo with pen marks over the labels', () => {
    const { passes }: { passes: OcrPass[] } = JSON.parse(readFileSync(new URL('../test/fixtures/iolmaster-700-os-photo.json', import.meta.url), 'utf8'));
    const r = extractBiometry(passes);
    expect(r).toMatchObject({ surname: 'LAWSON', mrn: '1265432' });
    expect(r.astK).toEqual({ Right: { power: '0.75', axis: '16' }, Left: { power: '0.90', axis: '145' } });
  });

  it('reads Ast. K with the D misread as 0 and stops before Ast. TK', () => {
    const page = 'AL 23.70    AL 23.79\nACD 5.22    ACD 3.17\nLT 0.14    LT 3.79\nAstK +0750 @ 16° ASLTK +092D    AstK (+0900 @145° Ast. TK +0.97D';
    expect(extract(page).astK).toEqual({ Right: { power: '0.75', axis: '16' }, Left: { power: '0.90', axis: '145' } });
  });

  it('finds "SURNAME, First" above Date of birth when the label is unreadable', () => {
    expect(extract('Palit  \\_  LAWSON, Mark  7\nDate of birth 12/07/1951')).toMatchObject({ surname: 'LAWSON', firstName: 'Mark' });
  });

  it('tolerates OCR dropping the "i" in Patient', () => {
    expect(extract('Patent    KNIGHT, Tess\nPatent ID 3721234')).toMatchObject({ surname: 'KNIGHT', mrn: '3721234' });
  });

  it('assigns Ast. K to eyes by column, even when one label is lost', () => {
    const page = [
      'AL 24.19 mm      WTW 12.0 mm      AL 24.25 mm',
      'ACD 2.52 mm      Pupil 3.0 mm     ACD 2.55 mm',
      'junk +0.39 D @ 60°   Ast. TK +0.34 D @ 50°   Ast. K -2.31 D @ 106°',
      'K1 40.97 D       TK1 41.03 D      K1 41.71 D',
    ].join('\n');
    expect(extract(page).astK).toEqual({ Left: { power: '2.31', axis: '106' } });
  });

  it('falls back to reading order when column labels are missing', () => {
    expect(extract('Ast. K +2.39 D @ 60° Ast. TK +0.34 D @ 50° Ast. K +1.75D @ 106°').astK).toEqual({
      Right: { power: '2.39', axis: '60' },
      Left: { power: '1.75', axis: '106' },
    });
    expect(extract('Ast. K +2.39 D @ 60°').astK).toEqual({});
  });

  it('restores dropped decimal points', () => {
    expect(extract('Ast. K +239D @ 60°\nAstK +031D @106°').astK.Left).toEqual({ power: '0.31', axis: '106' });
  });

  it('stops the name at a wide gap (tick marks, stamps)', () => {
    expect(extract('Patient     CITIZEN, Jane    Ge Dd')).toMatchObject({ surname: 'CITIZEN', firstName: 'Jane' });
  });

  it('prefers the reading without trailing junk', () => {
    expect(extract('Patient CITIZEN, Jane A @D', 'Patient CITIZEN, Jane = @')).toMatchObject({ firstName: 'Jane' });
  });

  it('reads separate surname and first name fields', () => {
    expect(extract('Last name: Smith   First name: John\nDOB 3/4/1948  MRN: 00987654')).toMatchObject({
      surname: 'Smith', firstName: 'John', mrn: '00987654', dob: '03/04/1948',
    });
  });

  it('does not take "Patient ID" as the name and handles OCR "1D"', () => {
    expect(extract('Patient 1D    555123\nPatient    Brown, Alice')).toMatchObject({ surname: 'Brown', firstName: 'Alice', mrn: '555123' });
  });

  it('rejects implausible birth years', () => {
    expect(extract('Date of birth 01/02/1550').dob).toBe('');
  });

  it('flags MRN disagreement between passes', () => {
    expect(extract('Patient ID 7654321', 'PatientID 7054321')).toMatchObject({ mrn: '7654321', mrnUncertain: true });
  });

  it('fixes O/0 confusion in UR numbers', () => {
    expect(extract('UR No: 12O45I7').mrn).toBe('1204517');
  });

  it('returns empty fields when nothing matches', () => {
    expect(extract('AL 23.45 mm')).toMatchObject({ surname: '', firstName: '', mrn: '', dob: '', astK: {} });
  });
});

describe('lineText', () => {
  it('marks wide gaps and drops table rules', () => {
    expect(lineText(pass('Patient    CITIZEN, Jane | x').lines[0])).toBe('Patient ¦ CITIZEN, Jane ¦ x');
  });
});
