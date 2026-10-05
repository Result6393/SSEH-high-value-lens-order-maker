import { parsePower } from './lenses';
import type { RequestData, Settings } from './types';

export const TORIC_THRESHOLD_D = 2;

export function emailSubject(req: RequestData): string {
  return `Toric IOL request - MRN ${req.mrn} - ${req.eye} eye`;
}

/** Default email text. `{name}` is replaced by the sender's first name. */
export const DEFAULT_EMAIL_BODY = [
  'Hi All,',
  '',
  'Please find a filled toric lens request form and biometry.',
  '',
  'All the best,',
  '{name}',
].join('\n');

export function emailBody(settings: Settings): string {
  const firstName = settings.clinicianName.replace(/^(dr\.?|doctor)\s+/i, '').split(/\s+/)[0] ?? '';
  const template = settings.emailBody.trim() ? settings.emailBody : DEFAULT_EMAIL_BODY;
  return template.replace(/\r\n?/g, '\n').replaceAll('{name}', firstName).trimEnd();
}

/** Filesystem-safe base name for the attachments, e.g. "1234567_R". */
export function attachmentStem(req: RequestData): string {
  return `${req.mrn.replace(/[^A-Za-z0-9-]/g, '') || 'patient'}_${req.eye[0]}`;
}

export function validate(req: RequestData): string[] {
  const problems: string[] = [];
  if (!req.surname.trim()) problems.push('Surname is missing.');
  if (!req.firstName.trim()) problems.push('First name is missing.');
  if (!req.mrn.trim()) problems.push('MRN is missing.');
  if (req.dob && !/^\d{2}\/\d{2}\/\d{4}$/.test(req.dob)) problems.push('Date of birth should be dd/mm/yyyy.');
  if (req.astK && Number.isNaN(Number(req.astK))) problems.push('Ast. K should be a number.');
  if (!req.lensModel.trim()) problems.push('Choose the toric lens model.');
  const power = parsePower(req.lensPower);
  if (!req.lensPower.trim()) problems.push('Lens power is missing.');
  else if (power === undefined || power < -10 || power > 40) problems.push('Lens power should be a number of dioptres, e.g. 16 or +16.0D.');
  if (!req.company.trim()) problems.push('Lens company is missing.');
  return problems;
}

/** Non-blocking: the surgeon may have reasons, and OCR may have misread the value. */
export function eligibilityWarning(req: RequestData): string | undefined {
  const cyl = Math.abs(Number(req.astK));
  if (!req.astK || Number.isNaN(cyl) || cyl >= TORIC_THRESHOLD_D) return undefined;
  return `Ast. K ${req.astK} D is below ${TORIC_THRESHOLD_D.toFixed(2)} D, the toric threshold. Check the value.`;
}
