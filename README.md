# Bills

A small offline phone app for household bills: what's due, day-before savings
transfers, yearly reviews, pay fortnights, investment properties and reports.

* Runs from GitHub Pages and can be added to an Android home screen.
* All data stays on the phone. If you connect a **private** data repo, the app
  locks everything with your family passphrase (AES-256-GCM) before sending it,
  so GitHub only ever stores scrambled data.
* No bill data belongs in this repository — it holds the app's code only.

All files sit at the top level (no folders): `index.html`, `styles.css`, `sw.js`
(offline), `manifest.webmanifest`, the app code (`app.js`, `core.js` — every
calculation, also used by the alert job — `crypto.js`, `store.js`, `ui.js`),
icons, IBM Plex fonts (SIL Open Font License) and `qrcode.js` (MIT, Kazuhiko Arase).
