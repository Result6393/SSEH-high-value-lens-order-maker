import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { RequestData, Settings } from './types';

export const TEMPLATE_URL = 'forms/toric-lens-order-form.pdf';

// The SSEH "Other High Cost Implants and Prosthesis" form has no fillable
// fields, so values are drawn at fixed positions. Coordinates are measured in
// pixels on a 100 dpi render of the A4 page (x, row top, row bottom).
const PX = 0.72;
const CELLS = {
  dateRequested: [347, 183, 222],
  surgeryDate: [347, 262, 301],
  mrn: [508, 183, 222],
  surname: [508, 222, 262],
  firstName: [508, 262, 301],
  dob: [506, 301, 325],
  age: [600, 301, 325],
  vmo: [252, 406, 447],
  submittedBy: [258, 447, 478],
  contact: [622, 447, 478],
  eye: [252, 569, 599],
} as const satisfies Record<string, readonly [number, number, number]>;
// Max text width per cell, same pixel units.
const WIDTH = { dateRequested: 74, surgeryDate: 74, mrn: 210, surname: 210, firstName: 210, dob: 86, age: 118, vmo: 155, submittedBy: 150, contact: 100, eye: 470 };

const BLUE = rgb(0, 0.47, 0.83);

export async function fillOrderForm(template: ArrayBuffer | Uint8Array, req: RequestData, settings: Settings, today: Date): Promise<Uint8Array> {
  const doc = await PDFDocument.load(template);
  const page = doc.getPage(0);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const put = (cell: keyof typeof CELLS, text: string, f: PDFFont = font, size = 11) => draw(page, f, cell, text, size);

  put('dateRequested', formatDate(today));
  if (req.surgeryDate) put('surgeryDate', formatDate(new Date(`${req.surgeryDate}T00:00`)));
  put('mrn', req.mrn);
  put('surname', req.surname.toUpperCase());
  put('firstName', req.firstName);
  put('dob', req.dob);
  const age = ageOn(req.dob, today);
  if (age !== undefined) put('age', `Age ${age}`);
  put('vmo', req.vmo);
  put('submittedBy', settings.clinicianName);
  put('contact', settings.contactNumber);
  put('eye', eyeLine(req), bold, 12);

  doc.setTitle(`High cost lens order - toric - ${req.eye} eye`);
  return doc.save();
}

export function eyeLine(req: RequestData): string {
  const eye = `${req.eye.toUpperCase()} EYE (${req.eye === 'Right' ? 'OD' : 'OS'})`;
  if (!req.astK) return eye;
  return `${eye}   Corneal astigmatism ${req.astK} D${req.astAxis ? ` @ ${req.astAxis}°` : ''}`;
}

function draw(page: PDFPage, font: PDFFont, cell: keyof typeof CELLS, text: string, size: number): void {
  if (!text) return;
  const [x, top, bottom] = CELLS[cell];
  const maxWidth = WIDTH[cell] * PX;
  while (size > 6 && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5;
  const y = page.getHeight() - ((top + bottom) / 2) * PX - size * 0.35;
  page.drawText(text, { x: x * PX, y, size, font, color: BLUE });
}

function formatDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function ageOn(dob: string, today: Date): number | undefined {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dob);
  if (!m) return undefined;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d)) age--;
  return age >= 0 && age < 130 ? age : undefined;
}
