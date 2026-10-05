import './style.css';
import { TORIC_THRESHOLD_D, attachmentStem, eligibilityWarning, emailBody, emailSubject, validate } from './email';
import { extractBiometry, type Extracted } from './extract';
import { suggestLenses, type LensSuggestions } from './lens-table';
import { FAMILIES, formatPower, inferEye, modelForCylinder, type Platform } from './lenses';
import { prepareImage } from './image';
import { readPrintout } from './ocr';
import { TEMPLATE_URL, fillOrderForm } from './pdf';
import { loadSettings, saveSettings } from './settings';
import { shareEmail, type EmailDraft } from './share';
import type { Eye, RequestData } from './types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);

const el = {
  settings: $('settings'),
  recipients: $<HTMLTextAreaElement>('recipients'),
  clinician: input('clinician'),
  contact: input('contact'),
  camera: input('camera'),
  library: input('library'),
  preview: $<HTMLImageElement>('preview'),
  ocrStatus: $('ocr-status'),
  mrn: input('mrn'),
  mrnWarning: $('mrn-warning'),
  surname: input('surname'),
  firstName: input('first-name'),
  dob: input('dob'),
  astK: input('astk'),
  axis: input('axis'),
  vmo: input('vmo'),
  surgeryDate: input('surgery-date'),
  lensModel: $<HTMLSelectElement>('lens-model'),
  lensModelOther: input('lens-model-other'),
  lensPower: input('lens-power'),
  companyWrap: $('company-wrap'),
  company: input('company'),
  lensHint: $('lens-hint'),
  lensWarning: $('lens-warning'),
  astWarning: $('ast-warning'),
  problems: $<HTMLUListElement>('problems'),
  send: $<HTMLButtonElement>('send'),
  sendStatus: $('send-status'),
};
const patientInputs = [el.mrn, el.surname, el.firstName, el.dob, el.astK, el.axis, el.surgeryDate, el.lensPower, el.lensModelOther, el.company];

// Patient state lives only in these variables and the form fields.
let photo: Blob | undefined;
let previewUrl: string | undefined;
let extracted: Extracted | undefined;
let lensSuggestions: LensSuggestions | undefined;
let photoToken = 0;

const settings = loadSettings();
el.recipients.value = settings.recipients;
el.clinician.value = settings.clinicianName;
el.contact.value = settings.contactNumber;
el.vmo.value = settings.vmo;
if (!settings.clinicianName || !settings.recipients) el.settings.hidden = false;

$('settings-btn').addEventListener('click', () => (el.settings.hidden = !el.settings.hidden));
$('settings-done').addEventListener('click', () => {
  settings.recipients = el.recipients.value.trim();
  settings.clinicianName = el.clinician.value.trim();
  settings.contactNumber = el.contact.value.trim();
  saveSettings(settings);
  el.settings.hidden = true;
  refresh();
});

for (const picker of [el.camera, el.library]) {
  picker.addEventListener('change', () => {
    const file = picker.files?.[0];
    picker.value = '';
    if (file) void onPhoto(file);
  });
}

async function onPhoto(file: File): Promise<void> {
  const token = ++photoToken;
  const current = () => token === photoToken;
  setOcrStatus('Loading photo…');
  try {
    const { ocr, jpeg } = await prepareImage(file);
    if (!current()) return;
    photo = jpeg;
    prepared = undefined;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(jpeg);
    el.preview.src = previewUrl;
    el.preview.hidden = false;
    refresh();

    const read = await readPrintout(ocr, (stage) => current() && setOcrStatus(stage));
    if (!current()) return;
    extracted = extractBiometry(read.passes);
    lensSuggestions = suggestLenses(read.tables);
    // Preselect the eye when the printout makes it obvious (the user can still change it).
    let eyeNote = '';
    const guess = !selectedEye() && inferEye(Object.keys(lensSuggestions) as Eye[], extracted.astK, TORIC_THRESHOLD_D);
    if (guess) {
      document.querySelector<HTMLInputElement>(`input[name="eye"][value="${guess.eye}"]`)!.checked = true;
      eyeNote = ` ${guess.eye.toUpperCase()} eye selected: ${guess.reason}. Change it if that's wrong.`;
    }
    el.mrn.value = extracted.mrn;
    el.surname.value = extracted.surname;
    el.firstName.value = extracted.firstName;
    el.dob.value = extracted.dob;
    el.mrnWarning.hidden = !extracted.mrnUncertain;
    fillAstK();
    fillLensPower();
    const missing = [
      !extracted.mrn && 'MRN',
      !extracted.surname && 'name',
      !extracted.dob && 'date of birth',
    ].filter(Boolean);
    setOcrStatus(
      missing.length
        ? `Couldn't read the ${missing.join(', ')}. Fill it in by hand.`
        : 'Details read. Check them against the printout.',
    );
    if (eyeNote) el.ocrStatus.textContent += eyeNote;
  } catch (e) {
    setOcrStatus(`Problem reading the photo: ${(e as Error).message}`);
  }
  refresh();
}

