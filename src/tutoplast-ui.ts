// The Tutoplast / iStent tab: patient sticker photo -> name/MRN -> order form + email.
// Both orders share everything but the implant, company, diagnosis and email text (ORDER_KINDS).
// Like the toric tab, patient data lives only in these variables and the form fields.

import { attachmentStem, tutoplastBody, tutoplastSubject } from './email';
import { fillTutoplastForm } from './pdf';
import { parseRecipients } from './recipients';
import { saveSettings } from './settings';
import { shareEmail, type EmailDraft } from './share';
import { NEXT_PATIENT, type PatientDetails } from './patient';
import { initStickerStep, stickerName } from './sticker-ui';
import { ORDER_KINDS, OTHER_DIAGNOSIS, diagnosisText, validateTutoplast } from './tutoplast';
import type { Eye, OrderKind, Settings, TutoplastRequest } from './types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);

export function initTutoplast(opts: { settings: Settings; template: Promise<ArrayBuffer> }): { getDetails(): PatientDetails; setDetails(d: PatientDetails): void } {
  const { settings, template } = opts;
  const el = {
    camera: input('tp-camera'),
    library: input('tp-library'),
    preview: $<HTMLImageElement>('tp-preview'),
    ocrStatus: $('tp-ocr-status'),
    mrn: input('tp-mrn'),
    name: input('tp-name'),
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

  let prepared: { key: string; draft: EmailDraft } | undefined;

  const kindRadios = document.querySelectorAll<HTMLInputElement>('input[name="tp-kind"]');
  const selectedKind = (): OrderKind => (document.querySelector<HTMLInputElement>('input[name="tp-kind"]:checked')?.value as OrderKind) ?? 'tutoplast';

  /** Sets the implant, company and diagnosis choices for the order type; a single preset is preselected. */
  function applyKind(): void {
    const { implant, company, diagnoses } = ORDER_KINDS[selectedKind()];
    el.diagnosis.replaceChildren(
      ...(diagnoses.length > 1 ? [new Option('Choose…', '')] : []),
      ...diagnoses.map((d) => new Option(d, d)),
      new Option('Other (enter text)', OTHER_DIAGNOSIS),
    );
    el.diagnosis.value = diagnoses.length > 1 ? '' : diagnoses[0];
    el.other.value = ''; // free text may name the patient, so it is never saved
    el.implant.value = implant;
    el.company.value = company;
  }

  const kind = settings.orderKind in ORDER_KINDS ? settings.orderKind : 'tutoplast';
  kindRadios.forEach((r) => (r.checked = r.value === kind));
  for (const radio of kindRadios) {
    radio.addEventListener('change', () => {
      applyKind();
      saveSettings({ ...settings, orderKind: (settings.orderKind = selectedKind()) });
    });
  }
  applyKind();
  el.vmo.value = settings.vmo;

  const selectedEye = () => document.querySelector<HTMLInputElement>('input[name="tp-eye"]:checked')?.value as Eye | undefined;

  function currentRequest(): TutoplastRequest | undefined {
    const eye = selectedEye();
    if (!eye) return undefined;
    const kind = selectedKind();
    return {
      kind,
      eye,
      mrn: el.mrn.value.trim(),
      name: el.name.value.trim(),
      vmo: el.vmo.value.trim(),
      surgeryDate: el.surgeryDate.value,
      implant: el.implant.value.trim(),
      company: el.company.value.trim(),
      diagnosis: diagnosisText(kind, el.diagnosis.value, el.other.value),
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

  const sticker = initStickerStep({ camera: el.camera, library: el.library, preview: el.preview, status: el.ocrStatus }, (read) => {
    el.mrn.value = read.mrn;
    el.name.value = stickerName(read);
    refresh();
  });

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
      files: [new File([new Uint8Array(pdf)], `High_cost_order_${req.kind}_${attachmentStem(req)}.pdf`, { type: 'application/pdf' })],
    };
  }

  $('tp-reset').addEventListener('click', () => document.dispatchEvent(new Event(NEXT_PATIENT)));
  document.addEventListener(NEXT_PATIENT, () => {
    prepared = undefined;
    sticker.reset();
    for (const i of [el.mrn, el.name, el.surgeryDate]) i.value = '';
    applyKind(); // keeps the order type, resets its implant, company and diagnosis
    document.querySelectorAll<HTMLInputElement>('input[name="tp-eye"]').forEach((r) => (r.checked = false));
    el.sendStatus.textContent = '';
    refresh();
    window.scrollTo({ top: 0 });
  });

  refresh();

  return {
    getDetails: () => ({ mrn: el.mrn.value.trim(), name: el.name.value.trim(), eye: selectedEye(), vmo: el.vmo.value.trim(), surgeryDate: el.surgeryDate.value }),
    /** Fills in what the other tab has; blank values leave this tab's own untouched. */
    setDetails(d) {
      if (d.mrn) el.mrn.value = d.mrn;
      if (d.name) el.name.value = d.name;
      if (d.vmo) el.vmo.value = d.vmo;
      if (d.surgeryDate) el.surgeryDate.value = d.surgeryDate;
      if (d.eye) document.querySelector<HTMLInputElement>(`input[name="tp-eye"][value="${d.eye}"]`)!.checked = true;
      prepared = undefined;
      refresh();
    },
  };
}
