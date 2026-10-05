import { mailtoList, outlookList } from './recipients';

export interface EmailDraft {
  /** Whatever the user entered in Settings; addresses are extracted from it. */
  to: string;
  subject: string;
  body: string;
  files: File[];
}

/**
 * Hands the email to the phone's share sheet (pick Outlook). The Web Share API
 * can't set recipients, so the addresses are copied to the clipboard, separated
 * by semicolons (the one separator Outlook always accepts), to paste into To.
 */
export async function shareEmail(draft: EmailDraft): Promise<'shared' | 'cancelled' | 'fallback'> {
  // Don't await: Safari requires share() to run within the tap's user activation.
  navigator.clipboard?.writeText(outlookList(draft.to)).catch(() => {});

  const data: ShareData = { title: draft.subject, text: draft.body, files: draft.files };
  if (navigator.canShare?.(data)) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled';
      throw e;
    }
  }

  // No file sharing (e.g. desktop browser): download attachments, open a mail draft.
  for (const f of draft.files) download(f);
  const q = new URLSearchParams({ subject: draft.subject, body: draft.body }).toString().replace(/\+/g, '%20');
  location.href = `mailto:${encodeURIComponent(mailtoList(draft.to)).replace(/%40/g, '@').replace(/%2C/gi, ',')}?${q}`;
  return 'fallback';
}

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
