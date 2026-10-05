// Turns whatever the user pasted into Settings into a clean list of addresses.

const EMAIL = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/**
 * Every email address in the text, in order and without duplicates. Separators
 * (commas, semicolons, line breaks, spaces) and display names are ignored, so
 * "Wijaya, Venessa <v.w@x.org>; Santos, Jon <j.s@x.org>" works: splitting on
 * commas would cut names like that in half.
 */
export function parseRecipients(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.match(EMAIL) ?? []) {
    const key = m.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

/** Semicolon-separated: the one separator every version of Outlook accepts when pasted into To. */
export function outlookList(text: string): string {
  return parseRecipients(text).join('; ');
}

/** Comma-separated, as mailto: links expect. */
export function mailtoList(text: string): string {
  return parseRecipients(text).join(',');
}
