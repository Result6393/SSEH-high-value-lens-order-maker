import { describe, expect, it } from 'vitest';
import { OTHER_DIAGNOSIS, TUTOPLAST_DIAGNOSES, diagnosisText, validateTutoplast } from './tutoplast';
import { DEFAULT_TUTOPLAST_EMAIL_BODY, tutoplastBody, tutoplastSubject } from './email';
import type { Settings, TutoplastRequest } from './types';

const req: TutoplastRequest = {
  eye: 'Left', name: 'CITIZEN, Jane', mrn: '1234567', dob: '01/02/1950', vmo: '', surgeryDate: '',
  implant: 'Tutoplast', company: 'Tutogen', diagnosis: TUTOPLAST_DIAGNOSES[1],
};
const settings: Settings = { recipients: '', clinicianName: 'Dr Jo Bloggs', contactNumber: '', vmo: '', lensPlatform: 'ZCU', emailBody: '', tutoplastEmailBody: '' };

describe('tutoplast order', () => {
  it('maps the diagnosis dropdown to the form text', () => {
    expect(diagnosisText(TUTOPLAST_DIAGNOSES[0], 'ignored')).toBe(TUTOPLAST_DIAGNOSES[0]);
    expect(diagnosisText(OTHER_DIAGNOSIS, '  Exposed tube\n')).toBe('Exposed tube');
    expect(diagnosisText('', 'typed')).toBe('');
    expect(diagnosisText('something else', '')).toBe('');
  });

  it('validates', () => {
    expect(validateTutoplast(req, TUTOPLAST_DIAGNOSES[1])).toEqual([]);
    expect(validateTutoplast({ ...req, mrn: '', name: '' }, TUTOPLAST_DIAGNOSES[1])).toEqual(['Name is missing.', 'MRN is missing.']);
    expect(validateTutoplast({ ...req, diagnosis: '' }, '')).toEqual(['Choose a diagnosis.']);
    expect(validateTutoplast({ ...req, diagnosis: '' }, OTHER_DIAGNOSIS)).toEqual(['Enter the diagnosis text.']);
    expect(validateTutoplast({ ...req, implant: ' ', company: '' }, TUTOPLAST_DIAGNOSES[1])).toEqual(['Implant is missing.', 'Company is missing.']);
  });

  it('writes the email', () => {
    expect(tutoplastSubject(req)).toBe('Tutoplast order - MRN 1234567 - Left eye');
    expect(tutoplastBody(settings, req)).toBe("RE: CITIZEN, Jane 1234567\nTutoplast\n\nHi All,\n\nHere's a tutoplast order form.\n\nAll the best,\nJo");
    expect(tutoplastBody({ ...settings, tutoplastEmailBody: 'Re {patient}: {lens}' }, req)).toBe('Re CITIZEN, Jane: Tutoplast');
    expect(DEFAULT_TUTOPLAST_EMAIL_BODY).toContain('{name}');
  });
});
