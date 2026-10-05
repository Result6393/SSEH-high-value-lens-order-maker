import { describe, expect, it } from 'vitest';
import { attachmentStem, emailSubject, validate } from './email';
import type { RequestData } from './types';

const req: RequestData = { name: 'Citizen, Jane', mrn: '1234567', eye: 'Right', cyl: '2.5' };

describe('email', () => {
  it('builds subject and attachment names', () => {
    expect(emailSubject(req)).toBe('Toric IOL approval request - MRN 1234567 - Right eye');
    expect(attachmentStem({ ...req, eye: 'Left', mrn: '12/34' })).toBe('1234_L');
  });

  it('flags missing fields and sub-threshold astigmatism', () => {
    expect(validate(req)).toEqual([]);
    expect(validate({ ...req, cyl: '' })).toEqual([]);
    expect(validate({ ...req, cyl: '-2.25' })).toEqual([]);
    expect(validate({ ...req, name: ' ', cyl: '1.75' })).toHaveLength(2);
  });
});
