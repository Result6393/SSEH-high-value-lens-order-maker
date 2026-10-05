// Pulls patient name and MRN out of OCR text from a biometry printout.
// Heuristic by design: the user always reviews the fields before sending.

export interface Extracted {
  name: string;
  mrn: string;
}

const MRN_LABELS = [
  /\bpatient\s*id\b/i,
  /\bpat\.?\s*id\b/i,
  /\bmrn\b/i,
  /\bu\.?r\.?n?\.?(?:\s*(?:no|number))?\b/i,
  /\bhospital\s*(?:no|number)\b/i,
  /\bID\b/,
];

// Words that mark the end of a name value on the same line.
const NAME_STOP = /\b(?:first\s*name|given\s*names?|forenames?|last\s*name|surname|d\.?o\.?b|date|birth|born|patient\s*id|pat\.?\s*id|id|sex|gender|mrn|u\.?r\.?n?|age)\b/i;

export function extractPatient(text: string): Extracted {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/[|]/g, ' ').trim()).filter(Boolean);
  return { name: findName(lines), mrn: findMrn(lines) };
}

function findMrn(lines: string[]): string {
  for (const label of MRN_LABELS) {
    for (const line of lines) {
      const m = label.exec(line);
      if (!m) continue;
      const rest = line.slice(m.index + m[0].length);
      const v = /^\s*[:.#]?\s*([A-Z0-9][A-Z0-9-]{3,14})\b/i.exec(rest);
      if (v && /\d/.test(v[1])) return cleanMrn(v[1]);
    }
  }
  return '';
}

/** In mostly-numeric IDs, OCR often reads 0 as O and 1 as I/l. */
function cleanMrn(raw: string): string {
  const digits = raw.replace(/\D/g, '').length;
  if (digits >= raw.length - 2) return raw.replace(/[Oo]/g, '0').replace(/[Il]/g, '1');
  return raw.toUpperCase();
}

function findName(lines: string[]): string {
  // Separate surname / first-name fields (e.g. Lenstar).
  const last = labelled(lines, /\b(?:last\s*name|surname|family\s*name)\b/i);
  const first = labelled(lines, /\b(?:first\s*name|given\s*names?|forenames?)\b/i);
  if (last && first) return `${last.toUpperCase()}, ${first}`;

  // Single "Patient:" / "Name:" field (e.g. IOLMaster).
  const single = labelled(lines, /\b(?:patient\s*name|patient(?!\s*id)|name)\b(?=\s*[:.])/i);
  if (single) return single;
  return last ?? '';
}

function labelled(lines: string[], label: RegExp): string | undefined {
  for (const line of lines) {
    const m = label.exec(line);
    if (!m) continue;
    let rest = line.slice(m.index + m[0].length).replace(/^\s*[:.]\s*/, '');
    const stop = NAME_STOP.exec(rest);
    if (stop) rest = rest.slice(0, stop.index);
    const name = rest
      .replace(/[^A-Za-z'’,\- ]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s,-]+|[\s,-]+$/g, '');
    if (/[A-Za-z]{2,}/.test(name)) return name;
  }
  return undefined;
}
