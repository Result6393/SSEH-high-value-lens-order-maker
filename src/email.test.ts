import { describe, expect, it } from 'vitest';
import { attachmentStem, eligibilityWarning, emailBody, emailSubject, joinName, lensText, patientName, validate } from './email';
import type { RequestData, Settings } from './types';

const req: RequestData = {
  eye: 'Right', name: 'CITIZEN, Jane', mrn: '1234567',
  astKRight: '2.39', astKLeft: '1.10', vmo: '', surgeryDate: '', lensModel: 'ZCU300', lensPower: '22', company: 'J&J', diagnosis: 'High cyl / astigmatism >2',
};
const settings: Settings = { recipients: '', clinicianName: 'Thomas Desmond', contactNumber: '', vmo: '', lensPlatform: 'ZCU', emailBody: '', tutoplastEmailBody: '' };

describe('email', () => {
  it('builds subject, body and attachment names', () => {
    expect(emailSubject(req)).toBe('Toric IOL request - MRN 1234567 - Right eye');
    expect(emailBody(settings, req)).toBe(
      'RE: CITIZEN, Jane 1234567\nZCU300 +22.0D\n\nHi All,\n\nPlease find a filled toric lens request form and biometry.\n\nAll the best,\nThomas',
    );
    expect(emailBody({ ...settings, clinicianName: 'Dr Jo Bloggs' }, req)).toMatch(/\nJo$/);
    expect(lensText({ lensModel: 'CNA0T5', lensPower: '17.5' })).toBe('CNA0T5 +17.5D');
    expect(lensText({ lensModel: 'ZCU300', lensPower: '' })).toBe('ZCU300');
    expect(lensText({ lensModel: '', lensPower: '' })).toBe('');
    expect(patientName({ name: '  CITIZEN,   Jane ' })).toBe('CITIZEN, Jane');
    expect(joinName('o\'neil', '')).toBe("O'NEIL");
    expect(joinName('smith', ' John ')).toBe('SMITH, John');
    expect(attachmentStem({ ...req, eye: 'Left', mrn: '12/34' })).toBe('1234_L');
  });

  it('uses the custom email text, replacing placeholders everywhere, and falls back to the default when blank', () => {
    const custom = { ...settings, emailBody: 'Hello team,\r\n\r\nRe {patient} ({mrn}, {mrn}) {lens}.\r\n\r\nThanks, {name}\n\n' };
    expect(emailBody(custom, req)).toBe('Hello team,\n\nRe CITIZEN, Jane (1234567, 1234567) ZCU300 +22.0D.\n\nThanks, Thomas');
    expect(emailBody({ ...settings, emailBody: '   \n ' }, req)).toBe(emailBody(settings, req));
    expect(emailBody({ ...settings, emailBody: 'No placeholder here' }, req)).toBe('No placeholder here');
  });

  it('flags missing or malformed fields', () => {
    expect(validate(req)).toEqual([]);
    expect(validate({ ...req, astKRight: '' })).toEqual([]);
    expect(validate({ ...req, name: ' ', astKRight: 'abc' })).toHaveLength(2);
    expect(validate({ ...req, astKLeft: 'x' })).toEqual(['Ast. K LE should be a number.']);
    expect(validate({ ...req, lensModel: '', lensPower: 'abc' })).toHaveLength(2);
    for (const ok of ['16', '+16', '16.0', '16D', '+16.0D', '16,5', ' 16 d ']) expect(validate({ ...req, lensPower: ok })).toEqual([]);
    expect(validate({ ...req, lensPower: '1600' })).toHaveLength(1);
  });

  it('warns below the toric threshold', () => {
    expect(eligibilityWarning(req)).toBeUndefined();
    expect(eligibilityWarning({ ...req, astKRight: '-2.25' })).toBeUndefined();
    expect(eligibilityWarning({ ...req, astKRight: '' })).toBeUndefined();
    expect(eligibilityWarning({ ...req, astKRight: '0.39' })).toMatch(/\(RE\) is below 2.00 D/);
    // Only the operative eye is judged: the left eye is 1.10 D here.
    expect(eligibilityWarning({ ...req, eye: 'Left' })).toMatch(/1.10 D \(LE\)/);
    expect(eligibilityWarning({ ...req, eye: 'Left', astKLeft: '' })).toBeUndefined();
  });
});
