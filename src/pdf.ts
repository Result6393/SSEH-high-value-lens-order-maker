import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { RequestData, Settings } from './types';

// PLACEHOLDER: generates a simple request sheet. Replace with filling the
// official approval form (pdf-lib getForm().getTextField(...).setText(...))
// once the blank form is added to public/.
export async function buildRequestPdf(req: RequestData, settings: Settings, date: Date): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = 780;
  page.drawText('Toric IOL Approval Request', { x: 50, y, size: 20, font: bold, color: rgb(0.04, 0.36, 0.68) });
  y -= 40;

  const rows: [string, string][] = [
    ['Patient name', req.name],
    ['MRN', req.mrn],
    ['Operative eye', req.eye],
    ['Corneal astigmatism', req.cyl ? `${req.cyl} D` : ''],
    ['Requesting clinician', settings.clinicianName],
    ['Date', date.toLocaleDateString('en-AU')],
  ];
  for (const [label, value] of rows) {
    page.drawText(label, { x: 50, y, size: 12, font: bold });
    page.drawText(value || '-', { x: 210, y, size: 12, font });
    y -= 24;
  }
  y -= 16;
  page.drawText('Biometry printout attached to this email.', { x: 50, y, size: 11, font });

  return doc.save();
}
