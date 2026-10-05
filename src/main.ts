import './style.css';
import { attachmentStem, emailBody, emailSubject, validate } from './email';
import { extractPatient } from './extract';
import { prepareImage } from './image';
import { recognise } from './ocr';
import { buildRequestPdf } from './pdf';
import { loadSettings, saveSettings } from './settings';
import { shareEmail } from './share';
import type { Eye, RequestData } from './types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const el = {
  settings: $<HTMLElement>('settings'),
  recipients: $<HTMLInputElement>('recipients'),
  clinician: $<HTMLInputElement>('clinician'),
  camera: $<HTMLInputElement>('camera'),
  library: $<HTMLInputElement>('library'),
  preview: $<HTMLImageElement>('preview'),
  ocrStatus: $<HTMLElement>('ocr-status'),
  name: $<HTMLInputElement>('name'),
  mrn: $<HTMLInputElement>('mrn'),
  cyl: $<HTMLInputElement>('cyl'),
  problems: $<HTMLUListElement>('problems'),
  send: $<HTMLButtonElement>('send'),
  sendStatus: $<HTMLElement>('send-status'),
};

// Patient state lives only in these variables and the form fields.
let photo: Blob | undefined;
let previewUrl: string | undefined;
let photoToken = 0;

const settings = loadSettings();
el.recipients.value = settings.recipients;
el.clinician.value = settings.clinicianName;
if (!settings.recipients) el.settings.hidden = false;

$('settings-btn').addEventListener('click', () => (el.settings.hidden = !el.settings.hidden));
$('settings-done').addEventListener('click', () => {
  settings.recipients = el.recipients.value.trim();
  settings.clinicianName = el.clinician.value.trim();
  saveSettings(settings);
  el.settings.hidden = true;
  refresh();
});

for (const input of [el.camera, el.library]) {
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    if (file) void onPhoto(file);
  });
}

async function onPhoto(file: File): Promise<void> {
  const token = ++photoToken;
  setOcrStatus('Reading photo…');
  try {
    const { canvas, jpeg } = await prepareImage(file);
    if (token !== photoToken) return;
    photo = jpeg;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(jpeg);
    el.preview.src = previewUrl;
    el.preview.hidden = false;
    refresh();

    const text = await recognise(canvas, (p) => {
      if (token === photoToken) setOcrStatus(`Reading text… ${Math.round(p * 100)}%`);
    });
    if (token !== photoToken) return;
    const found = extractPatient(text);
    el.name.value = found.name;
    el.mrn.value = found.mrn;
    setOcrStatus(
      found.name && found.mrn
        ? 'Name and MRN found. Check them against the printout.'
        : 'Could not read everything. Fill in the missing fields.',
    );
  } catch (e) {
    setOcrStatus(`Problem reading photo: ${(e as Error).message}`);
  }
  refresh();
}

function setOcrStatus(msg: string): void {
  el.ocrStatus.textContent = msg;
  el.ocrStatus.hidden = !msg;
}

function currentRequest(): RequestData | undefined {
  const eye = document.querySelector<HTMLInputElement>('input[name="eye"]:checked')?.value as Eye | undefined;
  if (!eye) return undefined;
  return { name: el.name.value.trim(), mrn: el.mrn.value.trim(), eye, cyl: el.cyl.value.trim() };
}

function refresh(): void {
  const req = currentRequest();
  const problems = req ? validate(req) : [];
  if (!photo) problems.unshift('Take a photo of the biometry.');
  if (!req) problems.push('Choose the operative eye.');
  if (!settings.recipients) problems.push('Set the coordinator email in Settings.');
  el.problems.replaceChildren(
    ...problems.map((p) => Object.assign(document.createElement('li'), { textContent: p })),
  );
  el.send.disabled = problems.length > 0;
}

document.querySelector('main')!.addEventListener('input', refresh);

el.send.addEventListener('click', async () => {
  const req = currentRequest();
  if (!req || !photo) return;
  el.sendStatus.textContent = '';
  try {
    const stem = attachmentStem(req);
    const pdf = await buildRequestPdf(req, settings, new Date());
    const result = await shareEmail({
      to: settings.recipients,
      subject: emailSubject(req),
      body: emailBody(req, settings),
      files: [
        new File([new Uint8Array(pdf)], `Toric_IOL_request_${stem}.pdf`, { type: 'application/pdf' }),
        new File([photo], `Biometry_${stem}.jpg`, { type: 'image/jpeg' }),
      ],
    });
    el.sendStatus.textContent = {
      shared: 'Handed to the share sheet. Paste the address into To and send. Tap "Next patient" when done.',
      cancelled: 'Cancelled.',
      fallback: 'File sharing is not supported here. The attachments were downloaded and a mail draft was opened.',
    }[result];
  } catch (e) {
    el.sendStatus.textContent = `Could not share: ${(e as Error).message}`;
  }
});

$('reset').addEventListener('click', () => {
  photoToken++;
  photo = undefined;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = undefined;
  el.preview.removeAttribute('src');
  el.preview.hidden = true;
  for (const input of [el.name, el.mrn, el.cyl]) input.value = '';
  document.querySelectorAll<HTMLInputElement>('input[name="eye"]').forEach((r) => (r.checked = false));
  setOcrStatus('');
  el.sendStatus.textContent = '';
  refresh();
  window.scrollTo({ top: 0 });
});

refresh();
