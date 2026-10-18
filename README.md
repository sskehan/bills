# Bills

A small offline phone app for household bills: what's due, day-before savings
transfers, yearly reviews, pay fortnights, investment properties and reports.

* Runs from GitHub Pages and can be added to an Android home screen.
* All data stays on the phone. If you connect a **private** data repo, the app
  locks everything with your family passphrase (AES-256-GCM) before sending it,
  so GitHub only ever stores scrambled data.
* No bill data belongs in this repository — it holds the app's code only.

Files: `index.html`, `styles.css`, `sw.js` (offline), `manifest.webmanifest`,
`js/` (app code; `core.js` holds every calculation and is also used by the
alert job), `icons/`, `fonts/` (IBM Plex, SIL Open Font License),
`js/vendor/qrcode.js` (MIT, Kazuhiko Arase).
