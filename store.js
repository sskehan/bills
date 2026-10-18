// Saving on the phone (IndexedDB) and syncing the locked copy with GitHub.
import { mergeDocs, uid } from './core.js';
import { lock, unlock, newSalt } from './crypto.js';

// ---------- IndexedDB (kept separate from your other apps on the same site) ----------
const DB = 'bills-app', STORE = 'kv';
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function kvGet(key) {
  const db = await openDB();
  return new Promise((res, rej) => { const t = db.transaction(STORE).objectStore(STORE).get(key); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); });
}
export async function kvSet(key, val) {
  const db = await openDB();
  return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(val, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}
export async function kvDel(key) {
  const db = await openDB();
  return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}

// ---------- the document ----------
export function emptyDoc() {
  const now = Date.now();
  return {
    schema: 1, app: 'bills', updatedAt: now, trackedFrom: null,
    settings: { u: now, timezone: 'Australia/Sydney', payday: { base: null }, appUrl: location.origin + location.pathname,
      reminders: { time: '07:00', eveningTime: '18:00', digestDays: 3, lumpDays: [14], reviewDays: 45, weekly: true, transferCheck: true },
      ntfy: { server: 'https://ntfy.sh', topic: '' }, payCheckPending: [] },
    accounts: [], types: [
      { id: 't_household', name: 'Household', color: '#2a78d6', order: 1, u: now },
      { id: 't_vehicle', name: 'Vehicle', color: '#eb6834', order: 2, u: now },
      { id: 't_insurance', name: 'Insurance', color: '#1baf7a', order: 3, u: now },
      { id: 't_children', name: 'Children', color: '#eda100', order: 4, u: now },
      { id: 't_work', name: 'Work', color: '#e87ba4', order: 5, u: now },
      { id: 't_home', name: 'Home loan', color: '#008300', order: 6, u: now },
      { id: 't_invest', name: 'Investment property', color: '#6250d6', order: 8, u: now }],
    properties: [], bills: [], payments: [], people: [], others: [], payOverrides: [], transferChecks: {}, activity: [],
  };
}
// Starting point for a phone that's joining: nothing of its own, so the family copy wins.
export function joinDoc() { const d = emptyDoc(); d.types = []; d.settings.u = 0; d.updatedAt = 0; return d; }
export function looksLikeDoc(d) { return d && d.app === 'bills' && Array.isArray(d.bills) && d.settings; }

export async function loadLocal() { return (await kvGet('doc')) || null; }
export async function saveLocal(doc) { await kvSet('doc', doc); }
export async function loadDevice() { return (await kvGet('device')) || { name: '', passphrase: '', github: null, lastSync: null, salt: null }; }
export async function saveDevice(dev) { await kvSet('device', dev); }

// ---------- GitHub ----------
const API = 'https://api.github.com';
function ghHeaders(token) { return { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }; }
function utf8b64(str) { return btoa(unescape(encodeURIComponent(str))); }
function b64utf8(b) { return decodeURIComponent(escape(atob(b.replace(/\n/g, '')))); }

export async function ghCheck(gh) {
  const r = await fetch(`${API}/repos/${gh.owner}/${gh.repo}`, { headers: ghHeaders(gh.token) });
  if (r.status === 401) throw new Error('GitHub refused the access key — check it was copied in full and hasn’t expired.');
  if (r.status === 404) throw new Error('Repo not found — check the name, and that the key has access to it.');
  if (!r.ok) throw new Error('GitHub said ' + r.status);
  const j = await r.json();
  if (!j.private) throw new Error('That repo is public. The data repo must be private.');
  if (j.permissions && !j.permissions.push) throw new Error('The key can read but not write — give it Contents: Read and write.');
  return j;
}
export async function ghGetFile(gh, path, ref) {
  const r = await fetch(`${API}/repos/${gh.owner}/${gh.repo}/contents/${path}${ref ? '?ref=' + ref : ''}`, { headers: ghHeaders(gh.token), cache: 'no-store' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('Could not read from GitHub (' + r.status + ')');
  const j = await r.json();
  return { sha: j.sha, text: b64utf8(j.content) };
}
export async function ghPutFile(gh, path, text, sha, message) {
  const r = await fetch(`${API}/repos/${gh.owner}/${gh.repo}/contents/${path}`, {
    method: 'PUT', headers: { ...ghHeaders(gh.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: utf8b64(text), ...(sha ? { sha } : {}) }),
  });
  if (r.status === 409 || r.status === 422) return { conflict: true };
  if (!r.ok) throw new Error('Could not save to GitHub (' + r.status + ')');
  const j = await r.json();
  return { sha: j.content.sha, commit: j.commit.sha };
}
export async function ghHistory(gh, path, n = 40) {
  const r = await fetch(`${API}/repos/${gh.owner}/${gh.repo}/commits?path=${path}&per_page=${n}`, { headers: ghHeaders(gh.token), cache: 'no-store' });
  if (!r.ok) throw new Error('Could not load backup history (' + r.status + ')');
  return (await r.json()).map((c) => ({ sha: c.sha, date: c.commit.committer.date, message: c.commit.message }));
}

const DATA = 'data.enc.json';
// Same content in any key order → same text, so unchanged data isn't re-saved.
export function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
// Pull, merge, push. Returns the merged document. Safe to call often.
export async function sync(doc, dev, note = 'Update') {
  if (!dev.github || !dev.passphrase) return { doc, status: 'off' };
  const gh = dev.github;
  for (let attempt = 0; attempt < 4; attempt++) {
    const remote = await ghGetFile(gh, DATA);
    let merged = doc, salt = dev.salt;
    if (remote) {
      const env = JSON.parse(remote.text);
      salt = env.salt;
      const theirs = await unlock(env, dev.passphrase);
      merged = mergeDocs(theirs, doc);
      if (canon(theirs) === canon(merged)) {
        dev.salt = salt; dev.lastSync = Date.now(); dev.sha = remote.sha;
        return { doc: merged, status: 'in-sync' };
      }
    }
    if (!salt) salt = newSalt();
    const env = await lock(merged, dev.passphrase, salt);
    const put = await ghPutFile(gh, DATA, JSON.stringify(env), remote && remote.sha, note + ' (' + (dev.name || 'phone') + ')');
    if (put.conflict) continue; // someone saved at the same moment — merge again
    dev.salt = salt; dev.lastSync = Date.now(); dev.sha = put.sha;
    return { doc: merged, status: 'pushed' };
  }
  throw new Error('GitHub kept changing while saving — try again in a minute.');
}
export async function loadVersion(dev, sha) {
  const f = await ghGetFile(dev.github, DATA, sha);
  if (!f) throw new Error('That version could not be found');
  return unlock(JSON.parse(f.text), dev.passphrase);
}
export async function lockedBackupFile(doc, dev) {
  const env = await lock(doc, dev.passphrase, dev.salt || undefined);
  return JSON.stringify({ ...env, kind: 'bills-backup', savedAt: new Date().toISOString() });
}
export async function readBackupFile(text, passphrase) {
  const j = JSON.parse(text);
  if (looksLikeDoc(j)) return j; // plain import file
  return unlock(j, passphrase);
}
export function stamp(obj, who) { obj.u = Date.now(); if (who) obj.by = who; return obj; }
export function newId(p) { return uid(p); }
