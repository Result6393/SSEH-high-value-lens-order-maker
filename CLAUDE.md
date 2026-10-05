# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, client-only phone PWA (Vite + vanilla TypeScript, no framework, no backend) for an ophthalmology workflow. A photo of a Zeiss IOLMaster 700 "IOL CALCULATION" printout (either the Barrett Universal II page with both eyes, or a Barrett Toric page for one eye) becomes an email to the lens coordinators, attaching the filled SSEH "Other High Cost Implants and Prosthesis" order form and the photo. Lenses are toric: usually J&J Tecnis ZCU (e.g. "ZCU300 +22.0D"), sometimes Alcon Clareon CNA0T (families in `src/lenses.ts`). Toric eligibility is corneal astigmatism ≥ 2.00 D (`TORIC_THRESHOLD_D` in `src/email.ts`). Work email is Office 365.

## Commands

- `npm install`: the `postinstall` hook runs `scripts/copy-ocr-assets.mjs`, which copies the Tesseract worker, LSTM WASM cores and `eng.traineddata.gz` into `public/ocr/` (gitignored). If OCR requests 404, run that script again.
- `npm run dev` / `npm run build` (runs `tsc --noEmit` then `vite build`) / `npm run preview`
- Deploys to GitHub Pages via `.github/workflows/deploy.yml` on push (runs tests + build). `base: './'` in `vite.config.ts` keeps it working under the `/<repo>/` subpath.
- `npm test` (Vitest). Single file: `npx vitest run src/extract.test.ts`. Single test: `npx vitest run -t "UR number"`

## Hard constraints

- **Never persist or transmit patient data.** Patient state lives only in module variables and form fields in `src/main.ts`, and "Next patient" clears it. `localStorage` holds only non-patient `Settings` (recipients, clinician name, contact number, last VMO surgeon, last lens family). Don't add analytics, error reporting, CDN fetches or a server.
- `public/forms/toric-lens-order-form.pdf` is the official form with the user's personal annotations stripped; name and contact number come from Settings at fill time. Don't commit personal details into the template.
- **OCR stays on-device and same-origin.** `src/ocr.ts` points Tesseract's `workerPath`/`corePath`/`langPath` at `ocr/` under the app's base URL. Never fall back to Tesseract's default jsdelivr CDN. The service worker (vite-plugin-pwa, `vite.config.ts`) precaches these assets for offline use, which is why `maximumFileSizeToCacheInBytes` is raised.
- Photos are re-encoded through a canvas in `src/image.ts`. This applies the EXIF orientation and strips EXIF/GPS data from the attachment.

## Flow / architecture

`main.ts` wires up the DOM in `index.html`: photo input → `prepareImage` (grayscale + contrast canvas for OCR, EXIF-free JPEG for the email) → `readPrintout` → `extractBiometry` fills the fields (the user always reviews them) → `validate` gates the send button (`eligibilityWarning` for Ast. K < 2 D only warns) → `fillOrderForm` + `shareEmail`.

- `src/ocr.ts`: Tesseract passes on one shared worker: the full page, a tight crop of the patient header (located from the first pass's line boxes), then each lens power table upscaled 2x with a digits-only whitelist. Returns word boxes (`src/ocr-types.ts`, header pass first) plus table texts. Keep `tessedit_pageseg_mode` at SINGLE_BLOCK (tesseract.js's default): AUTO splits the header labels from their values.
- `src/lens-table.ts`: `findLensTables` anchors on each table's "Barrett Universal/Toric" formula header (lens names OCR too badly to rely on; "Barrett" itself can come out as "Barn") and classifies tables by their fuzzy lens name: ZCB00 or ZCT → ZCU, Clareon "CNA 0Tx" or AcrySof SN6AT → CNA0T. A monofocal row of six unclassified tables falls back to position (Clareon, Clareon, ZCB00 per eye). Crop boxes are sized in multiples of the "Barrett" word width. OD/OS is decided by the biometry columns, or on toric pages by the "OD ... OS" heading; a page with tables for one eye only auto-selects that eye. `pickPower` rounds the exact target-refraction power (monofocal pages' non-0.5-step row) to 0.5 D, cross-checked by interpolating step rows where the residual crosses zero (toric pages print "---", so interpolation only); lost minus signs are restored from row order. On toric pages `pickCylinder` reads the "Toric Power" column and takes the middle (bold, recommended) of three; `modelForCylinder` maps it to ZCU### / CNA0T# (same cylinder ladder). On monofocal pages the user picks the toric model.
- `src/extract.ts`: pure, unit-tested heuristics over those word boxes. Wide gaps between words become a `¦` marker (`lineText`), which cuts names off before tick marks and stamps. Results from the passes are merged; MRN disagreement between passes sets `mrnUncertain` (shown as a warning). The printout always has both eyes: each `Ast. K` label is assigned to OD/OS by lining it up with the left edge of its column's row labels (AL, ACD, LT, CCT, K1, K2).
- `test/fixtures/iolmaster-700-photo.json` (Barrett Universal II page) and `iolmaster-700-toric-photo.json` (Barrett Toric page) are real browser OCR output from photos of printouts (identifiers blanked, fake ones drawn in). Regenerate them if `src/ocr.ts` changes what it reads or returns.
- `src/pdf.ts`: the form has no fillable fields, so `fillOrderForm` draws text at fixed cell positions (pixel coordinates on a 100 dpi render, shrinking text to fit). The template has "ZCU"/"J&J" baked into the implant and company rows, so those are whited out and redrawn with the chosen lens. The "Refraction Of Eye To Be Operated On" row states the operative eye and its astigmatism.
- `src/share.ts`: the Web Share API (`navigator.share` with files) hands the attachments to Outlook on the phone. It **cannot set recipients**, so the user's recipients (entered in Settings; no addresses are hard-coded) are copied to the clipboard. The copy is not awaited, so `share()` keeps Safari's user activation; if Safari still refuses (`NotAllowedError`), `main.ts` keeps the built draft and a second tap shares it instantly. Browsers without file sharing fall back to downloading the attachments and opening a `mailto:` link.
- Sending directly through Microsoft Graph (MSAL) was considered but needs an Azure app registration in the hospital tenant. The share-sheet approach was chosen to avoid needing IT approval.