/** Shows the astigmatism read for the selected eye (the printout has both). */
function fillAstK(): void {
  const eye = selectedEye();
  const k = eye && extracted?.astK[eye];
  if (!eye || !extracted) return refresh();
  el.astK.value = k?.power ?? '';
  el.axis.value = k?.axis ?? '';
  refresh();
}

function selectedPlatform(): Platform {
  return (document.querySelector<HTMLInputElement>('input[name="platform"]:checked')?.value as Platform) ?? 'ZCU';
}

function selectPlatform(platform: Platform): void {
  document.querySelector<HTMLInputElement>(`input[name="platform"][value="${platform}"]`)!.checked = true;
  const family = platform === 'Other' ? undefined : FAMILIES[platform];
  el.lensModel.hidden = !family;
  el.lensModelOther.hidden = !!family;
  el.companyWrap.hidden = !!family;
  if (family) {
    el.lensModel.replaceChildren(
      new Option('Choose…', ''),
      ...family.models.map((m) => new Option(m, m)),
    );
  }
  fillLensPower();
}

/** Power read from the printout's table for the selected eye and lens family. */
function fillLensPower(): void {
  const eye = selectedEye();
  const platform = selectedPlatform();
  el.lensWarning.hidden = true;
  el.lensHint.hidden = true;
  if (!eye || !lensSuggestions || platform === 'Other') return refresh();
  const pick = lensSuggestions[eye]?.[platform];
  el.lensPower.value = pick ? String(pick.power) : '';
  const model = pick?.cyl !== undefined ? modelForCylinder(platform, pick.cyl) : undefined;
  if (model) el.lensModel.value = model;
  el.lensHint.hidden = false;
  el.lensHint.textContent = pick
    ? `${model ? `${model} ` : ''}${formatPower(String(pick.power))} from the ${pick.label} table (${eye === 'Right' ? 'OD' : 'OS'}). Check it.`
    : `No ${platform === 'ZCU' ? 'Tecnis' : 'Clareon'} table could be read for this eye. Enter the model and power.`;
  if (pick?.uncertain) {
    el.lensWarning.hidden = false;
    el.lensWarning.textContent = 'Part of the table was unclear. Check the power against the printout.';
  }
  refresh();
}

function setOcrStatus(msg: string): void {
  el.ocrStatus.textContent = msg;
  el.ocrStatus.hidden = !msg;
}

function selectedEye(): Eye | undefined {
  return document.querySelector<HTMLInputElement>('input[name="eye"]:checked')?.value as Eye | undefined;
}

function currentRequest(): RequestData | undefined {
  const eye = selectedEye();
  if (!eye) return undefined;
  const platform = selectedPlatform();
  return {
    eye,
    mrn: el.mrn.value.trim(),
    surname: el.surname.value.trim(),
    firstName: el.firstName.value.trim(),
    dob: el.dob.value.trim(),
    astK: el.astK.value.trim(),
    astAxis: el.axis.value.trim(),
    vmo: el.vmo.value.trim(),
    surgeryDate: el.surgeryDate.value,
    lensModel: (selectedPlatform() === 'Other' ? el.lensModelOther.value : el.lensModel.value).trim().toUpperCase(),
    lensPower: el.lensPower.value.trim(),
    company: platform === 'Other' ? el.company.value.trim() : FAMILIES[platform].company,
  };
}

