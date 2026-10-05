import type { RequestData, Settings } from './types';

export const TORIC_THRESHOLD_D = 2;

export function emailSubject(req: RequestData): string {
  return `Toric IOL request - MRN ${req.mrn} - ${req.eye} eye`;
}

export function emailBody(req: RequestData, settings: Settings): string {
  return [
    'Hi,',
    '',
    `Please find attached a high cost lens order form (toric IOL) and biometry for ${req.firstName} ${req.surname.toUpperCase()}, MRN ${req.mrn}, ${req.eye.toUpperCase()} eye.`,
    '',
    'Thanks,',
    settings.clinicianName,
  ].join('\n').trimEnd();
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
  return problems;
}

/** Non-blocking: the surgeon may have reasons, and OCR may have misread the value. */
export function eligibilityWarning(req: RequestData): string | undefined {
  const cyl = Math.abs(Number(req.astK));
  if (!req.astK || Number.isNaN(cyl) || cyl >= TORIC_THRESHOLD_D) return undefined;
  return `Ast. K ${req.astK} D is below ${TORIC_THRESHOLD_D.toFixed(2)} D, the toric threshold. Check the value.`;
}
