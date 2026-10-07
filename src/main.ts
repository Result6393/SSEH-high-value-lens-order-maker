import './style.css';
import { DEFAULT_EMAIL_BODY, joinName, DEFAULT_TUTOPLAST_EMAIL_BODY, DEFAULT_ISTENT_EMAIL_BODY, TORIC_THRESHOLD_D, attachmentStem, eligibilityWarning, emailBody, emailSubject, validate } from './email';
import { extractBiometry, type Extracted } from './extract';
import { suggestLenses, type LensSuggestions } from './lens-table';
import { LensMemory } from './lens-memory';
import { FAMILIES, formatPower, inferEye, modelForCylinder, type Platform } from './lenses';
import { prepareAttachment, prepareImage } from './image';
import { readPrintout } from './ocr';
import { DEFAULT_DIAGNOSIS, TEMPLATE_URL, fillOrderForm } from './pdf';
import { loadSettings, saveSettings } from './settings';
import { parseRecipients } from './recipients';
import { NEXT_PATIENT, type PatientDetails } from './patient';
import { initStickerStep, stickerName } from './sticker-ui';
import { initTutoplast } from './tutoplast-ui';
import { shareEmail, type EmailDraft } from './share';
import type { Eye, RequestData } from './types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);

const el = {
  settings: $('settings'),
  recipients: $<HTMLTextAreaElement>('recipients'),
  recipientsInfo: $('recipients-info'),
  clinician: input('clinician'),
  contact: input('contact'),
  emailBody: $<HTMLTextAreaElement>('email-body'),
  tpEmailBody: $<HTMLTextAreaElement>('tp-email-body'),
  isEmailBody: $<HTMLTextAreaElement>('is-email-body'),
  camera: input('camera'),
  library: input('library'),
  preview: $<HTMLImageElement>('preview'),
  extraCamera: input('extra-camera'),
  extraLibrary: input('extra-library'),
  extras: $<HTMLUListElement>('extras'),
  extrasStatus: $('extras-status'),
  ocrStatus: $('ocr-status'),
  mrn: input('mrn'),
  mrnWarning: $('mrn-warning'),
  name: input('name'),
  astKRight: input('astk-re'),
  astKLeft: input('astk-le'),
  vmo: input('vmo'),
  surgeryDate: input('surgery-date'),
  diagnosis: $<HTMLTextAreaElement>('diagnosis'),
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
const patientInputs = [el.mrn, el.name, el.astKRight, el.astKLeft, el.surgeryDate, el.lensPower, el.lensModelOther, el.company];

// Patient state lives only in these variables and the form fields.
let photo: Blob | undefined;
let extras: { blob: Blob; url: string }[] = [];
let previewUrl: string | undefined;
let extracted: Extracted | undefined;
/** Warnings shown under the MRN field: about the sticker read, and about the biometry's MRN. */
let mrnWarnings: { sticker?: string; biometry?: string } = {};
let stickerMrn = '';
let lensSuggestions: LensSuggestions | undefined;
const lensMemory = new LensMemory();
let photoToken = 0;

// Version in the header and tab title; the build id (commit) shows in Settings.
$('version').textContent = `v${__APP_VERSION__}`;
$('build-info').textContent = `Version ${__APP_VERSION__} (build ${__APP_BUILD__})`;
document.title = `SSEH Orders v${__APP_VERSION__}`;

el.diagnosis.value = DEFAULT_DIAGNOSIS;

const settings = loadSettings();
el.recipients.value = settings.recipients;
el.clinician.value = settings.clinicianName;
el.contact.value = settings.contactNumber;
el.emailBody.value = settings.emailBody || DEFAULT_EMAIL_BODY;
el.tpEmailBody.value = settings.tutoplastEmailBody || DEFAULT_TUTOPLAST_EMAIL_BODY;
el.isEmailBody.value = settings.istentEmailBody || DEFAULT_ISTENT_EMAIL_BODY;
el.vmo.value = settings.vmo;
if (!settings.clinicianName || !parseRecipients(settings.recipients).length) el.settings.hidden = false;

/** Says how many addresses were recognised, so a mis-typed list is noticed before sending. */
function showRecipientCount(): void {
  const n = parseRecipients(el.recipients.value).length;
  el.recipientsInfo.textContent = n ? `${n} address${n === 1 ? '' : 'es'} recognised.` : 'No email addresses found yet.';
}
el.recipients.addEventListener('input', showRecipientCount);
showRecipientCount();

$('settings-btn').addEventListener('click', () => (el.settings.hidden = !el.settings.hidden));
$('settings-done').addEventListener('click', () => {
  settings.recipients = el.recipients.value.trim();
  settings.clinicianName = el.clinician.value.trim();
  settings.contactNumber = el.contact.value.trim();
  // Storing nothing for the stock text lets future improvements to the default reach this user.
  const text = el.emailBody.value.replace(/\r\n?/g, '\n');
  settings.emailBody = text.trim() === DEFAULT_EMAIL_BODY ? '' : text;
  const tpText = el.tpEmailBody.value.replace(/\r\n?/g, '\n');
  settings.tutoplastEmailBody = tpText.trim() === DEFAULT_TUTOPLAST_EMAIL_BODY ? '' : tpText;
  const isText = el.isEmailBody.value.replace(/\r\n?/g, '\n');
  settings.istentEmailBody = isText.trim() === DEFAULT_ISTENT_EMAIL_BODY ? '' : isText;
  saveSettings(settings);
  el.settings.hidden = true;
  refresh();
});

$('email-reset').addEventListener('click', () => (el.emailBody.value = DEFAULT_EMAIL_BODY));
$('tp-email-reset').addEventListener('click', () => (el.tpEmailBody.value = DEFAULT_TUTOPLAST_EMAIL_BODY));
$('is-email-reset').addEventListener('click', () => (el.isEmailBody.value = DEFAULT_ISTENT_EMAIL_BODY));

for (const picker of [el.extraCamera, el.extraLibrary]) {
  picker.addEventListener('change', () => {
    const files = [...(picker.files ?? [])];
    picker.value = '';
    if (files.length) void addExtras(files);
  });
}

async function addExtras(files: File[]): Promise<void> {
  const failed: string[] = [];
  for (const file of files) {
    try {
      const blob = await prepareAttachment(file);
      extras.push({ blob, url: URL.createObjectURL(blob) });
    } catch {
      failed.push(file.name || 'an image');
    }
  }
  el.extrasStatus.hidden = !failed.length;
  el.extrasStatus.textContent = failed.length ? `Couldn't read ${failed.join(', ')}.` : '';
  prepared = undefined;
  renderExtras();
}

function renderExtras(): void {
  el.extras.replaceChildren(
    ...extras.map((x, i) => {
      const li = document.createElement('li');
      const img = Object.assign(document.createElement('img'), { src: x.url, alt: `Extra image ${i + 1}` });
      const remove = Object.assign(document.createElement('button'), {
        type: 'button',
        textContent: '×',
        ariaLabel: `Remove extra image ${i + 1}`,
      });
      remove.addEventListener('click', () => {
        URL.revokeObjectURL(x.url);
        extras = extras.filter((e) => e !== x);
        prepared = undefined;
        renderExtras();
      });
      li.append(img, remove);
      return li;
    }),
  );
}

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
    lensMemory.clear(); // a new printout starts a fresh set of lens choices
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
    // The patient sticker is the main source of name and MRN; the biometry only fills what is still empty.
    const filled: string[] = [];
    if (!el.mrn.value && extracted.mrn) {
      el.mrn.value = extracted.mrn;
      filled.push('MRN');
      if (extracted.mrnUncertain) mrnWarnings.biometry = 'The MRN read differently on two passes. Check every digit against the printout.';
    }
    if (!el.name.value && extracted.surname) {
      el.name.value = joinName(extracted.surname, extracted.firstName);
      filled.push('name');
    }
    // A different MRN on the printout than on the sticker may mean the wrong patient (or a misread digit).
    if (stickerMrn && extracted.mrn && extracted.mrn !== stickerMrn) mrnWarnings.biometry = mrnMismatch(extracted.mrn);
    showMrnWarning();
    fillAstK();
    showLens();
    const missing = [!el.mrn.value && 'MRN', !el.name.value && 'name'].filter(Boolean);
    setOcrStatus(
      (filled.length ? `${filled.join(' and ')} filled in from the biometry. ` : '') +
        (missing.length ? `Still missing: ${missing.join(' and ')}. Fill it in by hand.` : 'Details read. Check them against the printout.'),
    );
    if (eyeNote) el.ocrStatus.textContent += eyeNote;
  } catch (e) {
    setOcrStatus(`Problem reading the photo: ${(e as Error).message}`);
  }
  refresh();
}

