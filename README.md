# Toric IOL Request

Phone web app (installable PWA) that turns a photo of a biometry printout into a
toric IOL approval email for the lens coordinators:

1. Photograph the biometry printout.
2. Pick the operative eye. Name and MRN are read from the photo (check them).
3. Tap **Prepare email**: the approval PDF and the photo go to the phone's share
   sheet. Choose Outlook, paste the coordinator address (already copied) into To, then send.

**No patient data is stored.** The photo, OCR text and fields stay in memory only and
are cleared by "Next patient" or by closing the app. Text recognition runs on the
phone (Tesseract, served from this app, works offline), so nothing is uploaded
anywhere except the email you send yourself. Only the coordinator address and
your name are saved, in the browser's local storage.

## Development

```sh
npm install        # also copies OCR assets into public/ocr
npm run dev        # dev server on the LAN (a real phone's camera needs HTTPS: use a tunnel or deploy)
npm test           # unit tests
npm run build      # typecheck + production build in dist/
```

Deploy `dist/` to any static HTTPS host, open it on the phone, then use
"Add to Home Screen".

## Status

The approval PDF is a placeholder (`src/pdf.ts`) until the official blank form is added.
