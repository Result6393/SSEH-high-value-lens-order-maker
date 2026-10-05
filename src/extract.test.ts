import { describe, expect, it } from 'vitest';
import { extractPatient } from './extract';

describe('extractPatient', () => {
  it('reads IOLMaster-style header', () => {
    const text = 'IOLMaster 700\nPatient: Citizen, Jane   Date of birth: 01/02/1950\nPatient ID: 1234567\n';
    expect(extractPatient(text)).toEqual({ name: 'Citizen, Jane', mrn: '1234567' });
  });

  it('reads separate surname and first name fields', () => {
    const text = 'Last name: Smith   First name: John\nDOB 3/4/1948  MRN: 00987654';
    expect(extractPatient(text)).toEqual({ name: 'SMITH, John', mrn: '00987654' });
  });

  it('does not take "Patient ID" as the name', () => {
    const text = 'Patient ID: 555123\nName: Brown, Alice';
    expect(extractPatient(text)).toEqual({ name: 'Brown, Alice', mrn: '555123' });
  });

  it('accepts UR number labels and fixes O/0 confusion', () => {
    expect(extractPatient('UR No: 12O45I7').mrn).toBe('1204517');
  });

  it('returns empty strings when nothing matches', () => {
    expect(extractPatient('AL 23.45 mm\nK1 43.2 D')).toEqual({ name: '', mrn: '' });
  });
});
