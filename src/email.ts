import type { RequestData, Settings } from './types';

export const TORIC_THRESHOLD_D = 2;

export function emailSubject(req: RequestData): string {
  return `Toric IOL approval request - MRN ${req.mrn} - ${req.eye} eye`;
}

export function emailBody(req: RequestData, settings: Settings): string {
  return [
    'Hi,',
    '',
    `Please find attached a toric IOL approval request and biometry for ${req.name} (MRN ${req.mrn}), ${req.eye.toLowerCase()} eye${req.cyl ? `, corneal astigmatism ${req.cyl} D` : ''}.`,
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
  if (!req.name.trim()) problems.push('Patient name is missing.');
  if (!req.mrn.trim()) problems.push('MRN is missing.');
  const cyl = Number(req.cyl);
  if (req.cyl.trim() && (Number.isNaN(cyl) || Math.abs(cyl) < TORIC_THRESHOLD_D)) {
    problems.push(`Astigmatism is below ${TORIC_THRESHOLD_D.toFixed(2)} D: not eligible for a toric IOL.`);
  }
  return problems;
}