function refresh(): void {
  const req = currentRequest();
  const problems = req ? validate(req) : [];
  if (!photo) problems.unshift('Take a photo of the biometry.');
  if (!req) problems.unshift('Choose the operative eye.');
  if (!settings.recipients) problems.push('Add the recipient emails in Settings.');
  if (!settings.clinicianName) problems.push('Add your name in Settings.');
  const warning = req && eligibilityWarning(req);
  el.astWarning.textContent = warning ?? '';
  el.astWarning.hidden = !warning;
  el.problems.replaceChildren(...problems.map((p) => Object.assign(document.createElement('li'), { textContent: p })));
  el.send.disabled = problems.length > 0;
}

document.querySelectorAll('input[name="eye"]').forEach((r) =>
  r.addEventListener('change', () => {
    fillAstK();
    fillLensPower();
  }),
);
document.querySelectorAll<HTMLInputElement>('input[name="platform"]').forEach((r) =>
  r.addEventListener('change', () => {
    selectPlatform(r.value as Platform);
    saveSettings({ ...settings, lensPlatform: (settings.lensPlatform = r.value as Platform) });
  }),
);
el.lensModel.addEventListener('change', refresh);
el.lensPower.addEventListener('input', () => (el.lensWarning.hidden = true));
selectPlatform(settings.lensPlatform);
el.mrn.addEventListener('input', () => (el.mrnWarning.hidden = true));
document.querySelector('main')!.addEventListener('input', refresh);

// Fetch the form template up front so the share call stays within the tap's user activation.
const template = fetch(TEMPLATE_URL).then((r) => {
  if (!r.ok) throw new Error(`order form template missing (${r.status})`);
  return r.arrayBuffer();
});

// The draft built for the last tap, keyed by the request it was built from.
// If Safari refuses share() because building took too long after the tap, the
// next tap reuses it and shares instantly.
let prepared: { key: string; draft: EmailDraft } | undefined;

el.send.addEventListener('click', async () => {
  const req = currentRequest();
  if (!req || !photo) return;
  el.sendStatus.textContent = '';
  const key = JSON.stringify([req, settings]);
  try {
    if (prepared?.key !== key) {
      if (req.vmo !== settings.vmo) saveSettings({ ...settings, vmo: (settings.vmo = req.vmo) });
      prepared = { key: JSON.stringify([req, settings]), draft: await buildDraft(req, photo) };
    }
    const result = await shareEmail(prepared.draft);
    el.sendStatus.textContent = {
      shared: 'Handed to the share sheet. Paste the addresses into To and send. Tap "Next patient" when done.',
      cancelled: 'Cancelled.',
      fallback: "File sharing isn't supported here. The attachments were downloaded and a mail draft opened.",
    }[result];
  } catch (e) {
    el.sendStatus.textContent =
      (e as DOMException).name === 'NotAllowedError'
        ? 'Email is ready. Tap "Prepare email" again to share it.'
        : `Could not prepare the email: ${(e as Error).message}`;
  }
});

async function buildDraft(req: RequestData, photo: Blob): Promise<EmailDraft> {
  const stem = attachmentStem(req);
  const pdf = await fillOrderForm(await template, req, settings, new Date());
  return {
    to: settings.recipients,
    subject: emailSubject(req),
    body: emailBody(settings),
    files: [
      new File([new Uint8Array(pdf)], `High_cost_lens_order_toric_${stem}.pdf`, { type: 'application/pdf' }),
      new File([photo], `Biometry_${stem}.jpg`, { type: 'image/jpeg' }),
    ],
  };
}

$('reset').addEventListener('click', () => {
  photoToken++;
  photo = undefined;
  extracted = undefined;
  lensSuggestions = undefined;
  prepared = undefined;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = undefined;
  el.preview.removeAttribute('src');
  el.preview.hidden = true;
  for (const i of patientInputs) i.value = '';
  el.mrnWarning.hidden = true;
  selectPlatform(settings.lensPlatform);
  document.querySelectorAll<HTMLInputElement>('input[name="eye"]').forEach((r) => (r.checked = false));
  setOcrStatus('');
  el.sendStatus.textContent = '';
  refresh();
  window.scrollTo({ top: 0 });
});

refresh();

// Lets the boot check in index.html know the app started.
(window as unknown as { __appStarted: boolean }).__appStarted = true;
