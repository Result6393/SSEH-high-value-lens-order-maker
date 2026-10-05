# Toric IOL Request

Phone web app (installable PWA) that turns a photo of a biometry printout into a
toric IOL approval email for the lens coordinators:

1. Photograph the IOLMaster biometry printout.
2. Pick the operative eye. MRN, name, date of birth and that eye's Ast. K are
   read from the photo (check them against the printout).
3. Tap **Prepare email**: the SSEH high cost lens order form (filled in) and the
   photo go to the phone's share sheet. Choose Outlook, paste the coordinator
   addresses (already copied) into To, then send.

**No patient data is stored.** The photo, OCR text and fields stay in memory only and
are cleared by "Next patient" or by closing the app. Text recognition runs on the
phone (Tesseract, served from this app, works offline), so nothing is uploaded
anywhere except the email you send yourself. Only the coordinator addresses,
your name, contact number and last VMO surgeon are saved, in the browser's local storage.

## Development

```sh
npm install        # also copies OCR assets into public/ocr
npm run dev        # dev server on the LAN (a real phone's camera needs HTTPS: use a tunnel or deploy)
npm test           # unit tests
npm run build      # typecheck + production build in dist/
```

Deploy `dist/` to any static HTTPS host, open it on the phone, then use
"Add to Home Screen".

