// Dropbox backup. A locked copy of the bills (same family passphrase as GitHub)
// is kept in the app's own Dropbox folder, updated a few seconds after every
// change, with one full snapshot a day kept for 60 days.
//
//   Dropbox › Apps › Bills
//     live/bills.enc.json                    the current copy
//     snapshots/bills-YYYY-MM-DD.enc.json    one a day (plus one before every restore)
//
// Sign-in is OAuth with PKCE: no password or App secret is ever stored, only a
// revocable Dropbox token on this phone. The app can only see its own folder.
import { lock, unlock, newSalt } from './crypto.js';
import { mergeDocs } from './core.js';
import { canon } from './store.js';

export const APP_KEY = 'slmht8ep41a2gac'; // public App key for the Bills Dropbox app (not a secret)
export const LIVE = '/live/bills.enc.json';
export const SNAP_DIR = '/snapshots';
export const KEEP_DAYS = 60;
const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const AUTH_URL = 'https://www.dropbox.com/oauth2/authorize';

export const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '');
export const isOn = (dev) => !!(dev && dev.dbx && dev.dbx.refresh);

export class DbxErr extends Error { constructor(m, status, summary) { super(m); this.status = status; this.summary = summary || ''; } }
const notFound = (e) => e instanceof DbxErr && e.status === 409 && /not_found/.test(e.summary);
const isConflict = (e) => e instanceof DbxErr && e.status === 409 && /conflict/.test(e.summary);
// Dropbox-API-Arg must be ASCII
const arg = (o) => JSON.stringify(o).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const pad = (n) => String(n).padStart(2, '0');
const ymdLocal = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

