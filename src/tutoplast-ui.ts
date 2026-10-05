// The Tutoplast tab: patient sticker photo -> name/MRN -> order form + email.
// Like the toric tab, patient data lives only in these variables and the form fields.

import { attachmentStem, joinName, tutoplastBody, tutoplastSubject } from './email';
import { prepareImage } from './image';
import { readSticker } from './ocr';
import { fillTutoplastForm } from './pdf';
import { parseRecipients } from './recipients';
import { saveSettings } from './settings';
import { shareEmail, type EmailDraft } from './share';
import { DEFAULT_COMPANY, DEFAULT_IMPLANT, OTHER_DIAGNOSIS, TUTOPLAST_DIAGNOSES, diagnosisText, validateTutoplast } from './tutoplast';
import type { Eye, Settings, TutoplastRequest } from './types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);

export function initTutoplast(opts: { settings: Settings; template: Promise<ArrayBuffer> }): void {
  const { settings, template } = opts;
  const el = {
    camera: input('tp-camera'),
    library: input('tp-library'),
    preview: $<HTMLImageElement>('tp-preview'),
    ocrStatus: $('tp-ocr-status'),
    mrn: input('tp-mrn'),
    name: input('tp-name'),
    dob: input('tp-dob'),
    vmo: input('tp-vmo'),
    surgeryDate: input('tp-surgery-date'),
    diagnosis: $<HTMLSelectElement>('tp-diagnosis'),
    otherWrap: $('tp-diagnosis-other-wrap'),
    other: $<HTMLTextAreaElement>('tp-diagnosis-other'),
    implant: input('tp-implant'),
    company: input('tp-company'),
    problems: $<HTMLUListElement>('tp-problems'),
    send: $<HTMLButtonElement>('tp-send'),
    sendStatus: $('tp-send-status'),
  };

  let photoUrl: string | undefined;
  let token = 0;
  let prepared: { key: string; draft: EmailDraft } | undefined;

  el.diagnosis.replaceChildren(
    new Option('Choose…', ''),
    ...TUTOPLAST_DIAGNOSES.map((d) => new Option(d, d)),
    new Option('Other (enter text)', OTHER_DIAGNOSIS),
  );
  el.vmo.value = settings.vmo;
  el.implant.value = DEFAULT_IMPLANT;
  el.company.value = DEFAULT_COMPANY;

  const selectedEye = () => document.querySelector<HTMLInputElement>('input[name="tp-eye"]:checked')?.value as Eye | undefined;

  function currentRequest(): TutoplastRequest | undefined {
    const eye = selectedEye();
    if (!eye) return undefined;
    return {
      eye,
      mrn: el.mrn.value.trim(),
      name: el.name.value.trim(),
      dob: el.dob.value.trim(),
      vmo: el.vmo.value.trim(),
      surgeryDate: el.surgeryDate.value,
      implant: el.implant.value.trim(),
      company: el.company.value.trim(),
      diagnosis: diagnosisText(el.diagnosis.value, el.other.value),
    };
  }

  function refresh(): void {
    el.otherWrap.hidden = el.diagnosis.value !== OTHER_DIAGNOSIS;
    const req = currentRequest();
    const problems = req ? validateTutoplast(req, el.diagnosis.value) : [];
    if (!req) problems.unshift('Choose the operative eye.');
    if (!parseRecipients(settings.recipients).length) problems.push('Add the recipient emails in Settings.');
    if (!settings.clinicianName) problems.push('Add your name in Settings.');
    el.problems.replaceChildren(...problems.map((p) => Object.assign(document.createElement('li'), { textContent: p })));
    el.send.disabled = problems.length > 0;
  }
  $('tab-tutoplast').addEventListener('input', refresh);
  $('tab-tutoplast').addEventListener('change', refresh);
  // Settings (recipients, name) can change while this tab is open.
  $('settings-done').addEventListener('click', refresh);

  const setStatus = (msg: string) => {
    el.ocrStatus.textContent = msg;
    el.ocrStatus.hidden = !msg;
  };

  for (const picker of [el.camera, el.library]) {
    picker.addEventListener('change', () => {
      const file = picker.files?.[0];
      picker.value = '';
      if (file) void onPhoto(file);
    });
  }

  async function onPhoto(file: File): Promise<void> {
    const mine = ++token;
    setStatus('Loading photo…');
    try {
      const { ocr, jpeg } = await prepareImage(file);
      if (mine !== token) return;
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      photoUrl = URL.createObjectURL(jpeg); // shown for checking only; the sticker photo is not sent
      el.preview.src = photoUrl;
      el.preview.hidden = false;
      const sticker = await readSticker(ocr, (stage) => mine === token && setStatus(stage));
      if (mine !== token) return;
      el.mrn.value = sticker.mrn;
      el.name.value = joinName(sticker.surname, sticker.firstName);
      el.dob.value = sticker.dob;
      const missing = [!sticker.mrn && 'MRN', !sticker.surname && 'name', !sticker.dob && 'date of birth'].filter(Boolean);
      setStatus(missing.length ? `Couldn't read the ${missing.join(', ')}. Fill it in by hand.` : 'Details read. Check them against the sticker.');
    } catch (e) {
      setStatus(`Problem reading the photo: ${(e as Error).message}`);
    }
    refresh();
  }

  el.send.addEventListener('click', async () => {
    const req = currentRequest();
    if (!req) return;
    el.sendStatus.textContent = '';
    const key = JSON.stringify([req, settings]);
    try {
      if (prepared?.key !== key) {
        if (req.vmo !== settings.vmo) saveSettings({ ...settings, vmo: (settings.vmo = req.vmo) });
        prepared = { key: JSON.stringify([req, settings]), draft: await buildDraft(req) };
      }
      const result = await shareEmail(prepared.draft);
      el.sendStatus.textContent = {
        shared: 'Handed to the share sheet. Paste the addresses into To and send. Tap "Next patient" when done.',
        cancelled: 'Cancelled.',
        fallback: "File sharing isn't supported here. The form was downloaded and a mail draft opened.",
      }[result];
    } catch (e) {
      el.sendStatus.textContent =
        (e as DOMException).name === 'NotAllowedError'
          ? 'Email is ready. Tap "Prepare email" again to share it.'
          : `Could not prepare the email: ${(e as Error).message}`;
    }
  });

  async function buildDraft(req: TutoplastRequest): Promise<EmailDraft> {
    const pdf = await fillTutoplastForm(await template, req, settings, new Date());
    return {
      to: settings.recipients,
      subject: tutoplastSubject(req),
      body: tutoplastBody(settings, req),
      files: [new File([new Uint8Array(pdf)], `High_cost_order_tutoplast_${attachmentStem(req)}.pdf`, { type: 'application/pdf' })],
    };
  }

  $('tp-reset').addEventListener('click', () => {
    token++;
    prepared = undefined;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = undefined;
    el.preview.removeAttribute('src');
    el.preview.hidden = true;
    for (const i of [el.mrn, el.name, el.dob, el.surgeryDate]) i.value = '';
    el.diagnosis.value = '';
    el.other.value = ''; // free text may name the patient, so it is never saved
    el.implant.value = DEFAULT_IMPLANT;
    el.company.value = DEFAULT_COMPANY;
    document.querySelectorAll<HTMLInputElement>('input[name="tp-eye"]').forEach((r) => (r.checked = false));
    setStatus('');
    el.sendStatus.textContent = '';
    refresh();
    window.scrollTo({ top: 0 });
  });

  refresh();
}
