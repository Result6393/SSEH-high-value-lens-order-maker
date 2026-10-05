import { describe, expect, it } from 'vitest';
import { attachmentStem, eligibilityWarning, emailBody, emailSubject, validate } from './email';
import type { RequestData, Settings } from './types';

const req: RequestData = {
  eye: 'Right', surname: 'Citizen', firstName: 'Jane', mrn: '1234567', dob: '01/02/1950',
  astK: '2.39', astAxis: '60', vmo: '', surgeryDate: '',
};
const settings: Settings = { recipients: '', clinicianName: 'Dr Test', contactNumber: '', vmo: '' };

describe('email', () => {
  it('builds subject, body and attachment names', () => {
    expect(emailSubject(req)).toBe('Toric IOL request - MRN 1234567 - Right eye');
    expect(emailBody(req, settings)).toContain('Jane CITIZEN, MRN 1234567, RIGHT eye');
    expect(attachmentStem({ ...req, eye: 'Left', mrn: '12/34' })).toBe('1234_L');
  });

  it('flags missing or malformed fields', () => {
    expect(validate(req)).toEqual([]);
    expect(validate({ ...req, astK: '' })).toEqual([]);
    expect(validate({ ...req, surname: ' ', astK: 'abc' })).toHaveLength(2);
    expect(validate({ ...req, dob: '1/2/50' })).toHaveLength(1);
  });

  it('warns below the toric threshold', () => {
    expect(eligibilityWarning(req)).toBeUndefined();
    expect(eligibilityWarning({ ...req, astK: '-2.25' })).toBeUndefined();
    expect(eligibilityWarning({ ...req, astK: '' })).toBeUndefined();
    expect(eligibilityWarning({ ...req, astK: '0.39' })).toMatch(/below 2.00 D/);
  });
});
