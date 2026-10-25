# MyMint — coin collection app (version 1.14)

Runs on your phone with no Claude and no account. Your coins and photos are stored on the
phone itself, with a live copy in your own Dropbox once connected. Same setup as MyMaglites.

## Files in this folder
index.html · core.js · app.js · sw.js · manifest.webmanifest · jszip.min.js · jspdf.umd.min.js ·
icon-192.png · icon-512.png · icon-maskable-512.png · README.md

## 1. Put the app online (once) — GitHub Pages
1. On github.com click **+ → New repository**. Name it `mymint`, choose **Public**, create it.
2. Click **uploading an existing file**, drag in all the files above (not the folder), **Commit changes**.
3. **Settings → Pages** → Source **Deploy from a branch**, Branch **main**, folder **/ (root)** → **Save**.
4. After 1–2 minutes the app is at `https://sskehan.github.io/mymint/`

Never upload a backup .zip to GitHub — the repository is public.

## 2. Install on your phone
Open the address in Chrome → **⋮ → Add to Home screen / Install app**.
(If Chrome won't install it, Samsung Internet works, as with Our Tax.)

## 3. Load your starter list
Save `mymint-starter-backup.json` (or the .zip) to the phone, then in the app:
**More → Backup & restore → Choose backup file… → Restore**. Your 13 coins load.
Then tap the **To finish** chip to work through the details each one still needs.

## 4. Connect Dropbox (automatic backups)
1. At **dropbox.com/developers/apps** → **Create app** → **Scoped access** → **App folder** → name it `MyMint`.
2. **Permissions** tab: tick `files.metadata.write`, `files.content.write`, `files.content.read` → **Submit**.
3. **Settings** tab: under **OAuth 2 → Redirect URIs** add exactly `https://sskehan.github.io/mymint/`
4. Copy the **App key** (not the secret).
5. In MyMint: **More → Backup & restore** → paste the App key → **Connect Dropbox**.
   (From version 1.01 your App key is built in — just tap **Connect Dropbox**.)

## 5. Numista lookups (fills in details for you)
1. Sign in at **en.numista.com**, open **en.numista.com/api**, choose the **Free plan**.
2. In MyMint: **More → Numista lookups** → paste the key → **Save key** → **Test it**.
The key stays in the app and its backups only — never in the public GitHub files.

## Changing the app later
Upload the changed files, and in `sw.js` change `const VERSION = "mm-1.14"` to the new version
(e.g. `"mm-1.01"`). That tells phones to pick up the update. Your data is not affected.