const mrnMismatch = (biometryMrn: string) => `The MRN on the biometry (${biometryMrn}) differs from the sticker's. Check it is the same patient.`;

function showMrnWarning(): void {
  const text = mrnWarnings.biometry ?? mrnWarnings.sticker ?? '';
  el.mrnWarning.textContent = text;
  el.mrnWarning.hidden = !text;
}

const sticker = initStickerStep(
  { camera: input('st-camera'), library: input('st-library'), preview: $<HTMLImageElement>('st-preview'), status: $('st-status') },
  (read) => {
    // The sticker is the preferred source, so a new one replaces both fields, even with blanks:
    // keeping the previous patient's name after a failed read would be worse than an empty field.
    // (Retaking the biometry afterwards fills any gap.)
    el.mrn.value = read.mrn;
    el.name.value = stickerName(read);
    stickerMrn = read.mrn;
    mrnWarnings = {
      sticker: read.mrnSource === 'text' ? "The barcode couldn't be read, so the MRN is from the printed digits. Check every digit." : undefined,
      // If the biometry was read first, compare its MRN with the sticker's.
      biometry: read.mrn && extracted?.mrn && extracted.mrn !== read.mrn ? mrnMismatch(extracted.mrn) : undefined,
    };
    showMrnWarning();
    refresh();
  },
);