// ---------- sign-in ----------
export async function startConnect(dev, save) {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(12)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  dev.dbxPkce = { v: verifier, state };
  await save();
  location.href = AUTH_URL + '?' + new URLSearchParams({ client_id: APP_KEY, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', redirect_uri: redirectUri(), token_access_type: 'offline', state });
}
// Call with the ?code=…&state=… Dropbox sent back. Returns true when connected.
export async function finishConnect(dev, save, params, fetchFn = fetch) {
  if (params.has('error')) throw new Error('Dropbox not connected: ' + (params.get('error_description') || params.get('error')).replace(/\+/g, ' '));
  const pk = dev.dbxPkce;
  if (!pk || params.get('state') !== pk.state) throw new Error("That Dropbox sign-in didn't match. Tap Connect Dropbox again.");
  const r = await fetchFn(TOKEN_URL, { method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', code: params.get('code'), client_id: APP_KEY, code_verifier: pk.v, redirect_uri: redirectUri() }) });
  const j = await r.json().catch(() => ({}));
  dev.dbxPkce = null;
  if (!r.ok || !j.refresh_token) { await save(); throw new Error('Dropbox sign-in failed: ' + (j.error_description || j.error || 'HTTP ' + r.status)); }
  dev.dbx = { refresh: j.refresh_token, access: j.access_token, expires: Date.now() + (j.expires_in || 14400) * 1000, rev: null, sentUpdatedAt: 0, lastSync: null, lastSnapDay: null, error: null };
  await save();
  return true;
}

// ---------- API client ----------
export function client(dev, save, fetchFn = (...a) => fetch(...a)) {
  async function token() {
    const d = dev.dbx;
    if (!d || !d.refresh) throw new Error('Dropbox is not connected');
    if (d.access && d.expires > Date.now() + 60000) return d.access;
    const r = await fetchFn(TOKEN_URL, { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: d.refresh, client_id: APP_KEY }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (j.error === 'invalid_grant') { dev.dbx = null; await save(); throw new Error('Dropbox access was removed or has expired. Connect Dropbox again.'); }
      throw new Error('Dropbox: ' + (j.error_description || j.error || 'HTTP ' + r.status));
    }
    d.access = j.access_token; d.expires = Date.now() + (j.expires_in || 14400) * 1000; await save();
    return d.access;
  }
  async function call(url, opt = {}, retry = true) {
    const tok = await token();
    const r = await fetchFn(url, { method: 'POST', ...opt, headers: { ...(opt.headers || {}), Authorization: 'Bearer ' + tok } });
    if (r.status === 401 && retry) { dev.dbx.access = null; return call(url, opt, false); }
    if (r.status === 429 && retry) { await new Promise((ok) => setTimeout(ok, 3000)); return call(url, opt, false); }
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      let s = t; try { s = JSON.parse(t).error_summary || t; } catch {}
      throw new DbxErr('Dropbox ' + r.status + ': ' + String(s).slice(0, 120), r.status, String(s));
    }
    return r;
  }
  async function api(ep, a) {
    const r = await call('https://api.dropboxapi.com/2/' + ep, a === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a) });
    const t = await r.text(); return t ? JSON.parse(t) : null;
  }
  return {
    api,
    account: () => api('users/get_current_account', null),
    meta: async (path) => { try { return await api('files/get_metadata', { path }); } catch (e) { if (notFound(e)) return null; throw e; } },
    upload: async (path, text, mode = 'overwrite') => {
      const r = await call('https://content.dropboxapi.com/2/files/upload', { headers: { 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': arg({ path, mode, autorename: false, mute: true }) }, body: text });
      return r.json();
    },
    download: async (path) => { const r = await call('https://content.dropboxapi.com/2/files/download', { headers: { 'Dropbox-API-Arg': arg({ path }) } }); return r.text(); },
    list: async (path) => {
      try {
        let j = await api('files/list_folder', { path }), out = j.entries;
        while (j.has_more) { j = await api('files/list_folder/continue', { cursor: j.cursor }); out = out.concat(j.entries); }
        return out;
      } catch (e) { if (notFound(e)) return []; throw e; }
    },
    remove: (path) => api('files/delete_v2', { path }),
  };
}

// The GitHub connection (repo + access key) rides along in the Dropbox copy, locked
// with the same passphrase, so getting your bills back from Dropbox reconnects GitHub too.
// It is never put in the bills themselves, so it never goes to GitHub or the other phone.
async function linkEnv(dev, salt) {
  if (!dev.github || !dev.github.token) return null;
  return lock({ github: { owner: dev.github.owner, repo: dev.github.repo, token: dev.github.token } }, dev.passphrase, salt);
}
const linkId = (dev) => (dev.github && dev.github.token ? dev.github.owner + '/' + dev.github.repo + '/' + dev.github.token.slice(-6) : '');
const fileText = (env, link) => JSON.stringify({ ...env, ...(link ? { link } : {}), kind: 'bills-backup', savedAt: new Date().toISOString() });
// Read the GitHub connection back out of a Dropbox file (null if there isn't one).
export async function readLink(fileEnv, passphrase) {
  if (!fileEnv || !fileEnv.link) return null;
  try { const j = await unlock(fileEnv.link, passphrase); return j && j.github && j.github.token ? j.github : null; } catch { return null; }
}

// Is there a copy in Dropbox, and does this passphrase open it?
export async function peek(cl, passphrase) {
  const rm = await cl.meta(LIVE);
  if (!rm) return { exists: false };
  if (passphrase === undefined) return { exists: true };
  const doc = await unlock(JSON.parse(await cl.download(LIVE)), passphrase);
  return { exists: true, doc };
}

// Merge this phone's bills with Dropbox's copy and save the result there.
// Same rule as GitHub: where both changed the same thing, the newer change wins.
export async function syncDoc(doc, dev, save, cl) {
  if (!dev.passphrase) throw new Error('Enter the family passphrase first');
  const d = dev.dbx;
  for (let attempt = 0; attempt < 4; attempt++) {
    const rm = await cl.meta(LIVE);
    let merged = doc, salt = d.salt || dev.salt || null;
    if (rm) {
      if (rm.rev === d.rev && (doc.updatedAt || 0) <= (d.sentUpdatedAt || 0) && (d.linkId || '') === linkId(dev)) {
        d.lastSync = Date.now(); d.error = null; await save();
        return { doc, status: 'in-sync' };
      }
      const env = JSON.parse(await cl.download(LIVE));
      salt = env.salt;
      const theirs = await unlock(env, dev.passphrase);
      merged = mergeDocs(theirs, doc);
      if (canon(theirs) === canon(merged) && (d.linkId || '') === linkId(dev)) {
        Object.assign(d, { rev: rm.rev, salt, sentUpdatedAt: merged.updatedAt || 0, lastSync: Date.now(), error: null }); await save();
        return { doc: merged, status: 'in-sync' };
      }
    }
    if (!salt) salt = newSalt();
    const env = await lock(merged, dev.passphrase, salt);
    try {
      const res = await cl.upload(LIVE, fileText(env, await linkEnv(dev, salt)), rm ? { '.tag': 'update', update: rm.rev } : { '.tag': 'add' });
      Object.assign(d, { rev: res.rev, salt, sentUpdatedAt: merged.updatedAt || 0, lastSync: Date.now(), error: null, linkId: linkId(dev) }); await save();
      return { doc: merged, status: 'pushed' };
    } catch (e) { if (isConflict(e)) continue; throw e; } // the other phone saved at the same moment: merge again
  }
  throw new Error('Dropbox kept changing while saving — try again in a minute.');
}

// ---------- snapshots ----------
export function snapName(kind, when = new Date()) {
  return SNAP_DIR + '/bills-' + ymdLocal(when) + (kind ? '-' + pad(when.getHours()) + pad(when.getMinutes()) + '-' + kind : '') + '.enc.json';
}
export function snapDate(name) { const m = /bills-(\d{4}-\d{2}-\d{2})/.exec(name); return m ? m[1] : null; }
export async function snapshot(doc, dev, save, cl, kind = '') {
  const env = await lock(doc, dev.passphrase, dev.dbx.salt || dev.salt || undefined);
  await cl.upload(snapName(kind), fileText(env, await linkEnv(dev, dev.dbx.salt || dev.salt || undefined)), 'overwrite');
  if (!kind) { dev.dbx.lastSnapDay = ymdLocal(); await save(); }
  await prune(cl).catch(() => {});
}
export async function maybeSnapshot(doc, dev, save, cl) {
  if (dev.dbx.lastSnapDay === ymdLocal()) return false;
  await snapshot(doc, dev, save, cl);
  return true;
}
export async function prune(cl, now = new Date()) {
  const cutoff = ymdLocal(new Date(now.getTime() - KEEP_DAYS * 86400000));
  let n = 0;
  for (const e of await cl.list(SNAP_DIR)) { const d = snapDate(e.name); if (e['.tag'] === 'file' && d && d < cutoff) { await cl.remove(e.path_lower || e.path_display); n++; } }
  return n;
}
export async function listSnapshots(cl) {
  return (await cl.list(SNAP_DIR)).filter((e) => e['.tag'] === 'file' && snapDate(e.name))
    .map((e) => ({ name: e.name, path: e.path_lower || e.path_display, when: e.server_modified || e.client_modified, size: e.size }))
    .sort((a, b) => (a.name < b.name ? 1 : -1));
}
export async function readSnapshot(cl, path, passphrase) { return unlock(JSON.parse(await cl.download(path)), passphrase); }
