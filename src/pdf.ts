import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatPower } from './lenses';
import type { Eye, RequestData, Settings, TutoplastRequest } from './types';

export const TEMPLATE_URL = 'forms/toric-lens-order-form.pdf';

/** What the Diagnosis box says unless the user changes it. */
export const DEFAULT_DIAGNOSIS = 'High cyl / astigmatism >2';

// The Diagnosis box has two rows (rules at y = 625, 651, 677 on the 100 dpi render).
const DIAGNOSIS_ROWS = [[625, 651], [651, 677]] as const;
const DIAGNOSIS_X = 137;
const DIAGNOSIS_MAX_WIDTH = 580;

// The SSEH "Other High Cost Implants and Prosthesis" form has no fillable
// fields, so values are drawn at fixed positions. Coordinates are measured in
// pixels on a 100 dpi render of the A4 page (x, row top, row bottom).
const PX = 0.72;
const CELLS = {
  dateRequested: [347, 183, 222],
  surgeryDate: [347, 262, 301],
  mrn: [508, 183, 222],
  name: [508, 222, 262],
  dob: [506, 301, 325],
  age: [600, 301, 325],
  vmo: [252, 406, 447],
  submittedBy: [258, 447, 478],
  contact: [622, 447, 478],
  lens: [270, 507, 538],
  company: [270, 538, 569],
  eye: [252, 569, 599],
} as const satisfies Record<string, readonly [number, number, number]>;
// Max text width per cell, same pixel units.
const WIDTH = { dateRequested: 74, surgeryDate: 74, mrn: 210, name: 210, dob: 86, age: 118, vmo: 155, submittedBy: 150, contact: 100, lens: 450, company: 450, eye: 470 };

const BLUE = rgb(0, 0.47, 0.83);

/** What goes into the form's boxes; the toric, tutoplast and iStent orders differ only in these. */
interface FormContent {
  mrn: string;
  name: string;
  dob: string;
  vmo: string;
  surgeryDate: string;
  implant: string;
  company: string;
  eyeText: string;
  diagnosis: string;
  title: string;
}

export function fillOrderForm(template: ArrayBuffer | Uint8Array, req: RequestData, settings: Settings, today: Date): Promise<Uint8Array> {
  return fillForm(template, { ...req, implant: `${req.lensModel} ${formatPower(req.lensPower)}`, eyeText: eyeLine(req), title: `High cost lens order - toric - ${req.eye} eye` }, settings, today);
}

export function fillTutoplastForm(template: ArrayBuffer | Uint8Array, req: TutoplastRequest, settings: Settings, today: Date): Promise<Uint8Array> {
  return fillForm(template, { ...req, eyeText: eyeLine(req), title: `High cost order - ${req.kind === 'istent' ? 'iStent' : 'tutoplast'} - ${req.eye} eye` }, settings, today);
}

async function fillForm(template: ArrayBuffer | Uint8Array, form: FormContent, settings: Settings, today: Date): Promise<Uint8Array> {
  const doc = await PDFDocument.load(template);
  const page = doc.getPage(0);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const put = (cell: keyof typeof CELLS, text: string, f: PDFFont = font, size = 11) => draw(page, f, cell, text, size);

  put('dateRequested', formatDate(today));
  if (form.surgeryDate) put('surgeryDate', formatDate(new Date(`${form.surgeryDate}T00:00`)));
  put('mrn', form.mrn);
  put('name', form.name); // one field for the whole name; it goes in the Surname box
  put('dob', form.dob);
  const age = ageOn(form.dob, today);
  if (age !== undefined) put('age', `Age ${age}`);
  put('vmo', form.vmo);
  put('submittedBy', settings.clinicianName);
  put('contact', settings.contactNumber);
  put('lens', form.implant, bold, 12);
  put('company', form.company, font, 12);
  put('eye', form.eyeText, bold, 12);
  drawDiagnosis(page, font, form.diagnosis);

  doc.setTitle(form.title);
  return doc.save();
}

export function eyeLine(req: { eye: Eye; astK?: string; astAxis?: string }): string {
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

/**
 * Splits text into lines no wider than `maxWidth`. Explicit line breaks are kept;
 * a single word wider than the line is left whole (the caller shrinks the font).
 */
export function wrapLines(text: string, widthOf: (s: string) => number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && widthOf(next) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Writes the diagnosis into the box's two rows, shrinking the text until it fits. */
function drawDiagnosis(page: PDFPage, font: PDFFont, text: string): void {
  if (!text.trim()) return;
  const maxWidth = DIAGNOSIS_MAX_WIDTH * PX;
  let size = 13;
  let lines = wrapLines(text.trim(), (t) => font.widthOfTextAtSize(t, size), maxWidth);
  while (size > 7 && (lines.length > DIAGNOSIS_ROWS.length || lines.some((l) => font.widthOfTextAtSize(l, size) > maxWidth))) {
    size -= 0.5;
    lines = wrapLines(text.trim(), (t) => font.widthOfTextAtSize(t, size), maxWidth);
  }
  lines.slice(0, DIAGNOSIS_ROWS.length).forEach((line, i) => {
    const [top, bottom] = DIAGNOSIS_ROWS[i];
    page.drawText(line, {
      x: DIAGNOSIS_X * PX,
      y: page.getHeight() - ((top + bottom) / 2) * PX - size * 0.35,
      size,
      font,
      color: BLUE,
    });
  });
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