/** Shows the astigmatism read for each eye (the printout has both). */
function fillAstK(): void {
  el.astKRight.value = extracted?.astK.Right?.power ?? '';
  el.astKLeft.value = extracted?.astK.Left?.power ?? '';
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
  showLens();
}

/** Stores what is on screen as the user's choice for the current eye and lens family. */
function rememberLens(): void {
  const platform = selectedPlatform();
  lensMemory.remember(selectedEye(), platform, {
    model: platform === 'Other' ? el.lensModelOther.value : el.lensModel.value,
    power: el.lensPower.value,
    company: el.company.value,
  });
}

/**
 * Fills the lens fields for the current eye and lens family: the user's earlier
 * choice if there is one, otherwise what the printout suggests (power from that
 * lens's table and, on Barrett Toric pages, the recommended model).
 */
function showLens(): void {
  const eye = selectedEye();
  const platform = selectedPlatform();
  el.lensWarning.hidden = true;
  el.lensHint.hidden = true;
  const pick = eye && platform !== 'Other' ? lensSuggestions?.[eye]?.[platform] : undefined;
  const suggestedModel = pick?.cyl !== undefined && platform !== 'Other' ? modelForCylinder(platform, pick.cyl) : undefined;
  const side = eye ? ` (${eye === 'Right' ? 'OD' : 'OS'})` : '';
  const saved = lensMemory.recall(eye, platform);

  if (saved) {
    (platform === 'Other' ? el.lensModelOther : el.lensModel).value = saved.model;
    el.lensPower.value = saved.power;
    el.company.value = saved.company;
    el.lensHint.hidden = false;
    el.lensHint.textContent =
      'Your earlier choice for this eye and lens.' +
      (pick ? ` The printout suggests ${suggestedModel ? `${suggestedModel} ` : ''}${formatPower(String(pick.power))}${side}.` : '');
  } else {
    el.lensModelOther.value = '';
    el.company.value = '';
    el.lensPower.value = pick ? formatPower(String(pick.power)) : '';
    el.lensModel.value = suggestedModel ?? '';
    if (eye && lensSuggestions && platform !== 'Other') {
      el.lensHint.hidden = false;
      el.lensHint.textContent = pick
        ? `${suggestedModel ? `${suggestedModel} ` : ''}${formatPower(String(pick.power))} from the ${pick.label} table${side}. Check it.`
        : `No ${platform === 'ZCU' ? 'Tecnis' : 'Clareon'} table could be read for this eye. Enter the model and power.`;
      if (pick?.uncertain) {
        el.lensWarning.hidden = false;
        el.lensWarning.textContent = 'Part of the table was unclear. Check the power against the printout.';
      }
    }
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
    name: el.name.value.trim(),
    astKRight: el.astKRight.value.trim(),
    astKLeft: el.astKLeft.value.trim(),
    vmo: el.vmo.value.trim(),
    surgeryDate: el.surgeryDate.value,
    diagnosis: el.diagnosis.value.trim(),
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
  if (!parseRecipients(settings.recipients).length) problems.push('Add the recipient emails in Settings.');
  if (!settings.clinicianName) problems.push('Add your name in Settings.');
  const warning = req && eligibilityWarning(req);
  el.astWarning.textContent = warning ?? '';
  el.astWarning.hidden = !warning;
  el.problems.replaceChildren(...problems.map((p) => Object.assign(document.createElement('li'), { textContent: p })));
  el.send.disabled = problems.length > 0;
}

document.querySelectorAll('input[name="eye"]').forEach((r) =>
  r.addEventListener('change', showLens),
);
document.querySelectorAll<HTMLInputElement>('input[name="platform"]').forEach((r) =>
  r.addEventListener('change', () => {
    selectPlatform(r.value as Platform);
    saveSettings({ ...settings, lensPlatform: (settings.lensPlatform = r.value as Platform) });
  }),
);
// Anything the user picks or types is remembered for this eye and lens family.
el.lensModel.addEventListener('change', rememberLens);
el.lensModelOther.addEventListener('input', rememberLens);
el.company.addEventListener('input', rememberLens);
el.lensPower.addEventListener('input', () => {
  el.lensWarning.hidden = true;
  rememberLens();
});
// Typing "16" becomes "+16.0D" when leaving the field.
el.lensPower.addEventListener('change', () => {
  el.lensPower.value = formatPower(el.lensPower.value);
  rememberLens();
});
selectPlatform(settings.lensPlatform);
el.mrn.addEventListener('input', () => {
  mrnWarnings = {};
  showMrnWarning();
});
$('tab-toric').addEventListener('input', refresh);

// Fetch the form template up front so the share call stays within the tap's user activation.
const template = fetch(TEMPLATE_URL).then((r) => {
  if (!r.ok) throw new Error(`order form template missing (${r.status})`);
  return r.arrayBuffer();
});

const tutoplast = initTutoplast({ settings, template });

function getDetails(): PatientDetails {
  return { mrn: el.mrn.value.trim(), name: el.name.value.trim(), eye: selectedEye(), vmo: el.vmo.value.trim(), surgeryDate: el.surgeryDate.value };
}

/** Fills in what the other tab has; blank values leave this tab's own untouched. */
function setDetails(d: PatientDetails): void {
  if (d.mrn && d.mrn !== el.mrn.value) {
    el.mrn.value = d.mrn;
    stickerMrn = d.mrn;
    mrnWarnings = {};
    showMrnWarning();
  }
  if (d.name) el.name.value = d.name;
  if (d.vmo) el.vmo.value = d.vmo;
  if (d.surgeryDate) el.surgeryDate.value = d.surgeryDate;
  if (d.eye && d.eye !== selectedEye()) {
    document.querySelector<HTMLInputElement>(`input[name="eye"][value="${d.eye}"]`)!.checked = true;
    showLens();
  } else {
    refresh();
  }
}


const tabs = {
  toric: { panel: $('tab-toric'), get: getDetails, set: setDetails },
  tutoplast: { panel: $('tab-tutoplast'), get: tutoplast.getDetails, set: tutoplast.setDetails },
};
let activeTab: keyof typeof tabs = 'toric';
for (const name of Object.keys(tabs) as (keyof typeof tabs)[]) {
  $(`tab-${name}-btn`).addEventListener('click', () => {
    if (name !== activeTab) {
      // Same patient on the other tab: carry over what is filled in here.
      tabs[name].set(tabs[activeTab].get());
      activeTab = name;
    }
    for (const [other, tab] of Object.entries(tabs)) {
      tab.panel.hidden = other !== name;
      $(`tab-${other}-btn`).setAttribute('aria-selected', String(other === name));
    }
    window.scrollTo({ top: 0 });
  });
}

// The draft built for the last tap, keyed by the request it was built from.
// If Safari refuses share() because building took too long after the tap, the
// next tap reuses it and shares instantly.
let prepared: { key: string; draft: EmailDraft } | undefined;

el.send.addEventListener('click', async () => {
  const req = currentRequest();
  if (!req || !photo) return;
  el.sendStatus.textContent = '';
  el.lensPower.value = formatPower(el.lensPower.value);
  req.lensPower = el.lensPower.value;
  const key = JSON.stringify([req, settings]);
  try {
    if (prepared?.key !== key) {
      if (req.vmo !== settings.vmo) saveSettings({ ...settings, vmo: (settings.vmo = req.vmo) });
      prepared = { key: JSON.stringify([req, settings]), draft: await buildDraft(req, photo, extras.map((x) => x.blob)) };
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

async function buildDraft(req: RequestData, photo: Blob, more: Blob[]): Promise<EmailDraft> {
  const stem = attachmentStem(req);
  const pdf = await fillOrderForm(await template, req, settings, new Date());
  return {
    to: settings.recipients,
    subject: emailSubject(req),
    body: emailBody(settings, req),
    files: [
      new File([new Uint8Array(pdf)], `High_cost_lens_order_toric_${stem}.pdf`, { type: 'application/pdf' }),
      new File([photo], `Biometry_${stem}.jpg`, { type: 'image/jpeg' }),
      ...more.map((b, i) => new File([b], `Image_${i + 2}_${stem}.jpg`, { type: 'image/jpeg' })),
    ],
  };
}

$('reset').addEventListener('click', () => document.dispatchEvent(new Event(NEXT_PATIENT)));
document.addEventListener(NEXT_PATIENT, () => {
  photoToken++;
  photo = undefined;
  extracted = undefined;
  lensSuggestions = undefined;
  prepared = undefined;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = undefined;
  el.preview.removeAttribute('src');
  el.preview.hidden = true;
  for (const x of extras) URL.revokeObjectURL(x.url);
  extras = [];
  renderExtras();
  el.extrasStatus.hidden = true;
  for (const i of patientInputs) i.value = '';
  el.diagnosis.value = DEFAULT_DIAGNOSIS; // free text may name the patient, so it is never saved
  mrnWarnings = {};
  stickerMrn = '';
  showMrnWarning();
  sticker.reset();
  lensMemory.clear();
  document.querySelectorAll<HTMLInputElement>('input[name="eye"]').forEach((r) => (r.checked = false));
  selectPlatform(settings.lensPlatform);
  setOcrStatus('');
  el.sendStatus.textContent = '';
  refresh();
  window.scrollTo({ top: 0 });
});

refresh();

// Lets the boot check in index.html know the app started.
(window as unknown as { __appStarted: boolean }).__appStarted = true;
