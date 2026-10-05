# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, client-only phone PWA (Vite + vanilla TypeScript, no framework, no backend) for an ophthalmology workflow. A photo of a cataract biometry printout becomes a toric IOL approval email to the lens coordinators, with the filled PDF and the photo attached. Toric eligibility is corneal astigmatism ≥ 2.00 D (`TORIC_THRESHOLD_D` in `src/email.ts`). Work email is Office 365.

## Commands

- `npm install`: the `postinstall` hook runs `scripts/copy-ocr-assets.mjs`, which copies the Tesseract worker, LSTM WASM cores and `eng.traineddata.gz` into `public/ocr/` (gitignored). If OCR requests 404, run that script again.
- `npm run dev` / `npm run build` (runs `tsc --noEmit` then `vite build`) / `npm run preview`
- `npm test` (Vitest). Single file: `npx vitest run src/extract.test.ts`. Single test: `npx vitest run -t "UR number"`

## Hard constraints

- **Never persist or transmit patient data.** Patient state lives only in module variables and form fields in `src/main.ts`, and "Next patient" clears it. `localStorage` holds only non-patient `Settings` (coordinator address, clinician name). Don't add analytics, error reporting, CDN fetches or a server.
- **OCR stays on-device and same-origin.** `src/ocr.ts` points Tesseract's `workerPath`/`corePath`/`langPath` at `ocr/` under the app's base URL. Never fall back to Tesseract's default jsdelivr CDN. The service worker (vite-plugin-pwa, `vite.config.ts`) precaches these assets for offline use, which is why `maximumFileSizeToCacheInBytes` is raised.
- Photos are re-encoded through a canvas in `src/image.ts`. This applies the EXIF orientation and strips EXIF/GPS data from the attachment.

## Flow / architecture

`main.ts` wires up the DOM in `index.html`: photo input → `prepareImage` → `recognise` (OCR) → `extractPatient` fills name/MRN (the user always reviews them) → `validate` gates the send button → `buildRequestPdf` + `shareEmail`.

- `src/extract.ts`: label-based heuristics over OCR lines (IOLMaster `Patient:`/`Patient ID:`, Lenstar `Last name`/`First name`, `MRN`/`UR No`). Pure and unit-tested. Add a test case for any new printout format.
- `src/share.ts`: the Web Share API (`navigator.share` with files) hands the attachments to Outlook on the phone. It **cannot set recipients**, so the coordinator address is copied to the clipboard. The copy is not awaited, so `share()` keeps Safari's user activation. Browsers without file sharing fall back to downloading the attachments and opening a `mailto:` link.
- `src/pdf.ts`: currently a **placeholder** generated with pdf-lib. The goal is to fill the official blank approval form (to be placed in `public/`) via `doc.getForm()` fields.
- Sending directly through Microsoft Graph (MSAL) was considered but needs an Azure app registration in the hospital tenant. The share-sheet approach was chosen to avoid needing IT approval.
