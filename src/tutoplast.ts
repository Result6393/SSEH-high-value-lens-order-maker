import { validatePatient } from './email';
import type { OrderKind, TutoplastRequest } from './types';

/** Preset diagnoses for the order form; "Other" takes free text. */
export const TUTOPLAST_DIAGNOSES = [
  'IOP not controlled on maximal medical therapy. Needs tube filtration surgery with tutoplast cover.',
  'Hypotony, needs tube flap revision with tutoplast.',
] as const;
export const ISTENT_DIAGNOSIS = 'Glaucoma with IOP not adequately controlled with maximal medical therapy';
export const OTHER_DIAGNOSIS = 'other';

/**
 * The orders made from a patient sticker. They share the form, recipients and fields;
 * only these defaults differ. A single preset diagnosis is preselected.
 */
export const ORDER_KINDS: Record<OrderKind, { label: string; implant: string; company: string; diagnoses: readonly string[] }> = {
  tutoplast: { label: 'Tutoplast', implant: 'Tutoplast', company: 'Tutogen', diagnoses: TUTOPLAST_DIAGNOSES },
  istent: { label: 'iStent', implant: 'iStent inject W', company: 'Glaukos', diagnoses: [ISTENT_DIAGNOSIS] },
};

/** The text for the Diagnosis box, from the dropdown value and the "Other" text. */
export function diagnosisText(kind: OrderKind, choice: string, other: string): string {
  if (choice === OTHER_DIAGNOSIS) return other.trim();
  return ORDER_KINDS[kind].diagnoses.find((d) => d === choice) ?? '';
}

export function validateTutoplast(req: TutoplastRequest, choice: string): string[] {
  const problems = validatePatient(req);
  if (!choice) problems.push('Choose a diagnosis.');
  else if (!req.diagnosis) problems.push('Enter the diagnosis text.');
  if (!req.implant.trim()) problems.push('Implant is missing.');
  if (!req.company.trim()) problems.push('Company is missing.');
  return problems;
}
