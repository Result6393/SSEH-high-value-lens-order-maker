# SSEH Orders (toric lens and tutoplast)

Phone web app (installable PWA) that turns a photo of a biometry printout into a
toric IOL approval email for the lens coordinators:

1. Photograph the IOLMaster biometry printout (the both-eyes Barrett Universal II
   page, or a one-eye Barrett Toric page).
2. Check the operative eye (preselected when only one eye has tables or Ast. K ≥ 2 D, otherwise pick it). MRN, name, date of birth and that eye's Ast. K are
   read from the photo (check them against the printout).
3. Pick the lens: Tecnis ZCU (default) or Clareon. The power is read from that
   lens's table for the chosen eye; on a Barrett Toric page the recommended toric
   model (e.g. ZCU300, CNA0T5) is filled in too, otherwise pick it.
4. Check the **Diagnosis** text for the order form (defaults to "High cyl / astigmatism >2"; change it if you need).
5. Optionally add more images ("Take another" / "Add images") to attach as well.
6. Tap **Prepare email**: the SSEH high cost lens order form (filled in), the
   biometry photo and any extra images go to the phone's share sheet. Choose Outlook, paste your recipients
   (already copied, separated by semicolons so Outlook takes them all) into To, then send.

What you choose for each eye and lens type (Tecnis / Clareon / Other) is remembered while you work on a patient, so switching between them doesn't lose it.

Lens powers can be typed any way ("16", "+16", "16.0D"); they are written as "+16.0D".
The email text can be changed in Settings; `{patient}`, `{mrn}`, `{lens}` and `{name}` (your first name) are filled in.

## Tutoplast tab

For tutoplast orders (same SSEH high cost form, same recipients): photograph the patient sticker
(any orientation, even stuck onto a form), check the MRN, name (one field) and date of birth, choose the operative
eye and pick the diagnosis from the dropdown ("IOP not controlled…", "Hypotony…", or **Other** with a
text box). No biometry is needed. **Prepare email** attaches the filled form only (the sticker photo is
not sent). The MRN is taken from the sticker's barcode when it can be read (otherwise from the printed number). The email text for this tab is separate in Settings.

**No patient data is stored.** The photo, OCR text and fields stay in memory only and
are cleared by "Next patient" or by closing the app. Text recognition runs on the
phone (Tesseract, served from this app, works offline), so nothing is uploaded
anywhere except the email you send yourself. Only your recipient list,
your name, contact number, last VMO surgeon and email text are saved, in the browser's local storage.

The version number is in the header; Settings also shows the build id (the commit), which tells you whether your phone has the newest copy.

## Development

```sh
npm install        # also copies OCR assets into public/ocr
npm run dev        # dev server on the LAN (a real phone's camera needs HTTPS: use a tunnel or deploy)
npm test           # unit tests
npm run build      # typecheck + production build in dist/
npm version minor --no-git-tag-version   # bump the version shown in the app (or patch)
```

Pushes are built, tested and deployed to GitHub Pages by
`.github/workflows/deploy.yml` (repo Settings → Pages → Source: GitHub Actions).
Open the site on the phone, then use "Add to Home Screen". On first launch,
enter your recipients, name and contact number in Settings.

