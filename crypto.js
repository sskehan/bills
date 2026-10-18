// Locking and unlocking the shared copy. Everything that goes to GitHub is
// encrypted on the phone with AES-256-GCM. The key comes from the family
// passphrase via PBKDF2-SHA256 (310,000 rounds). Works in the browser and Node.

const ITER = 310000;
const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;

export function b64(bytes) {
  let s = '';
  const u = new Uint8Array(bytes);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(str) {
  const s = atob(str);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
export function randomBytes(n) { return globalThis.crypto.getRandomValues(new Uint8Array(n)); }
export function newSalt() { return b64(randomBytes(16)); }

const keyCache = new Map();
export async function deriveKey(passphrase, saltB64, iter = ITER) {
  const id = saltB64 + '|' + iter + '|' + passphrase;
  if (keyCache.has(id)) return keyCache.get(id);
  const base = await subtle().importKey('raw', enc.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  keyCache.set(id, key);
  return key;
}

// Returns a small JSON-able envelope: { v, alg, kdf, iter, salt, iv, ct }
export async function lock(obj, passphrase, saltB64) {
  const salt = saltB64 || newSalt();
  const key = await deriveKey(passphrase, salt);
  const iv = randomBytes(12);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { v: 1, alg: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iter: ITER, salt, iv: b64(iv), ct: b64(ct) };
}
export async function unlock(env, passphrase) {
  if (!env || env.v !== 1 || !env.salt || !env.iv || !env.ct) throw new Error('Not a Bills backup file');
  const key = await deriveKey(passphrase, env.salt, env.iter || ITER);
  let plain;
  try { plain = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, key, unb64(env.ct)); }
  catch (e) { throw new Error('Wrong passphrase, or the file is damaged'); }
  return JSON.parse(dec.decode(plain));
}

// Setup code for joining another phone: the GitHub details are themselves
// locked with the passphrase, so the code is useless on its own.
export async function makeSetupCode(details, passphrase) {
  const env = await lock(details, passphrase);
  return 'BILLS1.' + btoa(JSON.stringify(env));
}
export async function readSetupCode(code, passphrase) {
  const c = (code || '').trim();
  if (!c.startsWith('BILLS1.')) throw new Error("That doesn't look like a Bills setup code");
  return unlock(JSON.parse(atob(c.slice(7))), passphrase);
}
