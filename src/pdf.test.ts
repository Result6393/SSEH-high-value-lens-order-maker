import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DIAGNOSIS, ageOn, eyeLine, fillOrderForm, fillTutoplastForm, wrapLines } from './pdf';
import { TUTOPLAST_DIAGNOSES } from './tutoplast';
import type { RequestData } from './types';

const req: RequestData = {
  eye: 'Left', surname: 'Citizen', firstName: 'Jane', mrn: '7654321', dob: '01/02/1950',
  astK: '2.39', astAxis: '60', vmo: 'Dr Surgeon', surgeryDate: '2026-11-03', lensModel: 'CNA0T2', lensPower: '20.5', company: 'Alcon', diagnosis: 'High cyl / astigmatism >2',
};

describe('order form', () => {
  it('fills the template without breaking it', async () => {
    const template = readFileSync(new URL('../public/forms/toric-lens-order-form.pdf', import.meta.url));
    const out = await fillOrderForm(template, req, { recipients: '', clinicianName: 'Dr Test', contactNumber: '0400 000 000', vmo: '', lensPlatform: 'ZCU', emailBody: '', tutoplastEmailBody: '' }, new Date(2026, 9, 5));
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
  });

  it('defaults the diagnosis and fills the form for short, blank and very long diagnoses', async () => {
    expect(DEFAULT_DIAGNOSIS).toBe('High cyl / astigmatism >2');
    const template = readFileSync(new URL('../public/forms/toric-lens-order-form.pdf', import.meta.url));
    const settings = { recipients: '', clinicianName: 'Dr Test', contactNumber: '', vmo: '', lensPlatform: 'ZCU' as const, emailBody: '', tutoplastEmailBody: '' };
    for (const diagnosis of [DEFAULT_DIAGNOSIS, '', 'Dense cataract\nwith high corneal astigmatism', 'word '.repeat(200)]) {
      const out = await fillOrderForm(template, { ...req, diagnosis }, settings, new Date(2026, 9, 5));
      expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
    }
  });

  it('ships a form with no pre-filled lens, company or diagnosis text', async () => {
    // Drawing over those values only hides them; they must be gone from the PDF itself.
    const { PDFName, PDFRawStream, decodePDFRawStream } = await import('pdf-lib');
    const doc = await PDFDocument.load(readFileSync(new URL('../public/forms/toric-lens-order-form.pdf', import.meta.url)));
    const hex = (t: string) => Buffer.from(t, 'latin1').toString('hex').toUpperCase();
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream) || String(obj.dict.get(PDFName.of('Subtype'))) !== '/Form') continue;
      const content = Buffer.from(decodePDFRawStream(obj).decode()).toString('latin1').toUpperCase();
      for (const text of ['ZCU', 'J&J', 'High cyl / astigmatism >2D']) expect(content).not.toContain(hex(text));
    }
  });

  it('fills the tutoplast order on the same form', async () => {
    const template = readFileSync(new URL('../public/forms/toric-lens-order-form.pdf', import.meta.url));
    const settings = { recipients: '', clinicianName: 'Dr Test', contactNumber: '', vmo: '', lensPlatform: 'ZCU' as const, emailBody: '', tutoplastEmailBody: '' };
    const order = { eye: 'Right' as const, surname: 'Citizen', firstName: 'Jane', mrn: '7654321', dob: '01/02/1950', vmo: 'Dr Surgeon', surgeryDate: '', implant: 'Tutoplast', company: 'Tutogen' };
    for (const diagnosis of [...TUTOPLAST_DIAGNOSES, 'x '.repeat(300)]) {
      const out = await fillTutoplastForm(template, { ...order, diagnosis }, settings, new Date(2026, 9, 5));
      const doc = await PDFDocument.load(out);
      expect(doc.getPageCount()).toBe(1);
      expect(doc.getTitle()).toBe('High cost order - tutoplast - Right eye');
    }
  });

  it('wraps text to a width, keeping line breaks', () => {
    const w = (t: string) => t.length * 10; // 10 px per character
    expect(wrapLines('aaa bbb ccc', w, 70)).toEqual(['aaa bbb', 'ccc']);
    expect(wrapLines('one\ntwo three', w, 1000)).toEqual(['one', 'two three']);
    expect(wrapLines('supercalifragilistic x', w, 50)).toEqual(['supercalifragilistic', 'x']);
    expect(wrapLines('', w, 50)).toEqual(['']);
    expect(wrapLines('a\n\n', w, 50)).toEqual(['a']);
  });

  it('states the operative eye and astigmatism', () => {
    expect(eyeLine(req)).toBe('LEFT EYE (OS)   Corneal astigmatism 2.39 D @ 60°');
    expect(eyeLine({ ...req, eye: 'Right', astK: '' })).toBe('RIGHT EYE (OD)');
  });

  it('computes age from dd/mm/yyyy', () => {
    expect(ageOn('06/10/1950', new Date(2026, 9, 5))).toBe(75);
    expect(ageOn('05/10/1950', new Date(2026, 9, 5))).toBe(76);
    expect(ageOn('bad', new Date())).toBeUndefined();
  });
});
