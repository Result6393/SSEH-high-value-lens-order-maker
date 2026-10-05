import { formatPower, parsePower } from './lenses';
import type { RequestData, Settings, TutoplastRequest } from './types';

export const TORIC_THRESHOLD_D = 2;

export function emailSubject(req: RequestData): string {
  return `Toric IOL request - MRN ${req.mrn} - ${req.eye} eye`;
}

/**
 * Default email text. Placeholders: `{patient}` ("SURNAME, First"), `{mrn}`,
 * `{lens}` ("ZCU300 +22.0D") and `{name}` (the sender's first name).
 */
export const DEFAULT_EMAIL_BODY = [
  'RE: {patient} {mrn}',
  '{lens}',
  '',
  'Hi All,',
  '',
  'Please find a filled toric lens request form and biometry.',
  '',
  'All the best,',
  '{name}',
].join('\n');

/** "SURNAME, First", as on the printout. */
export function patientName(req: Pick<RequestData, 'surname' | 'firstName'>): string {
  const surname = req.surname.trim().toUpperCase();
  const first = req.firstName.trim();
  return first ? `${surname}, ${first}` : surname;
}

/** "ZCU300 +22.0D": the lens model and its power as written on the order. */
export function lensText(req: Pick<RequestData, 'lensModel' | 'lensPower'>): string {
  return [req.lensModel.trim(), formatPower(req.lensPower)].filter(Boolean).join(' ');
}

export function emailBody(settings: Settings, req: RequestData): string {
  return render(settings.emailBody, DEFAULT_EMAIL_BODY, settings, req, lensText(req));
}

/** Default text for tutoplast orders; `{lens}` is the implant ("Tutoplast"). */
export const DEFAULT_TUTOPLAST_EMAIL_BODY = [
  'RE: {patient} {mrn}',
  '{lens}',
  '',
  'Hi All,',
  '',
  "Here's a tutoplast order form.",
  '',
  'All the best,',
  '{name}',
].join('\n');

export function tutoplastSubject(req: TutoplastRequest): string {
  return `Tutoplast order - MRN ${req.mrn} - ${req.eye} eye`;
}

export function tutoplastBody(settings: Settings, req: TutoplastRequest): string {
  return render(settings.tutoplastEmailBody, DEFAULT_TUTOPLAST_EMAIL_BODY, settings, req, req.implant.trim());
}

function render(custom: string, stock: string, settings: Settings, req: Pick<RequestData, 'surname' | 'firstName' | 'mrn'>, lens: string): string {
  const firstName = settings.clinicianName.replace(/^(dr\.?|doctor)\s+/i, '').split(/\s+/)[0] ?? '';
  return (custom.trim() ? custom : stock)
    .replace(/\r\n?/g, '\n')
    .replaceAll('{patient}', patientName(req))
    .replaceAll('{mrn}', req.mrn.trim())
    .replaceAll('{lens}', lens)
    .replaceAll('{name}', firstName)
    .trimEnd();
}

/** Filesystem-safe base name for the attachments, e.g. "1234567_R". */
export function attachmentStem(req: Pick<RequestData, 'mrn' | 'eye'>): string {
  return `${req.mrn.replace(/[^A-Za-z0-9-]/g, '') || 'patient'}_${req.eye[0]}`;
}

/** The patient checks both order types share. */
export function validatePatient(req: Pick<RequestData, 'surname' | 'firstName' | 'mrn' | 'dob'>): string[] {
  const problems: string[] = [];
  if (!req.surname.trim()) problems.push('Surname is missing.');
  if (!req.firstName.trim()) problems.push('First name is missing.');
  if (!req.mrn.trim()) problems.push('MRN is missing.');
  if (req.dob && !/^\d{2}\/\d{2}\/\d{4}$/.test(req.dob)) problems.push('Date of birth should be dd/mm/yyyy.');
  return problems;
}

export function validate(req: RequestData): string[] {
  const problems = validatePatient(req);
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
