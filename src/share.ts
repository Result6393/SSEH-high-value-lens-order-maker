export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
  files: File[];
}

/**
 * Hands the email to the phone's share sheet (pick Outlook). The Web Share API
 * can't set recipients, so the address is copied to the clipboard to paste
 * into the To field.
 */
export async function shareEmail(draft: EmailDraft): Promise<'shared' | 'cancelled' | 'fallback'> {
  // Don't await: Safari requires share() to run within the tap's user activation.
  navigator.clipboard?.writeText(draft.to).catch(() => {});

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
  location.href = `mailto:${encodeURIComponent(draft.to).replace(/%40/g, '@').replace(/%2C/gi, ',')}?${q}`;
  return 'fallback';
}

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
