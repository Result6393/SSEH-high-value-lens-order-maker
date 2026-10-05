// The SSEH order form arrives with three pre-filled values ("ZCU", "J&J" and
// "High cyl / astigmatism >2D") flattened into nested form XObjects as hex
// strings. Drawing over them hides them on screen but leaves them in the PDF's
// text layer (search, copy/paste, screen readers). This blanks those objects.
// Idempotent; run on public/forms/toric-lens-order-form.pdf.
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../public/forms/toric-lens-order-form.pdf', import.meta.url);
const PREFILLED = ['ZCU', 'J&J', 'High cyl / astigmatism >2D'];

const hex = (s) => Buffer.from(s, 'latin1').toString('hex').toUpperCase();
const doc = await PDFDocument.load(readFileSync(file));
let blanked = 0;
for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
  if (!(obj instanceof PDFRawStream) || String(obj.dict.get(PDFName.of('Subtype'))) !== '/Form') continue;
  const content = Buffer.from(decodePDFRawStream(obj).decode()).toString('latin1');
  const shown = [...content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)].map((m) => m[1].toUpperCase());
  if (!PREFILLED.some((p) => shown.includes(hex(p)))) continue;
  doc.context.assign(
    ref,
    doc.context.flateStream('q Q', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: obj.dict.get(PDFName.of('BBox')),
      Resources: obj.dict.get(PDFName.of('Resources')) ?? doc.context.obj({}),
    }),
  );
  blanked++;
}
writeFileSync(file, await doc.save());
console.log(`blanked ${blanked} pre-filled form object(s)`);
