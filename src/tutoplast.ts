import { validatePatient } from './email';
import type { TutoplastRequest } from './types';

/** Preset diagnoses for the order form; "Other" takes free text. */
export const TUTOPLAST_DIAGNOSES = [
  'IOP not controlled on maximal medical therapy. Needs tube filtration surgery with tutoplast cover.',
  'Hypotony. Needs trab flap revision with tutoplast.',
] as const;
export const OTHER_DIAGNOSIS = 'other';

export const DEFAULT_IMPLANT = 'Tutoplast';
export const DEFAULT_COMPANY = 'Tutogen';

/** The text for the Diagnosis box, from the dropdown value and the "Other" text. */
export function diagnosisText(choice: string, other: string): string {
  if (choice === OTHER_DIAGNOSIS) return other.trim();
  return TUTOPLAST_DIAGNOSES.find((d) => d === choice) ?? '';
}

export function validateTutoplast(req: TutoplastRequest, choice: string): string[] {
  const problems = validatePatient(req);
  if (!choice) problems.push('Choose a diagnosis.');
  else if (!req.diagnosis) problems.push('Enter the diagnosis text.');
  if (!req.implant.trim()) problems.push('Implant is missing.');
  if (!req.company.trim()) problems.push('Company is missing.');
  return problems;
}
