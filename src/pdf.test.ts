import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { ageOn, eyeLine, fillOrderForm } from './pdf';
import type { RequestData } from './types';

const req: RequestData = {
  eye: 'Left', surname: 'Citizen', firstName: 'Jane', mrn: '7654321', dob: '01/02/1950',
  astK: '2.39', astAxis: '60', vmo: 'Dr Surgeon', surgeryDate: '2026-11-03', lensModel: 'CNA0T2', lensPower: '20.5', company: 'Alcon',
};

describe('order form', () => {
  it('fills the template without breaking it', async () => {
    const template = readFileSync(new URL('../public/forms/toric-lens-order-form.pdf', import.meta.url));
    const out = await fillOrderForm(template, req, { recipients: '', clinicianName: 'Dr Test', contactNumber: '0400 000 000', vmo: '', lensPlatform: 'ZCU' }, new Date(2026, 9, 5));
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
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
