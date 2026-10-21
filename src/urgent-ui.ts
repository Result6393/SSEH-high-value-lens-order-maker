import { urgentNotice } from './email';

/** Shows (or hides) the "surgery within a week: marked [URGENT]" note under a surgery date. */
export function showUrgent(note: HTMLElement, surgeryDate: string): void {
  const text = urgentNotice(surgeryDate, new Date());
  note.textContent = text ?? '';
  note.hidden = !text;
}
