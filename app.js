// Bills — the phone app. Screens are rebuilt from the saved data on every change.
import * as C from './core.js';
import * as St from './store.js';
import { makeSetupCode, readSetupCode, unlock } from './crypto.js';
import * as DB from './dropbox.js';

const APP_VERSION = '1.41';
import { h, raw, esc, icon, toast, openSheet, closeSheet, confirmSheet, download, pickFile, copyText } from './ui.js';

const PALETTE = [['#4C7A9A', 'Steel blue'], ['#B4643C', 'Copper'], ['#3E8C6D', 'Teal'], ['#BF9330', 'Ochre'], ['#94607F', 'Plum'], ['#5E7A3A', 'Olive'], ['#6559B8', 'Indigo'], ['#B5524A', 'Brick'], ['#8C9096', 'Grey']];
const S = { doc: null, dev: null, route: '', params: [], ui: { range: 7, open: {}, q: '', rKind: 'fy', rInv: false, rTable: false, rSel: null, calSel: null, calMonth: null }, sync: 'off', syncErr: '', dbx: 'off', dbxErr: '' };
const $app = () => document.getElementById('app');
const tz = () => (S.doc && S.doc.settings && S.doc.settings.timezone) || 'Australia/Sydney';
const today = () => C.todayISO(new Date(), tz());
const who = () => S.dev.name || 'Me';
const doc = () => S.doc;

// ---------- saving ----------
let syncTimer = null;
let rev = 0, syncing = false;
async function commit(text, fn) {
  rev++;
  fn(S.doc);
  S.doc.updatedAt = Date.now();
  if (text) { S.doc.activity = S.doc.activity || []; S.doc.activity.unshift({ id: C.uid('ac'), at: Date.now(), u: Date.now(), by: who(), text }); S.doc.activity = S.doc.activity.slice(0, 400); }
  await saveDoc(S.doc);
  render();
  queueSync();
  queueDbx();
}
function touch(o) { o.u = Date.now(); o.by = who(); return o; }
function queueSync(ms = 2500) { if (!S.dev.github) return; clearTimeout(syncTimer); syncTimer = setTimeout(doSync, ms); }
async function doSync(manual) {
  if (!S.dev.github || !S.dev.passphrase || !navigator.onLine) { if (manual && !navigator.onLine) toast('No internet — will sync when you\'re back online'); return; }
  if (syncing) { queueSync(1500); return; }
  syncing = true;
  S.sync = 'syncing'; renderStatusOnly();
  try {
    const before = St.canon(S.doc), startRev = rev;
    const r = await St.sync(S.doc, S.dev, 'Update');
    // Changes made while syncing win over the copy that was being synced.
    if (rev !== startRev) { S.doc = C.mergeDocs(r.doc, S.doc); queueSync(1000); } else S.doc = r.doc;
    await saveDoc(S.doc); await St.saveDevice(S.dev);
    S.sync = 'ok'; S.syncErr = '';
    if (St.canon(S.doc) !== before) { if (!editing()) render(); else renderStatusOnly(); queueDbx(1000); } else renderStatusOnly();
    if (manual) toast(r.status === 'pushed' ? 'Saved to GitHub' : 'Up to date');
  } catch (e) { S.sync = 'error'; S.syncErr = e.message; renderStatusOnly(); if (manual) toast(e.message, 5000); }
  finally { syncing = false; }
}
// ---------- Dropbox (an extra locked copy, plus daily snapshots) ----------
let dbxTimer = null, dbxBusy = false, dbxRetry = null;
const saveDev = () => St.saveDevice(S.dev);
const dbxClient = () => DB.client(S.dev, saveDev);
function queueDbx(ms = 4000) { if (!DB.isOn(S.dev) || !S.doc) return; clearTimeout(dbxTimer); dbxTimer = setTimeout(doDbx, ms); }
async function doDbx(manual) {
  if (!DB.isOn(S.dev) || !S.doc) return;
  if (!S.dev.passphrase) { S.dbx = 'error'; S.dbxErr = 'Enter the family passphrase (Sharing & backup) so the Dropbox copy can be locked.'; renderStatusOnly(); return; }
  if (!navigator.onLine) { if (manual) toast("You're offline — it will go to Dropbox when you're back online"); return; }
  if (dbxBusy) { queueDbx(1500); return; }
  dbxBusy = true; S.dbx = 'syncing'; renderStatusOnly();
  try {
    const cl = dbxClient(), before = St.canon(S.doc), startRev = rev;
    const r = await DB.syncDoc(S.doc, S.dev, saveDev, cl);
    if (rev !== startRev) { S.doc = C.mergeDocs(r.doc, S.doc); queueDbx(1000); } else S.doc = r.doc;
    await saveDoc(S.doc);
    S.dbx = 'ok'; S.dbxErr = '';
    if (St.canon(S.doc) !== before) { if (!editing()) render(); else renderStatusOnly(); queueSync(1000); } else renderStatusOnly();
    DB.maybeSnapshot(S.doc, S.dev, saveDev, cl).catch(() => {});
    if (manual) toast(r.status === 'pushed' ? 'Saved to Dropbox' : 'Dropbox is up to date');
  } catch (e) {
    S.dbx = 'error'; S.dbxErr = (!navigator.onLine || e instanceof TypeError) ? "Couldn't reach Dropbox — it will try again shortly." : e.message;
    if (S.dev.dbx) { S.dev.dbx.error = S.dbxErr; await saveDev(); }
    renderStatusOnly(); if (manual) toast(S.dbxErr, 5000);
    clearTimeout(dbxRetry); if (DB.isOn(S.dev)) dbxRetry = setTimeout(doDbx, 120000);
  } finally { dbxBusy = false; if (S.route === 'sync') render(); }
}
function dbxLine() {
  if (!DB.isOn(S.dev)) return 'Not connected';
  if (S.dbx === 'syncing') return 'Saving to Dropbox…';
  if (S.dbx === 'error') return 'Problem: ' + S.dbxErr;
  const last = S.dev.dbx.lastSync;
  return 'In Dropbox ✓' + (last ? ' · ' + new Date(last).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : '');
}
// Ask for the family passphrase. With a locked copy to test against, keeps asking until it opens it.
async function askPassphrase(env, why) {
  for (let i = 0; i < 3; i++) {
    const p = prompt(why || 'Family passphrase:');
    if (!p) return null;
    if (!env) return p;
    try { const d = await unlock(env, p); return { pass: p, doc: d }; } catch { toast("That passphrase didn't open it — try again", 3500); }
  }
  return null;
}
async function chooseNewPassphrase() {
  const a = prompt('Choose a family passphrase to lock the Dropbox copy (at least 12 characters — write it down):');
  if (!a) return null;
  if (a.length < 12) { toast('Use at least 12 characters'); return null; }
  if (prompt('Type the passphrase again:') !== a) { toast("The two passphrases don't match"); return null; }
  return a;
}
// After Dropbox sends the phone back here with ?code=…
async function dbxReturn(params) {
  history.replaceState(null, '', DB.redirectUri() + '#/sync');
  try {
    await DB.finishConnect(S.dev, saveDev, params);
    const cl = dbxClient();
    try { const a = await cl.account(); S.dev.dbx.email = a.email; await saveDev(); } catch {}
    const rm = await cl.meta(DB.LIVE);
    let remoteDoc = null;
    if (rm) {
      const env = JSON.parse(await cl.download(DB.LIVE));
      if (S.dev.passphrase) { try { remoteDoc = await unlock(env, S.dev.passphrase); } catch { S.dev.passphrase = ''; } }
      if (!remoteDoc) {
        const got = await askPassphrase(env, 'Family passphrase — to unlock your bills in Dropbox:');
        if (!got) { S.dev.dbx = null; await saveDev(); toast('Dropbox not connected — the passphrase is needed to open your bills', 5000); return; }
        S.dev.passphrase = got.pass; remoteDoc = got.doc;
      }
    } else if (!S.dev.passphrase) {
      const p = await chooseNewPassphrase();
      if (!p) { S.dev.dbx = null; await saveDev(); toast('Dropbox not connected', 4000); return; }
      S.dev.passphrase = p;
    }
    await saveDev();
    if (rm) await relinkGithub(JSON.parse(await cl.download(DB.LIVE)));
    if (!S.doc && !remoteDoc) { toast('Dropbox is connected, but there are no bills in it yet', 5000); render(); return; }
    const wasEmpty = !S.doc;
    S.doc = S.doc || St.joinDoc();
    await doDbx();
    if (wasEmpty) { await askName(); toast('Your bills are back — ' + C.liveBills(S.doc).length + ' bills from Dropbox', 5000); location.hash = '#/'; }
    else toast('Dropbox connected — your bills are backed up there too', 4000);
    queueSync(500);
  } catch (e) { toast(e.message, 6000); }
  render();
}
// GitHub connection lost (e.g. Chrome cleared) but Dropbox has it: put it back.
async function relinkGithub(fileEnv) {
  if (S.dev.github || !S.dev.passphrase) return false;
  try {
    if (!fileEnv) { const cl = dbxClient(); if (!(await cl.meta(DB.LIVE))) return false; fileEnv = JSON.parse(await cl.download(DB.LIVE)); }
    const gh = await DB.readLink(fileEnv, S.dev.passphrase);
    if (!gh) return false;
    await St.ghCheck(gh);
    S.dev.github = gh; await saveDev(); S.sync = 'off';
    toast('GitHub reconnected — alerts and sharing are back on', 5000);
    doSync();
    return true;
  } catch (e) { return false; }
}
// Swap in an older copy (backup history or a Dropbox snapshot) on every phone.
async function replaceDoc(old, label) {
  old.updatedAt = Date.now();
  const bump = (o) => { if (o && typeof o === 'object') o.u = Date.now(); };
  const KEYS = ['accounts', 'types', 'properties', 'bills', 'payments', 'people', 'others', 'payOverrides'];
  KEYS.forEach((k) => (old[k] || []).forEach(bump));
  // anything added since that version is marked deleted so the merge doesn't bring it back
  KEYS.forEach((k) => { old[k] = old[k] || []; const ids = new Set(old[k].map((x) => x.id)); for (const x of (S.doc && S.doc[k]) || []) if (!ids.has(x.id)) old[k].push({ ...x, del: true, u: Date.now() }); });
  bump(old.settings);
  old.transferChecks = old.transferChecks || {};
  for (const k of Object.keys(old.transferChecks)) bump(old.transferChecks[k]);
  for (const k of Object.keys((S.doc && S.doc.transferChecks) || {})) if (!old.transferChecks[k]) old.transferChecks[k] = { undone: true, u: Date.now(), by: who() };
  S.doc = old;
  await commit(label, () => {});
  await doSync(true);
}

function renderStatusOnly() { const el = document.getElementById('syncdot'); if (el) el.outerHTML = syncDot().toString(); }
function syncDot() {
  if (!S.dev || !S.dev.github) return h`<span id="syncdot"></span>`;
  const map = { ok: ['#1B7048', 'Synced'], syncing: ['#B9822A', 'Syncing…'], error: ['#B3261E', 'Sync problem'], off: ['#8C9096', 'Not synced yet'] };
  const [c, t] = map[S.sync] || map.off;
  return h`<a id="syncdot" href="#/sync" class="xs muted row" style="gap:6px"><span class="dot" style="background:${c};border-radius:5px"></span>${t}</a>`;
}

// Any time stamp in the future (e.g. a phone with a wrong clock) is pulled back
// so it can't block later edits from winning a merge.
function clampStamps(d) {
  const now = Date.now() - 1000;
  const fix = (o) => { if (o && typeof o === 'object' && typeof o.u === 'number' && o.u > now) o.u = now; };
  ['accounts', 'types', 'properties', 'bills', 'payments', 'people', 'others', 'payOverrides', 'activity'].forEach((k) => (d[k] || []).forEach(fix));
  fix(d.settings); Object.values(d.transferChecks || {}).forEach(fix);
  if (d.updatedAt > now) d.updatedAt = now;
  return d;
}

// ---------- unsaved bill drafts (kept on this phone only, until saved or discarded) ----------
const DRAFTS = new Map();
const draftKey = (id) => 'bills-draft:' + (id || 'new');
const editing = () => S.route.split('/')[0] === 'edit';
function getDraft(id) {
  const k = draftKey(id);
  if (DRAFTS.has(k)) return DRAFTS.get(k);
  try { const j = localStorage.getItem(k); return j ? JSON.parse(j) : null; } catch { return null; }
}
function clearDraft(id) { const k = draftKey(id); DRAFTS.delete(k); try { localStorage.removeItem(k); } catch {} }
function saveDraft(form) {
  const vals = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'radio') { if (el.checked) vals[el.name] = el.value; }
    else if (el.type === 'checkbox') vals[el.name] = el.checked;
    else vals[el.name] = el.value;
  }
  const incl = form.querySelector('[name=includeInTotals]');
  const dr = { at: Date.now(), vals, inclAuto: incl ? incl.dataset.inclAuto : null };
  const k = draftKey(form.dataset.id);
  DRAFTS.set(k, dr);
  try { localStorage.setItem(k, JSON.stringify(dr)); } catch {}
}
function applyDraft(form, dr) {
  const v = dr.vals || {};
  for (const el of form.elements) {
    if (!el.name || !(el.name in v)) { if (el.type === 'radio' && el.name in v) el.checked = false; continue; }
    if (el.type === 'radio') el.checked = v[el.name] === el.value;
    else if (el.type === 'checkbox') el.checked = !!v[el.name];
    else el.value = v[el.name];
  }
  const incl = form.querySelector('[name=includeInTotals]');
  if (incl && dr.inclAuto) incl.dataset.inclAuto = dr.inclAuto;
  const amt = form.querySelector('[name=amount]'), af = document.getElementById('amtfrom');
  if (amt && af && amt.dataset.cur !== undefined) af.hidden = amt.value === '' || Number(amt.value) === Number(amt.dataset.cur);
}

// 1.41: bill-type colours move to the graphite & emerald palette (only colours still on the old defaults change).
// Runs on every copy that arrives (start, import, restore, join, sync), so the other phone's older copy follows too.
const OLD_TYPE_COLOURS = { '#2a78d6': '#4C7A9A', '#eb6834': '#B4643C', '#1baf7a': '#3E8C6D', '#eda100': '#BF9330', '#e87ba4': '#94607F', '#008300': '#5E7A3A', '#6250d6': '#6559B8', '#e34948': '#B5524A', '#8a948d': '#8C9096' };
function saveDoc(d) { recolourTypes(d); return St.saveLocal(d); }
function recolourTypes(d) {
  let n = 0;
  for (const ty of (d && d.types) || []) { const nc = OLD_TYPE_COLOURS[(ty.color || '').toLowerCase()]; if (nc) { ty.color = nc; ty.u = Date.now(); n++; } }
  if (n) d.updatedAt = Date.now();
  return n > 0;
}

// ---------- small builders ----------
const amt = (b, v) => (v === null || v === undefined ? h`<span class="muted">—</span>` : h`${C.isEstimate(b) ? '≈' : ''}${C.money(v)}`);
const dotFor = (b) => h`<span class="dot" style="background:${C.typeColor(doc(), b)}"></span>`;
function back(href, title, sub) {
  return h`<div class="top no-print"><a class="back" href="${href}" aria-label="Back">${icon('back')}</a><div class="grow"><h1 style="font-size:22px">${title}</h1>${sub ? h`<div class="xs muted">${sub}</div>` : ''}</div>${syncDot()}</div>`;
}
function head(title, extra) {
  return h`<div class="between"><div class="stack" style="gap:2px"><div class="small muted">${C.fmtLong(today())}</div><h1>${title}</h1></div><div class="row" style="gap:8px">${syncDot()}${extra || ''}</div></div>`;
}
function weekendNote(b, due) { return C.isWeekend(due) && b.payMethod !== 'manual' ? ' · may come out ' + C.fmtDate(C.nextWeekday(due)) : ''; }
function stateCell(i) {
  const b = i.bill;
  if (i.state === 'paid') return C.paymentFor(doc(), b.id, i.due) ? h`<button class="pill green" data-act="payedit" data-bill="${b.id}" data-due="${i.due}" style="border:0">Paid ✓</button>` : h`<span class="pill green">Paid ✓</span>`;
  if (i.state === 'scheduled') return h`<button class="pill blue" data-act="payedit" data-bill="${b.id}" data-due="${i.due}" style="border:0">Scheduled ${C.fmtDate(C.paymentFor(doc(), b.id, i.due).date, { dow: false })}</button>`;
  if (i.state === 'missed') return h`<span class="pill red">Didn’t come out</span>`;
  if (b.payMethod === 'manual') return h`<button class="tick ${''}" data-act="pay" data-bill="${b.id}" data-due="${i.due}" aria-label="Mark ${b.name} paid">${icon('check', 18, 2.4)}</button>`;
  if (b.payMethod === 'rent') return h`<span class="pill grey">From rent</span>`;
  return h`<span class="pill grey">Direct debit</span>`;
}
function billRow(i, opts = {}) {
  const b = i.bill;
  const acc = b.accountId ? C.accountName(doc(), b.accountId) : (b.payMethod === 'rent' ? 'Taken from rent' : '');
  const sub = opts.sub || [acc, b.freq].filter(Boolean).join(' · ') + weekendNote(b, i.due);
  return h`<div class="item ${C.settled(i.state) ? 'done' : ''}">${dotFor(b)}<a class="grow stack" style="gap:2px;color:inherit" href="#/bill/${b.id}"><span class="t">${b.name}</span><span class="s">${sub}</span></a><span class="stack" style="gap:4px;align-items:flex-end"><span class="amt">${amt(b, i.amount)}</span>${opts.noState ? '' : stateCell(i)}</span></div>`;
}
function relPill(n) {
  const cls = n < 0 ? 'red' : n <= 3 ? 'red' : n <= 7 ? 'amber' : 'blue';
  return h`<span class="pill ${cls}">${C.relDays(n)}</span>`;
}
function emptyCard(text) { return h`<div class="card"><div class="empty">${text}</div></div>`; }

// ---------- screens ----------
function scrUpcoming() {
  const d = doc(), t = today(), range = S.ui.range;
  if (!C.liveBills(d).length) return h`${head('Upcoming')}<div class="card pad stack"><h3>No bills yet</h3><div class="small muted">Import the file made from your spreadsheet, join Lyndsey's copy, or add bills by hand.</div><a class="btn" href="#/setup">Get started</a></div>`;
  const end = C.addDays(t, range);
  const all = C.schedule(d, t, end, t, (b) => b.status === 'active');
  const hh = all.filter((i) => C.inTotals(i.bill));
  const total = C.sumAmounts(hh);
  const nextPay = C.paydays(d.settings, t, C.addDays(t, 14))[0];
  const byAcc = new Map();
  for (const i of all) {
    if (i.state !== 'due' || i.bill.payMethod === 'rent' || !i.bill.accountId) continue;
    byAcc.set(i.bill.accountId, C.round2((byAcc.get(i.bill.accountId) || 0) + (i.amount || 0)));
  }
  const trs = C.transfers(d, t, C.addDays(t, 1), t);
  const manual = C.schedule(d, C.addDays(t, -60), C.addDays(t, 30), t, (b) => b.status === 'active' && b.payMethod === 'manual' && b.kind !== 'reminder').filter((i) => i.state === 'due' || i.state === 'overdue');
  const others = C.schedule(d, C.addDays(t, -60), C.addDays(t, 30), t, (b) => b.status === 'active' && b.kind === 'reminder').filter((i) => i.state === 'due' || i.state === 'overdue');
  const inv = all.filter((i) => i.group === 'investment');
  const fu = C.followUps(d, t);
  const days = new Map();
  for (const i of hh) { if (!days.has(i.due)) days.set(i.due, []); days.get(i.due).push(i); }
  const pending = (d.settings.payCheckPending || []).length;
  return h`
  ${head('Upcoming', h`<a class="icon-btn" href="#/reports" aria-label="Reports">${icon('chart')}</a><a class="icon-btn brand" href="#/edit/new" aria-label="Add a bill">${icon('plus')}</a>`)}
  ${!S.dev.github && d.settings.ntfy && d.settings.ntfy.topic ? h`<a class="banner red row" href="#/sync" style="color:inherit">${icon('warn', 20)}<span class="grow"><b>Not saving to GitHub.</b> Your 7 am alerts${S.dev.name === 'Shaun' ? ' and Lyndsey’s phone' : ''} are using old information. Tap to reconnect.</span>${icon('next', 18)}</a>` : S.dev.github && S.sync === 'error' ? h`<a class="banner red row" href="#/sync" style="color:inherit">${icon('warn', 20)}<span class="grow"><b>GitHub isn't accepting changes:</b> ${S.syncErr} Alerts are using old information until this is fixed.</span>${icon('next', 18)}</a>` : ''}
  ${!DB.isOn(S.dev) ? h`<a class="banner amber row" href="#/sync" style="color:inherit">${icon('warn', 20)}<span class="grow">Your bills aren't in Dropbox yet. <b>Connect Dropbox</b> so clearing Chrome can't lose them.</span>${icon('next', 18)}</a>` : S.dbx === 'error' ? h`<a class="banner red row" href="#/sync" style="color:inherit">${icon('warn', 20)}<span class="grow">Dropbox backup problem: ${S.dbxErr}</span>${icon('next', 18)}</a>` : ''}
  ${pending ? h`<a class="banner amber row" href="#/checkpay" style="color:inherit">${icon('warn', 20)}<span class="grow">Confirm how <b>${pending}</b> imported bills are paid (direct debit or you pay them).</span>${icon('next', 18)}</a>` : ''}
  <section class="hero" aria-label="Summary">
    <div class="seg" role="group" aria-label="Range"><button data-act="range" data-v="7" aria-pressed="${range === 7}">Next 7 days</button><button data-act="range" data-v="30" aria-pressed="${range === 30}">Next 30 days</button></div>
    <div class="stack" style="gap:2px"><div class="sub" style="color:#A7AEB4;font-size:13px">Household bills due in the next ${range} days</div><div class="big">${C.money(total)}</div>
    <div class="sub">${hh.length} payment${hh.length === 1 ? '' : 's'}${nextPay ? ' · next payday ' + C.fmtDate(nextPay) : ''}</div></div>
    ${byAcc.size ? h`<hr><div class="xs" style="font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#9AA2A8">Needed in each account (all bills)</div>
    ${[...byAcc.entries()].map(([id, v]) => h`<div class="between" style="font-size:15px"><span>${C.accountName(d, id)}</span><span class="mono">${C.money(v)}</span></div>`)}` : ''}
  </section>
  ${trs.map((tr) => h`<div class="card pad row">${raw('<span class="icon-btn" style="width:40px;height:40px;background:var(--brand-soft);color:var(--brand);border:0">')}${icon('swap', 18)}${raw('</span>')}
    <a class="grow stack" href="#/transfers" style="gap:2px;color:inherit"><b>${tr.date === t ? 'Today' : 'Tomorrow'}: savings → personal ${C.money(tr.total)}</b><span class="small muted">${tr.items.map((i) => i.bill.name).join(' · ')}${tr.check ? ' · ticked by ' + tr.check.by : ''}</span></a>
    <button class="tick ${tr.check ? 'on' : ''}" data-act="trtick" data-date="${tr.date}" aria-label="Transfer done">${icon('check', 18, 2.4)}</button></div>`)}
  ${manual.length ? h`<div class="card" style="border:1.5px solid var(--amber)"><div class="between" style="padding:14px 16px 6px"><span class="stack" style="gap:2px"><h3>You pay these yourself</h3><span class="xs muted">Not direct debit · alerts repeat until ticked</span></span></div>
    <div class="list">${manual.map((i) => billRow(i, { sub: (i.state === 'overdue' ? 'Overdue — was due ' : 'Due ') + C.fmtDate(i.due) + ' · ' + C.relDays(C.daysBetween(t, i.due)).toLowerCase() + (i.bill.bpay && i.bill.bpay.biller ? ' · BPAY ' + i.bill.bpay.biller : '') }))}</div></div>` : ''}
  ${others.length ? h`<div class="card dashed"><div style="padding:14px 16px 6px"><div class="eyebrow" style="padding:0">Reminder only · not in your totals</div></div>
    <div class="list">${others.map((i) => billRow(i, { sub: (byIdName(d.others, i.bill.forWhom) || 'Someone else') + ' · ' + (i.state === 'overdue' ? 'overdue — was due ' : 'due ') + C.fmtDate(i.due) }))}</div></div>` : ''}
  ${inv.length ? h`<div class="card inv"><div class="between" style="padding:14px 16px 6px"><span class="stack" style="gap:2px"><h3>Investment properties</h3><span class="xs" style="color:var(--inv-ink);font-weight:600">Not included in household totals · ${inv.length} payment${inv.length > 1 ? 's' : ''}</span></span><span class="mono">${C.money(C.sumAmounts(inv))}</span></div>
    <div class="list">${inv.map((i) => billRow(i, { sub: C.fmtDate(i.due) + ' · ' + (propName(i.bill) || 'Across the portfolio') }))}</div></div>` : ''}
  ${fu.length ? h`<div class="card"><div class="between" style="padding:14px 16px 8px"><h3>Needs attention</h3><a class="pill red" href="#/attention">${fu.length}</a></div><div class="list">
    ${fu.slice(0, 4).map((f) => h`<a class="item" href="#/bill/${f.bill.id}"><span class="pill ${f.p === 1 ? 'solid-red' : f.p === 2 ? 'amber' : 'grey'}">${f.p === 1 ? 'HIGH' : f.p === 2 ? 'MED' : 'LOW'}</span><span class="grow stack" style="gap:2px"><span class="t" style="font-weight:600">${f.bill.name}</span><span class="s">${f.text}</span></span>${icon('next', 18)}</a>`)}
    ${fu.length > 4 ? h`<a class="item" href="#/attention" style="justify-content:center;color:var(--brand);font-weight:600">See all ${fu.length}</a>` : ''}</div></div>` : ''}
  <div class="between" style="padding:4px 2px 0"><h2>By day</h2><span class="small muted">Direct debits tick themselves</span></div>
  ${days.size ? [...days.entries()].map(([dd, list]) => h`<div class="stack" style="gap:6px"><div class="between" style="padding:0 2px"><span class="row" style="gap:8px"><b style="font-size:15px">${C.fmtDate(dd)}</b>${relPill(C.daysBetween(t, dd))}</span><span class="mono small muted">${C.money(C.sumAmounts(list))}</span></div>
    <div class="card list">${list.map((i) => billRow(i))}</div></div>`) : emptyCard('Nothing due in this period.')}
  `;
}
function byIdName(list, id) { const x = C.byId(list, id); return x ? x.name : ''; }
function propName(b) { const p = C.byId(doc().properties, b.propertyId); return p ? p.name : ''; }

function scrAttention() {
  const fu = C.followUps(doc(), today());
  return h`${back('#/', 'Needs attention', fu.length + ' item' + (fu.length === 1 ? '' : 's') + ', highest first')}
  <div class="card list">${fu.length ? fu.map((f) => h`<a class="item" href="#/bill/${f.bill.id}"><span class="pill ${f.p === 1 ? 'solid-red' : f.p === 2 ? 'amber' : 'grey'}">${f.p === 1 ? 'HIGH' : f.p === 2 ? 'MED' : 'LOW'}</span><span class="grow stack" style="gap:2px"><span class="t" style="font-weight:600">${f.bill.name}</span><span class="s">${f.text}</span></span></a>`) : h`<div class="empty">All clear.</div>`}</div>`;
}

function scrCalendar() {
  const d = doc(), t = today();
  const month = S.ui.calMonth || t.slice(0, 8) + '01';
  const mEnd = C.addDays(C.addMonths(month, 1), -1);
  const items = C.schedule(d, month, mEnd, t, (b) => b.status !== 'pending');
  const hh = items.filter((i) => C.inTotals(i.bill));
  const perDay = new Map();
  for (const i of hh) perDay.set(i.due, (perDay.get(i.due) || 0) + (i.amount || 0));
  const pds = new Set(C.paydays(d.settings, month, mEnd));
  const sel = S.ui.calSel && S.ui.calSel >= month && S.ui.calSel <= mEnd ? S.ui.calSel : (t >= month && t <= mEnd ? t : month);
  const lead = (C.dow(month) + 6) % 7;
  const cells = [];
  for (let k = 0; k < lead; k++) cells.push(h`<span></span>`);
  for (let day = month; day <= mEnd; day = C.addDays(day, 1)) {
    const v = perDay.get(day) || 0;
    const lvl = v === 0 ? '' : v < 500 ? 'l1' : v <= 2000 ? 'l2' : 'l3';
    const short = v === 0 ? '' : v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'k' : '$' + Math.round(v);
    cells.push(h`<button class="${lvl} ${day === sel ? 'sel' : ''} ${day === t ? 'today' : ''}" data-act="calsel" data-d="${day}" aria-label="${C.fmtDate(day)} ${short}${pds.has(day) ? ', payday' : ''}"><span class="d">${Number(day.slice(8))}</span><span class="a">${short}</span>${pds.has(day) ? h`<span class="p">PAY</span>` : ''}</button>`);
  }
  const dayItems = items.filter((i) => i.due === sel);
  const excluded = items.filter((i) => !C.inTotals(i.bill));
  const exGroups = {};
  for (const i of excluded) { const g = i.group === 'investment' ? 'investment properties' : i.group === 'reminder' ? 'reminders for others' : 'not counted (e.g. kids’ savings)'; exGroups[g] = (exGroups[g] || 0) + (i.amount || 0); }
  const annual = C.liveBills(d).filter((b) => C.inTotals(b) && b.status === 'active').reduce((a, b) => a + C.annualAmount(b, t, d), 0);
  // pay fortnights overlapping this month
  const periods = C.paydays(d.settings, C.addDays(month, -13), mEnd).map((p) => {
    const e = C.addDays(p, 13);
    const bills = C.sumAmounts(C.schedule(d, p, e, t, (b) => C.inTotals(b) && b.status !== 'pending'));
    const pay = payIn(p);
    return { p, e, bills, pay };
  });
  const maxB = Math.max(1, ...periods.map((x) => x.bills));
  return h`${head('Calendar', h`<button class="icon-btn" data-act="calmonth" data-v="-1" aria-label="Previous month">${icon('back', 18)}</button><button class="icon-btn" data-act="calmonth" data-v="1" aria-label="Next month">${icon('next', 18)}</button>`)}
  <div class="card pad stack">
    <div class="between"><h2>${C.monthName(Number(month.slice(5, 7)) - 1)} ${month.slice(0, 4)}</h2><span class="mono" style="font-weight:600">${C.money(C.sumAmounts(hh))}</span></div>
    <div class="between small muted"><span>${hh.length} household payments</span><span>Average month ${C.money(annual / 12)}</span></div>
    ${Object.keys(exGroups).length ? h`<div class="xs" style="color:var(--inv-ink)">Not included: ${Object.entries(exGroups).map(([k, v]) => k + ' ' + C.money(v)).join(' · ')}</div>` : ''}
    <div class="cal" style="margin-top:6px">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x) => h`<span class="h">${x}</span>`)}${cells}</div>
    <div class="row wrap xs muted" style="gap:6px 14px"><span class="row" style="gap:6px"><span class="dot" style="background:#E3F2EC"></span>Under $500</span><span class="row" style="gap:6px"><span class="dot" style="background:#A9D9C5"></span>$500–$2,000</span><span class="row" style="gap:6px"><span class="dot" style="background:#6DB597"></span>Over $2,000</span><span><b style="color:var(--brand)">PAY</b> payday</span></div>
  </div>
  <div class="stack" style="gap:6px"><div class="between" style="padding:0 2px"><h3>${C.fmtDate(sel)}${pds.has(sel) ? ' · payday' : ''}</h3><span class="mono small muted">${dayItems.length ? C.money(C.sumAmounts(dayItems.filter((i) => C.inTotals(i.bill)))) : ''}</span></div>
    <div class="card list">${dayItems.length ? dayItems.map((i) => billRow(i, { sub: [i.group === 'investment' ? 'Investment · not in totals' : i.group === 'reminder' ? 'Reminder only' : i.group === 'excluded' ? 'Not counted' : C.accountName(d, i.bill.accountId), i.bill.freq].join(' · ') })) : h`<div class="empty">No bills due this day.</div>`}</div></div>
  ${periods.length ? h`<div class="card pad stack" style="gap:14px"><div class="stack" style="gap:2px"><h3>Between paydays</h3><span class="small muted">Household bills each fortnight's pay has to cover</span></div>
    ${periods.map((x) => h`<div class="stack" style="gap:6px"><div class="between small"><b style="font-weight:500">Pay ${C.fmtDate(x.p)} → ${C.fmtDate(x.e)}</b><span class="mono" style="font-weight:600">${C.money(x.bills)}</span></div>
    <div class="bar"><span style="width:${(x.bills / maxB * 100).toFixed(0)}%;background:#2F5D86"></span></div>
    ${x.pay !== null ? h`<div class="xs ${x.pay - x.bills < 0 ? '' : 'muted'}" style="${x.pay - x.bills < 0 ? 'color:var(--red-ink)' : ''}">Pay in ${C.money(x.pay)} · left over ${C.money(x.pay - x.bills)}</div>` : h`<div class="xs muted">Add your pays on the Pay screen to see what's left over.</div>`}</div>`)}</div>` : h`<a class="card pad small" href="#/pay">Set your payday to see the fortnights →</a>`}`;
}
function payIn(payday) {
  const d = doc();
  let total = 0, any = false;
  for (const p of (d.people || []).filter((x) => !x.del)) { const v = C.takeHomeFor(d, p.id, payday); if (v !== null) { total += v; any = true; } }
  return any ? C.round2(total) : null;
}

function scrBills() {
  const d = doc(), t = today(), q = (S.ui.q || '').toLowerCase().trim();
  const match = (b) => !q || [b.name, b.provider, b.notes, C.accountName(d, b.accountId)].join(' ').toLowerCase().includes(q);
  const live = C.liveBills(d).filter(match);
  const active = live.filter((b) => b.status === 'active');
  const annual = C.round2(C.liveBills(d).filter((b) => C.inTotals(b) && b.status === 'active').reduce((a, b) => a + C.annualAmount(b, t, d), 0));
  const types = (d.types || []).filter((x) => !x.del).sort((a, b) => (a.order || 0) - (b.order || 0));
  const sections = [];
  const groupCard = (key, title, color, list, sub, cls = '') => {
    if (!list.length) return '';
    const open = q || S.ui.open[key];
    const ann = C.round2(list.filter((b) => b.status === 'active').reduce((a, b) => a + C.annualAmount(b, t, d), 0));
    return h`<div class="card ${cls}" style="overflow:hidden"><button class="item" data-act="toggle" data-k="${key}" aria-expanded="${!!open}" style="min-height:58px">${color ? h`<span class="dot lg" style="background:${color}"></span>` : ''}<span class="grow stack" style="gap:2px"><span style="font-size:16px;font-weight:600">${title}</span><span class="s">${sub || list.length + ' bill' + (list.length > 1 ? 's' : '') + ' · ' + C.money(ann / 12, 0) + ' a month'}</span></span><span class="mono small">${C.money(ann, 0)}/yr</span>${icon(open ? 'up' : 'down', 18)}</button>
    ${open ? h`<div class="list" style="border-top:1px solid var(--line2)">${list.map((b) => registerRow(b))}</div>` : ''}</div>`;
  };
  const oneOffs = active.filter((b) => C.isOneOff(b));
  const oneOffDone = oneOffs.filter((b) => C.oneOffDone(d, b, t)), oneOffOpen = oneOffs.filter((b) => !C.oneOffDone(d, b, t));
  const hhCounted = active.filter((b) => C.inTotals(b) && !C.isOneOff(b));
  for (const ty of types) {
    const list = hhCounted.filter((b) => b.typeId === ty.id);
    sections.push(groupCard('t:' + ty.id, ty.name, ty.color, list));
  }
  const untyped = hhCounted.filter((b) => !C.byId(d.types, b.typeId));
  sections.push(groupCard('t:none', 'No type', '#8C9096', untyped));
  const notCounted = active.filter((b) => b.kind === 'household' && !C.inTotals(b) && !C.isOneOff(b));
  const invest = active.filter((b) => b.kind === 'investment' && !C.inTotals(b) && !C.isOneOff(b));
  const props = (d.properties || []).filter((p) => !p.del);
  const reminders = active.filter((b) => b.kind === 'reminder' && !C.isOneOff(b));
  const pending = live.filter((b) => b.status === 'pending');
  const stopped = live.filter((b) => b.status === 'stopped');
  const pc = (d.settings.payCheckPending || []).length;
  return h`${head('All bills', h`<a class="icon-btn brand" href="#/edit/new" aria-label="Add a bill">${icon('plus')}</a>`)}
  <label class="card row" style="padding:0 14px;min-height:48px">${icon('search', 18)}<span class="sr">Search bills</span><input id="q" type="search" value="${S.ui.q}" placeholder="Search name, provider or account" style="border:0;outline:0;flex:1;min-width:0;background:transparent;font-size:16px;min-height:46px" data-input="q"></label>
  ${pc ? h`<a class="banner amber" href="#/checkpay" style="color:inherit">Confirm how ${pc} bills are paid →</a>` : ''}
  <div class="grid3"><div class="tile"><span class="k">A year</span><span class="v" style="font-size:15px">${C.money(annual, 0)}</span></div><div class="tile"><span class="k">A month</span><span class="v" style="font-size:15px">${C.money(annual / 12, 0)}</span></div><div class="tile"><span class="k">Per payday</span><span class="v" style="font-size:15px">${C.money(annual / 26, 0)}</span></div></div>
  <div class="eyebrow">Household bills · ${hhCounted.length} counted in totals</div>
  ${sections}
  ${notCounted.length ? h`<div class="eyebrow">Not counted in totals</div>${groupCard('nc', 'Not counted', '#8C9096', notCounted, notCounted.length + ' · still reminded and shown, left out of totals')}` : ''}
  ${invest.length || props.length ? h`<div class="stack" style="gap:4px;padding:8px 2px 0"><div class="eyebrow" style="color:var(--inv-ink);padding:0">Investment properties</div><div class="small" style="color:#4E4A6E">Still reminded, but <b>not included in any household totals</b>.</div><a href="#/properties" class="small" style="font-weight:600;color:var(--inv-ink);padding:4px 0">Rent, costs & net per property →</a></div>
    ${props.map((p) => groupCard('p:' + p.id, p.name, '#6559B8', invest.filter((b) => b.propertyId === p.id), null, 'inv'))}
    ${groupCard('p:none', 'Across the portfolio', '#6559B8', invest.filter((b) => !C.byId(d.properties, b.propertyId)), null, 'inv')}` : ''}
  ${reminders.length ? h`<div class="eyebrow">Reminders only · paying for others</div>${(d.others || []).filter((o) => !o.del).map((o) => groupCard('o:' + o.id, o.name, '#8C9096', reminders.filter((b) => b.forWhom === o.id), null, 'dashed'))}${groupCard('o:none', 'Others', '#8C9096', reminders.filter((b) => !C.byId(d.others, b.forWhom)), null, 'dashed')}` : ''}
  ${oneOffOpen.length ? h`<div class="eyebrow">One-off bills</div>${groupCard('oo', 'One-off bills — coming up', '#8C9096', oneOffOpen, oneOffOpen.length + ' · paid once, not in the yearly figures above')}` : ''}
  ${oneOffDone.length ? h`${!oneOffOpen.length ? h`<div class="eyebrow">One-off bills</div>` : ''}${groupCard('ood', 'One-off bills — done', '#8C9096', oneOffDone, oneOffDone.length + ' · paid · kept for reports', 'dashed')}` : ''}
  ${pending.length ? h`<div class="eyebrow">Not started yet</div>${groupCard('pending', 'Waiting for details', '#8C9096', pending, pending.length + ' · no reminders until you add the details')}` : ''}
  ${stopped.length ? h`<div class="eyebrow">Stopped</div>${groupCard('stopped', 'Stopped bills', '#8C9096', stopped, stopped.length + ' · history kept · restore any time')}` : h`<div class="card dashed pad between"><span class="stack" style="gap:2px"><b>Stopped bills</b><span class="small muted">Cancelled or switched bills keep their history here.</span></span><span class="mono muted">0</span></div>`}`;
}
function registerRow(b) {
  const d = doc(), t = today();
  const nd = C.nextDue(b, t);
  const a = nd ? C.amountOn(b, nd, d) : C.baseAmountOn(b, t);
  const missing = b.status === 'active' && (a === null || !nd);
  const sub = b.status === 'pending' ? (b.notes || 'Not started yet') : a === null ? 'Amount not set' : (C.isEstimate(b) ? '≈' : '') + C.money(a) + ' · ' + (b.freq || '—') + (b.status === 'stopped' ? ' · stopped ' + C.fmtDate(b.stoppedAt, { year: true }) : '');
  return h`<a class="item" href="#/bill/${b.id}"><span class="grow stack" style="gap:2px"><span class="t">${b.name}</span><span class="s">${sub}</span></span>
  ${C.oneOffDone(d, b, t) ? h`<span class="pill green">Paid</span>` : C.isOneOff(b) && !nd && b.status === 'active' ? h`<span class="pill red">Not paid</span>` : missing && !C.isOneOff(b) ? h`<span class="pill amber">Needs details</span>` : nd && b.status === 'active' ? h`<span class="stack" style="gap:2px;align-items:flex-end"><span class="xs muted">Next</span><span class="small" style="font-weight:500">${C.fmtDate(nd, { dow: false, today: t })}</span></span>` : ''}</a>`;
}

function scrReviews() {
  const d = doc(), t = today();
  const list = C.liveBills(d).filter((b) => b.status !== 'stopped' && b.review && b.review.applicable).map((b) => ({ b, r: C.reviewInfo(b, t), nd: C.nextDue(b, t) }));
  const count = (s) => list.filter((x) => x.r.status === s).length;
  const up = count('ok'), soon = count('soon'), over = count('overdue'), never = count('never'), fut = count('future');
  list.sort((a, b) => ((a.r.next || '0') < (b.r.next || '0') ? -1 : 1));
  const na = C.liveBills(d).filter((b) => b.status !== 'stopped' && !(b.review && b.review.applicable)).length;
  const pctUp = list.length ? up / list.length * 100 : 0, pctSoon = list.length ? soon / list.length * 100 : 0;
  return h`${head('Reviews')}
  <div class="small" style="color:var(--ink2);line-height:1.45;margin-top:-8px">Once a year, check each reviewable bill is still the best deal. Tick it here when you have.</div>
  <div class="card pad stack" style="gap:14px"><div class="row" style="gap:8px;align-items:baseline"><span class="mono" style="font-size:34px;font-weight:600">${up + soon}</span><span class="muted">of ${list.length} reviewed in the last 12 months</span></div>
    <div class="bar" style="height:12px;display:flex"><span style="width:${pctUp}%;background:#1B7048;border-radius:0;height:12px"></span><span style="width:${pctSoon}%;background:#B9822A;border-radius:0;height:12px"></span></div>
    <div class="grid2"><div class="tile" style="background:var(--green-soft);border:0"><span class="k" style="color:var(--green-ink);font-weight:600">Up to date</span><span class="v">${up}</span></div><div class="tile" style="background:var(--amber-soft);border:0"><span class="k" style="color:var(--amber-ink);font-weight:600">Due soon (≤ 30 days)</span><span class="v">${soon}</span></div>
    <div class="tile" style="background:var(--red-soft);border:0"><span class="k" style="color:var(--red-ink);font-weight:600">Overdue</span><span class="v">${over}</span></div><div class="tile" style="background:var(--red-soft);border:0"><span class="k" style="color:var(--red-ink);font-weight:600">Never reviewed</span><span class="v">${never}</span></div></div>
    <div class="small muted">${na} other bills don't need reviewing. Turn reviewing on in a bill's edit screen.</div></div>
  ${fut ? h`<div class="banner amber">${fut} bill${fut > 1 ? 's have' : ' has'} a last-reviewed date in the future — open ${fut > 1 ? 'them' : 'it'} and fix the date.</div>` : ''}
  <div class="between" style="padding:4px 2px 0"><h2>Coming up</h2><span class="small muted">Soonest first</span></div>
  <div class="card list">${list.length ? list.map(({ b, r, nd }) => h`<div class="item"><span class="stack" style="width:46px;flex-shrink:0;align-items:center;background:var(--bg);border-radius:8px;padding:4px 0"><span class="xs muted" style="font-weight:600;text-transform:uppercase">${r.next ? C.monthName(Number(r.next.slice(5, 7)) - 1, false) : '—'}</span><b style="font-size:17px">${r.next ? Number(r.next.slice(8)) : '?'}</b></span>
    <a class="grow stack" href="#/bill/${b.id}" style="gap:3px;color:inherit"><span class="t">${b.name}</span><span class="xs muted">${b.review.last ? 'Last reviewed ' + C.fmtDate(b.review.last, { year: true, dow: false }) : 'Never reviewed'}${nd && (b.freq === 'Annual' || b.freq === 'Every 5 yrs') ? ' · renews ' + C.fmtDate(nd, { dow: false }) : ''}</span></a>
    ${r.status === 'ok' ? h`<span class="pill green">Up to date</span>` : h`<button class="btn small" data-act="review" data-bill="${b.id}">Reviewed</button>`}</div>`) : h`<div class="empty">No bills are set to be reviewed.</div>`}</div>
  <div class="card pad small" style="line-height:1.5;color:var(--ink2)"><b>How the status works</b> — same rules as your spreadsheet: the next review is 12 months after the last. <b>Due soon</b> = within 30 days of that. <b>Overdue</b> = past it. Annual bills also get a "compare before it renews" alert 45 days before renewal if not reviewed.</div>`;
}

function scrSettings() {
  const d = doc();
  const link = (href, title, sub) => h`<a class="item" href="${href}" style="min-height:60px"><span class="grow stack" style="gap:2px"><span class="t" style="font-weight:600">${title}</span><span class="s">${sub}</span></span>${icon('next', 18)}</a>`;
  const pd = d.settings.payday && d.settings.payday.base;
  const nextPay = C.paydays(d.settings, today(), C.addDays(today(), 14))[0];
  const topic = d.settings.ntfy && d.settings.ntfy.topic;
  return h`${head('Settings')}
  <div class="eyebrow">Alerts</div>
  <div class="card list">${link('#/alerts', 'Push alerts & reminder times', topic ? 'ntfy topic set · ' + (d.settings.reminders.time || '07:00') + ' every morning' : 'Not set up yet')}${link('#/transfers', 'Savings transfers', 'Revolut savings → personal, the day before each linked bill')}</div>
  <div class="eyebrow">Customise — every list can be added to, renamed or removed</div>
  <div class="card list">${link('#/pay', 'Pay & paydays', (d.people || []).filter((p) => !p.del).map((p) => p.name).join(' + ') + (pd ? ' · every 2nd ' + C.dowName(C.dow(pd), true) + (nextPay ? ' · next ' + C.fmtDate(nextPay, { dow: false }) : '') : ' · set your payday'))}
  ${link('#/accounts', 'Accounts', (d.accounts || []).filter((a) => !a.del && a.active !== false).map((a) => a.name).join(' · ') || 'None yet')}
  ${link('#/types', 'Bill types & colours', (d.types || []).filter((x) => !x.del).length + ' types')}
  ${link('#/properties', 'Investment properties', (d.properties || []).filter((p) => !p.del && p.status !== 'sold').map((p) => p.name).join(' · ') || 'None')}
  ${link('#/others', 'People you pay bills for', (d.others || []).filter((o) => !o.del).map((o) => o.name).join(' · ') || 'None')}
  ${link('#/checkpay', 'How each bill is paid', (d.settings.payCheckPending || []).length ? (d.settings.payCheckPending.length + ' to confirm') : 'All confirmed')}</div>
  <div class="eyebrow">Sharing, backup & Excel</div>
  <div class="card list">${link('#/sync', 'Sharing with Lyndsey & backup', [S.dev.github ? 'GitHub ✓' + (S.dev.lastSync ? ' ' + new Date(S.dev.lastSync).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : '') : 'GitHub not connected', DB.isOn(S.dev) ? (S.dbx === 'error' ? 'Dropbox problem' : 'Dropbox ✓') : 'Dropbox not connected'].join(' · '))}
  ${link('#/excel', 'Excel workbook', 'Refresh button for tab 11 · or download a CSV')}
  ${link('#/activity', 'Recent changes', 'Who changed what')}
  ${link('#/health', 'Check my bills', 'Looks for anything that would make a total or an alert wrong')}</div>
  <div class="card pad small muted" style="line-height:1.5">This phone: <b>${S.dev.name || 'not named'}</b> · <button class="btn small ghost" data-act="rename-device">Change</button><br>Data imported ${d.importedAt ? C.fmtDate(d.importedAt, { year: true }) : '—'}${d.importedFrom ? ' from ' + d.importedFrom : ''}. Version ${APP_VERSION}.</div>`;
}

function scrActivity() {
  const a = (doc().activity || []).slice(0, 100);
  return h`${back('#/settings', 'Recent changes')}<div class="card list">${a.length ? a.map((x) => h`<div class="item"><span class="grow stack" style="gap:2px"><span class="t" style="font-size:14px">${x.text}</span><span class="s">${x.by || ''} · ${new Date(x.at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</span></span></div>`) : h`<div class="empty">No changes yet.</div>`}</div>`;
}

// ----- bill detail -----
function scrBill(id) {
  const d = doc(), t = today(), b = C.byId(d.bills, id);
  if (!b) return h`${back('#/bills', 'Bill not found')}`;
  const nd = C.nextDue(b, t);
  const a = nd ? C.amountOn(b, nd, d) : C.baseAmountOn(b, t);
  const st = nd ? C.payState(d, b, nd, t) : null;
  const rv = C.reviewInfo(b, t);
  const fu = C.followUps(d, t).find((f) => f.bill.id === b.id);
  const pastOnly = C.occurrences(b, C.addDays(t, -400), C.addDays(t, -1)).slice(-6).reverse();
  // payments already made for dates still to come (paid early or scheduled) go at the top
  const ahead = C.occurrences(b, t, C.addDays(t, 400)).filter((dd) => { const p = C.paymentFor(d, b.id, dd); return p && p.status !== 'missed'; }).reverse();
  const past = ahead.concat(pastOnly);
  const overdue = pastOnly.filter((dd) => C.payState(d, b, dd, t) === 'overdue');
  const ty = C.typeOf(d, b);
  const hist = C.priceHistory(b);
  const maxH = Math.max(1, ...hist.map((x) => x.amount));
  const kindLabel = b.kind === 'investment' ? 'Investment' + (propName(b) ? ' · ' + propName(b) : '') : b.kind === 'reminder' ? 'Reminder only · ' + (byIdName(d.others, b.forWhom) || 'someone else') : (ty ? ty.name : 'Household');
  const payLabel = { dd: 'Direct debit · ticks itself', manual: 'You pay it' + (b.bpay && b.bpay.biller ? ' · BPAY ' + b.bpay.biller + (b.bpay.ref ? ' / ' + b.bpay.ref : '') : ''), rent: 'Taken from the rent' }[b.payMethod] || '—';
  const recentDD = b.payMethod !== 'manual' ? pastOnly.find((dd) => C.daysBetween(dd, t) <= 10) : null;
  return h`${back('#/bills', b.name, kindLabel)}
  ${b.status !== 'active' ? h`<div class="banner ${b.status === 'stopped' ? 'red' : 'amber'}">${b.status === 'stopped' ? 'Stopped on ' + C.fmtDate(b.stoppedAt, { year: true }) + '. No more reminders; history kept.' : 'Not started yet — no reminders until you add the details and switch it on.'}</div>` : ''}
  <div class="card pad stack" style="gap:14px">
    <div class="between" style="align-items:flex-start"><span class="stack" style="gap:2px"><span class="mono" style="font-size:32px;font-weight:600">${amt(b, a)}</span><span class="small muted">${b.freq || '—'}${C.isOneOff(b) ? (b.refDate ? ' · due ' + C.fmtDate(b.refDate, { year: true }) : '') : a !== null && C.PER_YEAR[b.freq] ? ' · about ' + C.money(a * C.PER_YEAR[b.freq] / 12) + ' a month' : ''}${b.amountMode === 'percentPay' ? ' · ' + b.percent + '% of ' + (byIdName(d.people, b.personId) || 'pay') + '’s ' + (b.percentBase === 'takeHome' ? 'take-home' : 'gross') + ' pay' : ''}</span></span>
      ${nd ? (st === 'paid' ? h`<span class="pill green">Paid</span>` : st === 'scheduled' ? h`<span class="pill blue">Scheduled</span>` : relPill(C.daysBetween(t, nd))) : ''}</div>
    <div class="grid2"><div class="stack" style="gap:2px"><span class="xs muted">${C.isOneOff(b) ? 'Due' : 'Next due'}</span><b>${nd ? C.fmtDate(nd, { year: true }) : C.isOneOff(b) && b.refDate ? C.fmtDate(b.refDate, { year: true }) : '—'}</b>${nd && weekendNote(b, nd) ? h`<span class="xs muted">${weekendNote(b, nd).slice(3)}</span>` : ''}</div><div class="stack" style="gap:2px"><span class="xs muted">Paid from</span><b>${b.accountId ? C.accountName(d, b.accountId) : '—'}</b></div></div>
    ${overdue.length ? h`<button class="btn" data-act="pay" data-bill="${b.id}" data-due="${overdue[overdue.length - 1]}">Mark the ${C.fmtDate(overdue[overdue.length - 1], { dow: false })} payment as paid</button>`
      : b.payMethod === 'manual' && nd && !C.settled(st) ? h`<button class="btn" data-act="pay" data-bill="${b.id}" data-due="${nd}">Mark ${C.fmtDate(nd, { dow: false })} as paid</button>` : ''}
    ${nd && C.paymentFor(d, b.id, nd) && C.settled(st) ? h`<button class="btn ghost small" data-act="payedit" data-bill="${b.id}" data-due="${nd}">${payLine(b, nd, st)} · Change</button>` : ''}
    ${recentDD ? h`<button class="btn ghost small" data-act="missed" data-bill="${b.id}" data-due="${recentDD}">${C.payState(d, b, recentDD, t) === 'missed' ? 'Undo “didn’t come out” for ' : 'The ' }${C.fmtDate(recentDD, { dow: false })}${C.payState(d, b, recentDD, t) === 'missed' ? '' : ' debit didn’t come out'}</button>` : ''}
  </div>
  ${C.oneOffDone(d, b, t) ? h`<div class="banner green">This one-off bill is done — no more reminders. It stays in reports and history.</div>` : ''}
  ${fu ? h`<div class="banner ${fu.p === 1 ? 'red' : 'amber'}"><b>${fu.p === 1 ? 'Needs attention' : 'To check'}:</b> ${fu.text}</div>` : ''}
  ${(b.todos || []).filter((x) => !x.del).length ? h`<div class="card list">${b.todos.filter((x) => !x.del).map((td) => h`<div class="item"><button class="tick ${td.done ? 'on' : ''}" data-act="todo" data-bill="${b.id}" data-id="${td.id}" aria-label="Done">${icon('check', 18, 2.4)}</button><span class="grow t" style="${td.done ? 'text-decoration:line-through;color:#6E7378' : ''}">${td.text}</span></div>`)}</div>` : ''}
  ${b.review && b.review.applicable ? h`<div class="card pad stack" style="gap:12px"><div class="between"><h3>Review</h3><span class="pill ${rv.status === 'ok' ? 'green' : rv.status === 'soon' ? 'amber' : 'red'}">${rv.label}</span></div>
    <div class="grid2"><div class="stack" style="gap:2px"><span class="xs muted">Last reviewed</span><b style="font-weight:500">${b.review.last ? C.fmtDate(b.review.last, { year: true, dow: false }) : '—'}</b></div><div class="stack" style="gap:2px"><span class="xs muted">Next review</span><b style="font-weight:500">${rv.next ? C.fmtDate(rv.next, { year: true, dow: false }) : '—'}</b></div></div>
    <button class="btn sec" data-act="review" data-bill="${b.id}">I’ve reviewed it</button>
    ${(b.review.log || []).length ? h`<div class="stack" style="gap:4px">${b.review.log.slice().reverse().slice(0, 5).map((l) => h`<div class="xs muted">${C.fmtDate(l.date, { year: true, dow: false })} · ${l.outcome || 'Reviewed'}${l.note ? ' — ' + l.note : ''} · ${l.by || ''}</div>`)}</div>` : ''}</div>` : ''}
  <div class="card pad stack" style="gap:12px"><div class="between"><h3>Price history</h3><button class="btn small sec" data-act="newamount" data-bill="${b.id}">Change amount</button></div>
    ${hist.length ? hist.slice().reverse().map((x) => h`<div class="stack" style="gap:4px"><div class="between small"><span>${x.from <= '2000-01-01' ? 'Since tracking began' : 'From ' + C.fmtDate(x.from, { year: true, dow: false })}</span><span><span class="mono" style="font-weight:600">${C.money(x.amount)}</span> ${x.change !== null ? h`<span class="xs" style="font-weight:600;color:${x.change > 0 ? 'var(--red)' : '#1B7048'}">${x.change > 0 ? '▲ +' : '▼ '}${x.pct}%</span>` : ''}</span></div><div class="bar"><span style="width:${(x.amount / maxH * 100).toFixed(1)}%;background:${C.typeColor(d, b)}"></span></div>${x.note ? h`<span class="xs muted">${x.note}</span>` : ''}</div>`) : h`<div class="small muted">No amount yet.</div>`}
    <div class="xs muted">Old payments keep the amount that applied then. Reports list every bill that went up or down.</div></div>
  <div class="card" style="padding:4px 16px">
    ${detailRow('How it’s paid', payLabel)}${b.transferDayBefore ? detailRow('Day-before transfer', 'Savings → ' + (b.accountId ? C.accountName(d, b.accountId) : 'personal')) : ''}
    ${detailRow('Type', kindLabel)}${detailRow('In household totals', C.inTotals(b) ? 'Yes' : 'No')}
    ${b.provider ? detailRow('Provider', b.provider) : ''}${b.accountNo ? h`<div class="between" style="padding:12px 0;border-bottom:1px solid var(--line2);font-size:15px"><span class="muted">Policy / account #</span><button class="btn small ghost" data-act="reveal" data-v="${b.accountNo}">•••• tap to show</button></div>` : ''}
    ${b.endDate ? detailRow('Ends on', C.fmtDate(b.endDate, { year: true })) : ''}${b.expectedChange ? detailRow('Expected change', b.expectedChange) : ''}
    ${detailRow('Reminders', b.remind === false ? 'Off' : 'On')}${b.dueText ? detailRow('Spreadsheet due date(s)', b.dueText) : ''}
    ${b.notes ? h`<div class="stack" style="gap:4px;padding:12px 0"><span class="muted" style="font-size:15px">Notes</span><span>${b.notes}</span></div>` : ''}</div>
  ${past.length ? h`<div class="stack" style="gap:6px"><div class="between" style="padding:0 2px"><h3>Recent payments</h3><span class="xs muted">Tap one to change it</span></div><div class="card list">${past.map((dd) => { const s = C.payState(d, b, dd, t); return h`<div class="item"><button class="grow stack" data-act="payedit" data-bill="${b.id}" data-due="${dd}" style="gap:2px;text-align:left;background:none;border:0;padding:0;color:inherit;font:inherit"><span class="t" style="font-size:14px">${C.fmtDate(dd, { year: true })}</span><span class="s">${payLine(b, dd, s)}</span></button><span class="amt">${amt(b, payAmount(b, dd))}</span>${b.payMethod === 'manual' ? h`<button class="tick ${C.settled(s) ? 'on' : ''}" data-act="pay" data-bill="${b.id}" data-due="${dd}" aria-label="Paid">${icon('check', 18, 2.4)}</button>` : ''}</div>`; })}</div></div>` : C.isISO(b.startDate) && b.status === 'active' ? h`<div class="card pad small muted">No payments yet${nd ? ' — first payment due ' + C.fmtDate(nd, { year: true }) : ''}.</div>` : ''}
  <div class="grid2 no-print"><a class="btn ghost" href="#/edit/${b.id}">Edit</a>${b.status === 'stopped' ? h`<button class="btn sec" data-act="restart" data-bill="${b.id}">Restart</button>` : h`<button class="btn danger" data-act="stop" data-bill="${b.id}">Stop this bill</button>`}</div>
  <button class="btn ghost small no-print" data-act="delete" data-bill="${b.id}" style="align-self:center">Delete permanently</button>`;
}
// One line describing a payment: when it was paid, by whom, early/late.
function payLine(b, due, s) {
  const d = doc(), p = C.paymentFor(d, b.id, due);
  if (s === 'missed') return 'Didn’t come out';
  if (s === 'scheduled') return 'Scheduled · ' + C.fmtDate(p.date);
  if (s === 'paid' && p) { const tm = C.paidTiming(p, due); return 'Paid ' + C.fmtDate(p.date, { dow: false }) + (tm && tm !== 'on the day' ? ' · ' + tm : '') + (p.by ? ' · ' + p.by : '') + (p.note ? ' · ' + p.note : ''); }
  if (s === 'paid') return due < (d.trackedFrom || '') || (b.addedOn && due < b.addedOn) ? 'Before the app' : b.payMethod === 'manual' ? 'Paid' : 'Direct debit';
  return s === 'overdue' ? 'Not paid yet' : 'Due';
}
function payAmount(b, due) { const p = C.paymentFor(doc(), b.id, due); return p && p.status === 'paid' && typeof p.amount === 'number' ? p.amount : C.amountOn(b, due, doc()); }
function detailRow(k, v) { return h`<div class="between" style="padding:12px 0;border-bottom:1px solid var(--line2);font-size:15px"><span class="muted">${k}</span><span style="font-weight:500;text-align:right">${v}</span></div>`; }

// ----- add / edit -----
function opt(v, label, cur) { return h`<option value="${v}" ${String(cur ?? '') === String(v) ? 'selected' : ''}>${label}</option>`; }
function scrEdit(id) {
  const d = doc(), t = today();
  const isNew = id === 'new';
  const src = isNew ? null : C.byId(d.bills, id);
  if (!isNew && !src) return h`${back('#/bills', 'Bill not found')}`;
  const b = src || { kind: 'household', typeId: 't_household', freq: 'Monthly', payMethod: 'dd', amountMode: 'fixed', status: 'active', review: { applicable: false }, remind: true, amounts: [] };
  const nd = !isNew ? C.nextDue(b, t) : null;
  const curAmt = isNew ? '' : (C.baseAmountOn(b, nd || t) ?? '');
  const types = (d.types || []).filter((x) => !x.del).sort((a, c) => (a.order || 0) - (c.order || 0));
  const accs = (d.accounts || []).filter((a) => !a.del && a.active !== false);
  const props = (d.properties || []).filter((p) => !p.del);
  const people = (d.people || []).filter((p) => !p.del);
  const others = (d.others || []).filter((o) => !o.del);
  const radio = (name, v, label, cur) => h`<label class="chip" style="display:inline-flex;align-items:center;justify-content:center;flex:1 1 0;position:relative" ${cur === v ? raw('aria-pressed="true"') : ''}><input type="radio" name="${name}" value="${v}" ${cur === v ? 'checked' : ''} style="position:absolute;opacity:0;inset:0;margin:0;cursor:pointer">${label}</label>`;
  const inclDefault = typeof b.includeInTotals === 'boolean' ? b.includeInTotals : C.inTotals(b);
  return h`${back(isNew ? '#/bills' : '#/bill/' + b.id, isNew ? 'Add a bill' : 'Edit bill')}
  <form data-form="bill" data-id="${isNew ? '' : b.id}" class="stack-lg" novalidate>
  ${(() => { const dr = getDraft(isNew ? '' : b.id); return dr ? h`<div class="banner amber small row" style="justify-content:space-between;gap:10px"><span>Unfinished ${isNew ? 'bill' : 'changes'} from ${new Date(dr.at).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit' })} — keep going, or</span><button type="button" class="btn small ghost" data-act="draftdiscard" data-id="${isNew ? '' : b.id}">Discard</button></div>` : ''; })()}
  <div id="formerr"></div>
  <div class="card pad stack-lg">
    <label class="field">Bill name<input name="name" value="${b.name || ''}" required autocomplete="off"></label>
    <div class="stack" style="gap:8px"><span class="field" style="gap:0">Bill type</span><div class="row" style="gap:6px" data-radio>${radio('kind', 'household', 'Household', b.kind)}${radio('kind', 'investment', 'Investment', b.kind)}${radio('kind', 'reminder', 'Reminder only', b.kind)}</div>
      <span class="xs muted" data-show="kind=household">Your own home and family costs.</span><span class="xs muted" data-show="kind=investment">Kept with the property's rent and costs.</span><span class="xs muted" data-show="kind=reminder">Someone else's bill you look after — alerts and a Paid tick, never in your totals.</span></div>
    <div class="grid2"><label class="field" data-show="kind=household,investment">Category<select name="typeId">${types.map((x) => opt(x.id, x.name, b.typeId))}</select></label>
      <label class="field" data-show="kind=investment">Property<select name="propertyId">${opt('', 'Across the portfolio', b.propertyId)}${props.map((p) => opt(p.id, p.name, b.propertyId))}</select></label>
      <label class="field" data-show="kind=reminder">Paying it for<select name="forWhom">${others.map((o) => opt(o.id, o.name, b.forWhom))}${opt('', '— add on the People screen —', others.length ? b.forWhom : '')}</select></label>
      <label class="field">Paid from<select name="accountId">${opt('', 'Not set', b.accountId)}${accs.map((a) => opt(a.id, a.name, b.accountId))}</select></label></div>
    <label class="switch" data-show="kind=household,investment"><span class="stack" style="gap:2px"><b style="font-size:15px">Count in household totals</b><span class="small muted">Upcoming, Calendar, Pay and reports</span></span><input type="checkbox" name="includeInTotals" ${inclDefault ? 'checked' : ''} data-incl-auto="${typeof b.includeInTotals === 'boolean' ? '0' : '1'}"></label>
  </div>
  <div class="card pad stack-lg">
    <div class="grid2"><label class="field">Amount ($)<input class="money" name="amount" type="number" inputmode="decimal" step="0.01" min="0" value="${curAmt}" placeholder="0.00" ${!isNew ? h`data-cur="${curAmt}"` : ''}></label>
      <label class="field">The amount is<select name="amountMode">${opt('fixed', 'Fixed', b.amountMode)}${opt('usually', 'Usually fixed (estimate)', b.amountMode)}${opt('varies', 'Varies — use last amount', b.amountMode)}${opt('percentPay', 'A % of pay', b.amountMode)}</select></label></div>
    <div class="grid3" data-show="amountMode=percentPay"><label class="field">% of pay<input name="percent" type="number" step="0.01" min="0" value="${b.percent ?? 1}"></label><label class="field">Whose pay<select name="personId">${people.map((p) => opt(p.id, p.name, b.personId))}</select></label><label class="field">Based on<select name="percentBase">${opt('gross', 'Gross', b.percentBase)}${opt('takeHome', 'Take-home', b.percentBase)}</select></label></div>
    <span class="xs muted" data-show="amountMode=percentPay">The amount above is used until that pay is entered on the Pay screen.</span>
    ${!isNew ? h`<label class="field" id="amtfrom" hidden>New amount starts from<input type="date" name="amountFrom" value="${nd || t}"><span class="hint">Only for the price change. Earlier payments keep the old amount, and it shows in the price history. To move the bill's date, change <b>Due date</b> below.</span></label>` : ''}
    <div class="stack" style="gap:8px"><span class="field" style="gap:0">How often</span><div class="grid3" data-radio>${C.FREQS.map((f) => radio('freq', f, f, b.freq))}</div></div>
    <div class="grid2"><label class="field">Due date<input type="date" name="refDate" value="${b.refDate || ''}"><span class="hint" data-show="freq!=One-off">Any one due date, past or upcoming — the app works out the rest.</span><span class="hint" data-show="freq=One-off">The date it's due. It's paid once and not repeated.</span></label>
      <label class="field" data-show="freq!=One-off">Ends on (optional)<input type="date" name="endDate" value="${b.endDate || ''}"><span class="hint">Loan or contract end — stops itself.</span></label></div>
    ${isNew || C.isISO(b.startDate) ? h`<label class="field" data-show="freq!=One-off">Started<input type="date" name="startDate" value="${b.startDate || t}"><span class="hint">No payments before this date. Paying it a while already? Set an earlier date — those payments show as already paid.</span></label>` : ''}
    <label class="switch"><span class="stack" style="gap:2px"><b style="font-size:15px">Not started yet</b><span class="small muted">No reminders or totals until you switch this off</span></span><input type="checkbox" name="pending" ${b.status === 'pending' ? 'checked' : ''}></label>
  </div>
  <div class="card pad stack-lg">
    <div class="stack" style="gap:8px"><span class="field" style="gap:0">How it's paid</span><div class="row" style="gap:6px" data-radio>${radio('payMethod', 'dd', 'Direct debit', b.payMethod)}${radio('payMethod', 'manual', 'I pay it', b.payMethod)}${radio('payMethod', 'rent', 'From rent', b.payMethod)}</div>
      <span class="xs muted" data-show="payMethod=dd">Comes out by itself — ticked as paid on the due date. The alert is a heads-up to have money there.</span><span class="xs muted" data-show="payMethod=manual">Stays on your To pay list until ticked. Reminds you before, on the day, then every morning while overdue.</span><span class="xs muted" data-show="payMethod=rent">Taken out of the rent by the agent. Counted as a cost, no alerts.</span></div>
    <div class="grid2" data-show="payMethod=manual"><label class="field">BPAY biller code<input name="bpayBiller" inputmode="numeric" value="${(b.bpay && b.bpay.biller) || ''}"></label><label class="field">BPAY reference<input name="bpayRef" inputmode="numeric" value="${(b.bpay && b.bpay.ref) || ''}"></label></div>
    <label class="switch"><span class="stack" style="gap:2px"><b style="font-size:15px">Day-before transfer from savings</b><span class="small muted">Adds a transfer-day check to tick off</span></span><input type="checkbox" name="transferDayBefore" ${b.transferDayBefore ? 'checked' : ''}></label>
    <label class="switch"><span class="stack" style="gap:2px"><b style="font-size:15px">Reminders</b><span class="small muted">Include this bill in push alerts</span></span><input type="checkbox" name="remind" ${b.remind === false ? '' : 'checked'}></label>
  </div>
  <div class="card pad stack-lg">
    <div class="grid2"><label class="field">Provider<input name="provider" value="${b.provider || ''}"></label><label class="field">Policy / account #<input name="accountNo" value="${b.accountNo || ''}" autocomplete="off"></label></div>
    <label class="switch" data-show="freq!=One-off"><span class="stack" style="gap:2px"><b style="font-size:15px">Review this bill yearly</b><span class="small muted">Check you're still on the best deal</span></span><input type="checkbox" name="reviewApplicable" ${b.review && b.review.applicable ? 'checked' : ''}></label>
    <label class="field" data-show="reviewApplicable=on">Last reviewed<input type="date" name="reviewLast" max="${t}" value="${(b.review && b.review.last) || ''}"></label>
    <label class="field">Expected change (optional)<input name="expectedChange" value="${b.expectedChange || ''}" placeholder="e.g. new amount at house handover"></label>
    <label class="field">Notes<textarea name="notes">${b.notes || ''}</textarea></label>
    <label class="field">Due date(s) as written in the spreadsheet<input name="dueText" value="${b.dueText || ''}"><span class="hint">Only used for the Excel export.</span></label>
  </div>
  <button class="btn block" type="submit">${isNew ? 'Add bill' : 'Save changes'}</button>
  </form>`;
}
function updateShows(form) {
  if (!form) return;
  const fd = new FormData(form);
  form.querySelectorAll('[data-show]').forEach((el) => {
    const neg = el.dataset.show.includes('!=');
    const [k, vals] = el.dataset.show.split(neg ? '!=' : '=');
    const v = fd.get(k) ?? '';
    const hit = vals.split(',').includes(String(v));
    el.hidden = neg ? hit : !hit;
  });
  form.querySelectorAll('[data-radio] label').forEach((l) => { const i = l.querySelector('input'); l.setAttribute('aria-pressed', i.checked ? 'true' : 'false'); });
  const incl = form.querySelector('[name=includeInTotals]');
  if (incl && incl.dataset.inclAuto === '1') incl.checked = fd.get('kind') === 'household';
}
async function saveBillForm(form) {
  const d = doc(), t = today();
  const fd = new FormData(form);
  const id = form.dataset.id;
  const old = id ? C.byId(d.bills, id) : null;
  const num = (k) => { const v = fd.get(k); return v === null || v === '' ? null : Number(v); };
  const kind = fd.get('kind') || 'household';
  const b = old ? JSON.parse(JSON.stringify(old)) : { id: C.uid('b'), amounts: [], todos: [], review: { applicable: false, log: [] }, status: 'active' };
  b.name = (fd.get('name') || '').trim();
  b.kind = kind;
  b.typeId = kind === 'reminder' ? null : fd.get('typeId') || null;
  b.propertyId = kind === 'investment' ? fd.get('propertyId') || null : null;
  b.forWhom = kind === 'reminder' ? fd.get('forWhom') || null : null;
  b.accountId = fd.get('accountId') || null;
  const incl = form.querySelector('[name=includeInTotals]');
  if (kind !== 'reminder' && incl) {
    const def = kind === 'household';
    if (incl.checked !== def || typeof b.includeInTotals === 'boolean') b.includeInTotals = incl.checked;
    if (incl.checked === def && incl.dataset.inclAuto === '1') delete b.includeInTotals;
  }
  b.amountMode = fd.get('amountMode') || 'fixed';
  if (b.amountMode === 'percentPay') { b.percent = num('percent'); b.personId = fd.get('personId'); b.percentBase = fd.get('percentBase'); }
  const newAmt = num('amount');
  const curAmt = old ? C.baseAmountOn(old, fd.get('amountFrom') || t) : null;
  let amountNote = '';
  if (newAmt !== null && (!old || !b.amounts.length)) b.amounts = [{ id: C.uid('am'), from: '2000-01-01', amount: newAmt, note: 'Added ' + C.fmtDate(t, { year: true, dow: false }) }];
  else if (newAmt !== null && newAmt !== curAmt) {
    const from = fd.get('amountFrom') || t;
    b.amounts = b.amounts.filter((a) => a.from !== from);
    b.amounts.push({ id: C.uid('am'), from, amount: newAmt, note: 'Changed by ' + who() });
    amountNote = ' (' + C.money(curAmt) + ' → ' + C.money(newAmt) + ' from ' + C.fmtDate(from, { dow: false, year: true }) + ')';
  }
  b.freq = fd.get('freq');
  b.refDate = fd.get('refDate') || null;
  b.endDate = fd.get('endDate') || null;
  if (b.freq === 'One-off') { b.endDate = null; b.startDate = null; if (!old) b.addedOn = null; }
  else if (form.querySelector('[name=startDate]')) b.startDate = C.isISO(fd.get('startDate')) ? fd.get('startDate') : (old ? old.startDate || null : t);
  if (!old && b.freq !== 'One-off') b.addedOn = t;
  const pending = fd.get('pending') === 'on';
  if (pending) b.status = 'pending'; else if (b.status === 'pending') b.status = 'active';
  b.payMethod = fd.get('payMethod') || 'dd';
  b.bpay = { biller: (fd.get('bpayBiller') || '').trim(), ref: (fd.get('bpayRef') || '').trim() };
  b.transferDayBefore = fd.get('transferDayBefore') === 'on';
  b.remind = fd.get('remind') === 'on';
  b.provider = (fd.get('provider') || '').trim();
  b.accountNo = (fd.get('accountNo') || '').trim();
  b.review = b.review || { log: [] };
  b.review.applicable = fd.get('reviewApplicable') === 'on';
  b.review.last = fd.get('reviewLast') || b.review.last || null;
  b.expectedChange = (fd.get('expectedChange') || '').trim();
  b.notes = (fd.get('notes') || '').trim();
  b.dueText = (fd.get('dueText') || '').trim();
  const errs = C.validateBill(b, t);
  if (newAmt === null && !pending && b.amountMode !== 'percentPay') errs.push('Add the amount (or tick "Not started yet").');
  if (errs.length) { form.querySelector('#formerr').innerHTML = h`<div class="banner red">${errs.join(' ')}</div>`.toString(); form.querySelector('#formerr').scrollIntoView({ block: 'center' }); return; }
  if (old && old.status !== 'pending' && old.accountId !== b.accountId && old.accountId && b.payMethod !== 'manual') {
    b.todos = (b.todos || []).concat([{ id: C.uid('td'), text: 'Tell ' + (b.provider || 'the provider') + ' about the new account (' + C.accountName(d, b.accountId) + ')', done: false }]);
  }
  touch(b);
  await commit((old ? 'Edited ' : 'Added ') + b.name + amountNote, (dd) => {
    if (old) dd.bills = dd.bills.map((x) => (x.id === b.id ? b : x)); else dd.bills.push(b);
    if (old && old.payMethod !== b.payMethod) dd.settings.payCheckPending = (dd.settings.payCheckPending || []).filter((x) => x !== b.id);
  });
  clearDraft(id);
  location.hash = '#/bill/' + b.id;
  toast(old ? 'Saved' : 'Bill added');
}

// ----- pay -----
function scrPay() {
  const d = doc(), t = today();
  const people = (d.people || []).filter((p) => !p.del);
  const pds = C.paydays(d.settings, t, C.addDays(t, 60));
  const prev = C.paydays(d.settings, C.addDays(t, -13), t);
  const cur = prev.length ? prev[prev.length - 1] : pds[0];
  const periods = cur ? [0, 1, 2].map((k) => { const p = C.addDays(cur, 14 * k), e = C.addDays(p, 13); const items = C.schedule(d, p, e, t, (b) => b.status !== 'pending'); return { p, e, hh: C.sumAmounts(items.filter((i) => C.inTotals(i.bill))), n: items.filter((i) => C.inTotals(i.bill)).length, inv: C.sumAmounts(items.filter((i) => i.group === 'investment')), pay: payIn(p) }; }) : [];
  const ovs = (d.payOverrides || []).filter((o) => !o.del && o.date >= C.addDays(t, -30)).sort((a, b) => (a.date < b.date ? -1 : 1));
  return h`${back('#/settings', 'Pay & paydays')}
  <form data-form="payday" class="card pad stack"><div class="stack" style="gap:2px"><h3>Payday</h3><span class="small muted">You're both paid every second ${d.settings.payday && d.settings.payday.base ? C.dowName(C.dow(d.settings.payday.base), true) : 'week'} on the same day.</span></div>
    <label class="field">Any one payday<input type="date" name="base" value="${(d.settings.payday && d.settings.payday.base) || ''}"></label>
    <div class="chips">${pds.slice(0, 4).map((p, i) => h`<span class="pill ${i === 0 ? 'green' : 'grey'}" style="padding:4px 10px">${C.fmtDate(p)}</span>`)}</div>
    <button class="btn small sec" type="submit" style="align-self:flex-start">Save payday</button></form>
  ${people.map((p) => { const cp = C.payOn(p, t) || {}; return h`<form data-form="pay" data-id="${p.id}" class="card pad stack"><h3>${p.name}</h3>
    <div class="grid2"><label class="field">Take-home each fortnight<input class="money" name="takeHome" type="number" step="0.01" inputmode="decimal" value="${cp.takeHome ?? ''}" placeholder="Enter amount"></label><label class="field">Gross (optional)<input class="money" name="gross" type="number" step="0.01" inputmode="decimal" value="${cp.gross ?? ''}" placeholder="For % of pay bills"></label></div>
    <label class="field">Starts from payday<select name="from">${(cur ? [cur, ...pds.filter((x) => x !== cur)] : pds).slice(0, 6).map((x) => opt(x, C.fmtDate(x, { year: true }), cur))}</select><span class="hint">Pay changed for good? Enter the new amount and the payday it starts. Earlier fortnights keep the old figure.</span></label>
    <button class="btn small sec" type="submit" style="align-self:flex-start">Save ${p.name}'s pay</button>
    ${(p.pays || []).filter((x) => !x.del).length ? h`<div class="xs muted">${p.pays.filter((x) => !x.del).sort((a, b) => (a.from < b.from ? 1 : -1)).slice(0, 4).map((x) => 'From ' + C.fmtDate(x.from, { year: true, dow: false }) + ': ' + C.money(x.takeHome) + (x.gross ? ' (gross ' + C.money(x.gross) + ')' : '')).join(' · ')}</div>` : ''}</form>`; })}
  <div class="card pad stack"><div class="between"><h3>One-off changes</h3><button class="btn small" data-act="payoverride">Add</button></div><span class="small muted">Overtime, leave loading, unpaid leave — change one payday without touching the usual amount.</span>
    ${ovs.length ? h`<div class="list">${ovs.map((o) => h`<div class="item" style="padding-left:0"><span class="grow stack" style="gap:2px"><span class="t">${byIdName(d.people, o.personId)} · ${C.fmtDate(o.date, { year: true })}</span><span class="s">${o.takeHome !== undefined && o.takeHome !== null ? 'Take-home ' + C.money(o.takeHome) : ''}${o.gross ? ' · gross ' + C.money(o.gross) : ''}${o.note ? ' · ' + o.note : ''}</span></span><button class="btn small ghost" data-act="deloverride" data-id="${o.id}">Remove</button></div>`)}</div>` : h`<div class="card dashed empty">None yet</div>`}</div>
  <div class="stack" style="gap:8px"><h2 style="padding:0 2px">Next three paydays</h2>
  ${periods.map((x) => h`<div class="card pad stack"><b>${C.fmtDate(x.p)} → ${C.fmtDate(x.e)}</b><div class="grid3"><div class="stack" style="gap:2px"><span class="xs muted">Pay in</span><span class="mono" style="font-weight:600">${x.pay === null ? '—' : C.money(x.pay)}</span></div><div class="stack" style="gap:2px"><span class="xs muted">Household bills</span><span class="mono" style="font-weight:600">${C.money(x.hh)}</span></div><div class="stack" style="gap:2px"><span class="xs muted">Left over</span><span class="mono" style="font-weight:600;color:${x.pay === null ? 'inherit' : x.pay - x.hh < 0 ? 'var(--red)' : '#1B7048'}">${x.pay === null ? '—' : C.money(x.pay - x.hh)}</span></div></div>
    <div class="xs" style="color:var(--inv-ink);border-top:1px solid var(--line2);padding-top:8px">${x.n} household payments · investment properties (not counted): ${C.money(x.inv)}</div></div>`)}</div>`;
}

// ----- transfers -----
function scrTransfers() {
  const d = doc(), t = today();
  const up = C.transfers(d, t, C.addDays(t, 21), t);
  const past = C.transfers(d, C.addDays(t, -14), C.addDays(t, -1), t).filter((x) => !d.trackedFrom || x.date >= d.trackedFrom).reverse();
  const linked = C.liveBills(d).filter((b) => b.transferDayBefore && b.status === 'active');
  const accIds = [...new Set(linked.map((b) => b.accountId).filter(Boolean))];
  const prev = C.paydays(d.settings, C.addDays(t, -13), t);
  const cur = prev.length ? prev[prev.length - 1] : null;
  const fns = cur ? [0, 1, 2].map((k) => { const p = C.addDays(cur, 14 * k), e = C.addDays(p, 13); return { p, e, v: C.sumAmounts(C.schedule(d, p, e, t, (b) => accIds.includes(b.accountId) && b.status === 'active')) }; }) : [];
  const annual = C.round2(C.liveBills(d).filter((b) => accIds.includes(b.accountId) && b.status === 'active').reduce((a, b) => a + C.annualAmount(b, t, d), 0));
  const row = (tr) => h`<div class="card row" style="padding:12px 12px 12px 16px"><span class="grow stack" style="gap:3px"><span class="between"><b>${C.fmtDate(tr.date)} · for ${C.fmtDate(C.addDays(tr.date, 1))}</b><span class="mono" style="font-weight:600">${C.money(tr.total)}</span></span><span class="small muted">${tr.items.map((i) => i.bill.name + ' ' + (C.isEstimate(i.bill) ? '≈' : '') + C.money(i.amount)).join(' · ')}</span>${tr.check ? h`<span class="xs" style="color:#1B7048">Ticked by ${tr.check.by}</span>` : ''}</span>
    <button class="tick ${tr.check ? 'on' : ''}" data-act="trtick" data-date="${tr.date}" aria-label="Transfer done">${icon('check', 18, 2.4)}</button></div>`;
  return h`${back('#/settings', 'Savings transfers')}
  <div class="row wrap small" style="gap:6px;font-weight:600"><span class="pill grey" style="padding:6px 10px">Revolut savings</span><span class="muted">→ 1 day before →</span><span class="pill grey" style="padding:6px 10px">${accIds.map((x) => C.accountName(d, x)).join(' / ') || 'personal'}</span><span class="muted">→</span><span class="pill grey" style="padding:6px 10px">Direct debit</span></div>
  <div class="small" style="color:var(--ink2);line-height:1.45">Each linked bill (${linked.length}) has an automatic transfer the day before it's due, so the money earns interest until the last moment. Tick each transfer once you've seen it go through. Switch a bill on or off in its edit screen.</div>
  <div class="eyebrow">Next transfers</div>${up.length ? up.map(row) : emptyCard('No transfers in the next 3 weeks.')}
  ${past.length ? h`<div class="eyebrow">Last two weeks</div>${past.map(row)}` : ''}
  <form data-form="trset" class="card" style="padding:4px 16px"><label class="switch" style="padding:14px 0;border-bottom:1px solid var(--line2)"><span class="stack" style="gap:2px"><b style="font-size:15px">Transfer-day alert</b><span class="small muted">7:00 am on the day, with the amount</span></span><input type="checkbox" name="transferCheck" ${d.settings.reminders.transferCheck !== false ? 'checked' : ''} data-autosave></label>
    <div class="stack" style="padding:14px 0;gap:2px"><b style="font-size:15px">If not ticked by 6 pm</b><span class="small muted">A second alert, so you can move it by hand before the debit. (Part of the transfer-day alert.)</span></div></form>
  ${fns.length ? h`<div class="card" style="padding:4px 16px"><div style="padding:12px 0 4px;font-weight:600">Paid from ${accIds.map((x) => C.accountName(d, x)).join(' / ')}, per pay fortnight</div>${fns.map((f) => h`<div class="between small" style="padding:10px 0;border-bottom:1px solid var(--line2)"><span>${C.fmtDate(f.p)} → ${C.fmtDate(f.e)}</span><span class="mono" style="font-weight:600">${C.money(f.v)}</span></div>`)}
    <div class="xs muted" style="padding:10px 0 12px">Every bill paid from that account, transfer-linked or not.</div></div>
    <div class="card pad stack" style="gap:6px"><div class="between"><b>Into savings each payday</b><span class="mono" style="font-weight:600">${C.money(annual / 26)}</span></div><div class="small" style="color:var(--ink2)">Covers a full year of bills from ${accIds.map((x) => C.accountName(d, x)).join(' / ')} (${C.money(annual)}).</div></div>` : ''}`;
}

// ----- accounts -----
function scrAccounts() {
  const d = doc();
  const accs = (d.accounts || []).filter((a) => !a.del);
  const count = (id) => C.liveBills(d).filter((b) => b.accountId === id && b.status !== 'stopped').length;
  return h`${back('#/settings', 'Accounts')}<div class="small" style="color:var(--ink2)">Where bills are paid from. Add, rename or remove them any time.</div>
  <div class="card list">${accs.filter((a) => a.active !== false).map((a) => h`<div class="item"><span class="grow stack" style="gap:2px"><span class="t" style="font-weight:600">${a.name}</span><span class="s">${{ bank: 'Bank account', credit: 'Credit card', savings: 'Savings' }[a.kind] || 'Account'} · ${count(a.id)} bills${a.note ? ' · ' + a.note : ''}</span></span><button class="btn small ghost" data-act="editacc" data-id="${a.id}">Edit</button></div>`)}
  <button class="item" data-act="editacc" data-id="" style="justify-content:center;color:var(--brand);font-weight:600">+ Add an account</button></div>
  ${accs.some((a) => a.active === false) ? h`<div class="eyebrow">Removed</div><div class="card dashed list">${accs.filter((a) => a.active === false).map((a) => h`<div class="item"><span class="grow stack" style="gap:2px"><span class="t muted">${a.name}</span><span class="s">Not offered for new bills · past payments kept</span></span><button class="btn small ghost" data-act="restoreacc" data-id="${a.id}">Restore</button></div>`)}</div>` : ''}
  <button class="btn sec" data-act="movebills">Move bills to another account</button>
  <div class="card warn pad small" style="line-height:1.5;color:#5A3500">Removing an account that still has bills asks where they should move, then adds a “tell the provider” to-do on each one.</div>`;
}

// ----- types -----
function scrTypes() {
  const d = doc();
  const types = (d.types || []).filter((x) => !x.del).sort((a, b) => (a.order || 0) - (b.order || 0));
  const count = (id) => C.liveBills(d).filter((b) => b.typeId === id).length;
  const clash = (t) => types.find((o) => o.id !== t.id && o.color === t.color);
  return h`${back('#/settings', 'Bill types & colours')}<div class="small" style="color:var(--ink2);line-height:1.45">Rename a type, change its colour or add a new one. Every screen and report follows the change.</div>
  <div class="card list">${types.map((t) => h`<button class="item" data-act="edittype" data-id="${t.id}" style="min-height:56px"><span class="dot lg" style="background:${t.color}"></span><span class="grow stack" style="gap:2px"><span class="t" style="font-weight:600">${t.name}</span><span class="s">${count(t.id)} bills${clash(t) ? ' · same colour as ' + clash(t).name : ''}</span></span>${icon('next', 18)}</button>`)}
  <button class="item" data-act="edittype" data-id="" style="justify-content:center;color:var(--brand);font-weight:600">+ Add a type</button></div>
  <div class="card pad small" style="line-height:1.5;color:var(--ink2)">The first eight colours are picked to stay easy to tell apart side by side, including for colour-blind eyes. Charts also name every colour.</div>`;
}

// ----- properties -----
function scrProperties() {
  const d = doc(), t = today();
  const fy = C.periodRange('fy', t, d);
  const props = (d.properties || []).filter((p) => !p.del);
  const card = (p) => {
    const rent = C.rentIn(d, p, fy.from, fy.to);
    const costs = C.propertyCosts(d, p.id, fy.from, fy.to, t);
    const cr = (p.rents || []).filter((r) => !r.del).sort((a, b) => (a.from < b.from ? 1 : -1))[0];
    const bills = C.liveBills(d).filter((b) => b.kind === 'investment' && b.propertyId === p.id);
    const status = p.status === 'sold' ? h`<span class="pill grey">Sold ${C.fmtDate(p.soldAt, { year: true, dow: false })}</span>` : cr ? h`<span class="pill green">Rented</span>` : h`<span class="pill amber">${p.expectedWeekly ? 'Expected ' + C.money(p.expectedWeekly, 0) + '/wk' : 'Not rented'}</span>`;
    return h`<div class="card pad stack" style="gap:12px"><div class="between" style="align-items:flex-start"><span class="stack" style="gap:2px"><h3>${p.name}</h3><span class="small muted">${p.manager ? 'Managed by ' + p.manager : ''}${cr ? ' · ' + C.money(cr.weekly) + ' a week from ' + C.fmtDate(cr.from, { year: true, dow: false }) : ''}</span></span>${status}</div>
      <div class="list">${bills.map((b) => { const nd = C.nextDue(b, t); return h`<a class="item" href="#/bill/${b.id}" style="padding-left:0;min-height:40px"><span class="grow small">${b.name}${b.payMethod === 'rent' ? h` <span class="xs muted">· taken from rent</span>` : b.payMethod === 'manual' ? h` <span class="xs muted">· you pay</span>` : ''}${b.status === 'pending' ? h` <span class="xs muted">· not started</span>` : ''}${b.expectedChange ? h` <span class="xs" style="color:var(--amber-ink)">· ${b.expectedChange.toLowerCase()}</span>` : ''}</span><span class="mono small">${C.money(C.sumAmounts(C.schedule(d, fy.from, fy.to, t, (x) => x.id === b.id)))}</span></a>`; })}</div>
      <div class="grid3" style="background:var(--inv-soft);border-radius:10px;padding:10px 12px"><div class="stack" style="gap:2px"><span class="xs" style="color:#4E4A6E">Rent ${fy.label.slice(-7)}</span><span class="mono small" style="font-weight:600">${C.money(rent)}</span></div><div class="stack" style="gap:2px"><span class="xs" style="color:#4E4A6E">Costs</span><span class="mono small" style="font-weight:600">${C.money(costs)}</span></div><div class="stack" style="gap:2px"><span class="xs" style="color:#4E4A6E">Net</span><span class="mono small" style="font-weight:600">${C.money(rent - costs)}</span></div></div>
      <div class="grid2 no-print"><button class="btn small sec" data-act="rent" data-id="${p.id}">Rent changed / starts</button><button class="btn small ghost" data-act="editprop" data-id="${p.id}">Edit property</button></div></div>`;
  };
  const totalRent = C.round2(props.reduce((a, p) => a + C.rentIn(d, p, fy.from, fy.to), 0));
  const totalCost = C.sumAmounts(C.schedule(d, fy.from, fy.to, t, (b) => b.kind === 'investment'));
  const portfolio = C.liveBills(d).filter((b) => b.kind === 'investment' && !C.byId(d.properties, b.propertyId));
  return h`${back('#/settings', 'Investment properties', 'Kept apart — not in household totals')}
  <div class="hero inv"><div class="small" style="color:#D3D0E6">${fy.label} · ${C.fmtDate(fy.from, { dow: false, year: true })} – ${C.fmtDate(fy.to, { dow: false, year: true })}</div>
    <div class="grid3"><div class="stack" style="gap:2px"><span class="xs" style="color:#D3D0E6">Rent in</span><span class="mono" style="font-weight:600">${C.money(totalRent)}</span></div><div class="stack" style="gap:2px"><span class="xs" style="color:#D3D0E6">Costs out</span><span class="mono" style="font-weight:600">${C.money(totalCost)}</span></div><div class="stack" style="gap:2px"><span class="xs" style="color:#D3D0E6">Net</span><span class="mono" style="font-weight:600">${C.money(totalRent - totalCost)}</span></div></div>
    <div class="xs" style="color:#D3D0E6;line-height:1.45">Rent counts only weeks actually rented. A negative net means the properties cost more than they bring in. Your accountant still does the official figures.</div></div>
  ${props.filter((p) => p.status !== 'sold').map(card)}
  ${portfolio.length ? h`<div class="card pad stack"><h3>Across the portfolio</h3><div class="list">${portfolio.map((b) => h`<a class="item" href="#/bill/${b.id}" style="padding-left:0"><span class="grow small">${b.name}${b.notes ? h`<br><span class="xs muted">${b.notes}</span>` : ''}</span><span class="mono small">${C.money(C.sumAmounts(C.schedule(d, fy.from, fy.to, t, (x) => x.id === b.id)))}</span></a>`)}</div></div>` : ''}
  <div class="grid2 no-print"><button class="btn" data-act="editprop" data-id="">+ Add a property</button><a class="btn ghost" href="#/edit/new">+ Add a property bill</a></div>
  ${props.some((p) => p.status === 'sold') ? h`<div class="eyebrow">Past properties</div>${props.filter((p) => p.status === 'sold').map(card)}` : ''}
  <div class="small muted" style="line-height:1.45">Sold properties stop their bills but keep their rent and costs in earlier years' reports.</div>`;
}

// ----- people you pay for -----
function scrOthers() {
  const d = doc();
  const list = (d.others || []).filter((o) => !o.del);
  return h`${back('#/settings', 'People you pay bills for')}<div class="small" style="color:var(--ink2)">Bills for these people are reminders only — never in your totals.</div>
  <div class="card list">${list.map((o) => h`<div class="item"><span class="grow stack" style="gap:2px"><span class="t" style="font-weight:600">${o.name}</span><span class="s">${C.liveBills(d).filter((b) => b.forWhom === o.id).length} bills</span></span><button class="btn small ghost" data-act="editother" data-id="${o.id}">Rename</button></div>`)}
  <button class="item" data-act="editother" data-id="" style="justify-content:center;color:var(--brand);font-weight:600">+ Add someone</button></div>`;
}

// ----- how each bill is paid -----
function scrCheckPay() {
  const d = doc();
  const ids = d.settings.payCheckPending || [];
  const list = ids.map((id) => C.byId(d.bills, id)).filter(Boolean);
  const all = C.liveBills(d).filter((b) => b.status !== 'stopped' && !ids.includes(b.id));
  const btns = (b) => h`<div class="row" style="gap:6px">${[['dd', 'Direct debit'], ['manual', 'I pay it'], ['rent', 'From rent']].map(([v, l]) => h`<button class="chip" style="flex:1" aria-pressed="${b.payMethod === v && !ids.includes(b.id) ? 'true' : 'false'}" data-act="setpay" data-bill="${b.id}" data-v="${v}">${l}</button>`)}</div>`;
  return h`${back('#/settings', 'How each bill is paid')}
  <div class="small" style="color:var(--ink2);line-height:1.45">Your spreadsheet doesn't say which bills come out by themselves. Pick one for each — <b>I pay it</b> bills stay on your To pay list and keep reminding you until ticked.</div>
  ${list.length ? h`<div class="eyebrow">To confirm (${list.length})</div><div class="card list">${list.map((b) => h`<div class="stack" style="padding:12px 14px;gap:8px"><div class="between"><span class="stack" style="gap:2px"><b style="font-size:15px">${b.name}</b><span class="xs muted">${C.accountName(d, b.accountId)} · ${b.freq}</span></span></div>${btns(b)}</div>`)}</div>
  <button class="btn sec" data-act="allDD">All the rest are direct debits</button>` : h`<div class="banner green">All confirmed. You can change any bill later in its edit screen.</div>`}
  <div class="eyebrow">Already set</div><div class="card list">${all.map((b) => h`<div class="item"><span class="grow stack" style="gap:2px"><span class="t">${b.name}</span><span class="s">${{ dd: 'Direct debit', manual: 'I pay it', rent: 'From rent' }[b.payMethod]}</span></span><a class="btn small ghost" href="#/edit/${b.id}">Change</a></div>`)}</div>`;
}

// ----- alerts -----
function scrAlerts() {
  const d = doc(), r = d.settings.reminders || {}, n = d.settings.ntfy || {};
  const url = n.topic ? (n.server || 'https://ntfy.sh').replace(/\/$/, '') + '/' + n.topic : '';
  return h`${back('#/settings', 'Push alerts')}
  <div class="card pad stack"><h3>1 · Your private alert channel</h3>
    ${n.topic ? h`<div class="small" style="color:var(--ink2)">Topic name (treat it like a password):</div><div class="mono small" style="word-break:break-all;background:var(--bg);border-radius:8px;padding:10px">${n.topic}</div>
      <div class="grid2"><button class="btn small ghost" data-act="copy" data-v="${n.topic}">Copy topic</button><button class="btn small" data-act="testalert">Send a test</button></div>` : h`<div class="small muted">Make a long random topic name. Only phones that know it get the alerts.</div><button class="btn" data-act="newtopic">Create my topic</button>`}
  </div>
  ${n.topic ? h`<div class="card pad stack small" style="line-height:1.55"><h3>2 · On each phone (Shaun & Lyndsey)</h3>
    <div>1. Install <b>ntfy</b> from the Play Store (free, no account).</div><div>2. Open it, tap <b>+</b>, paste the topic above, and subscribe. Leave the server as ntfy.sh.</div>
    <div>3. Samsung phones: Settings → Apps → ntfy → Battery → <b>Unrestricted</b>, or alerts can arrive late.</div><div>4. Tap <b>Send a test</b> above — it should pop up within a few seconds.</div></div>
  <div class="card pad stack small" style="line-height:1.55"><h3>3 · The 7 am job on GitHub</h3><div>The alerts are sent by a scheduled job in your private <b>${S.dev.github ? S.dev.github.repo : 'bills-data'}</b> repo. It needs your family passphrase stored once as a GitHub secret called <b>BILLS_PASSPHRASE</b> (Settings → Secrets and variables → Actions → New repository secret). GitHub never shows it again.</div><div class="muted">GitHub's scheduler can run 5–30 minutes late, so "7:00" may arrive about 7:15.</div></div>` : ''}
  <form data-form="alerts" class="card pad stack-lg"><h3>What you're told about</h3>
    <label class="field">Morning summary covers the next<select name="digestDays">${[1, 2, 3, 5, 7].map((x) => opt(x, x + (x === 1 ? ' day' : ' days'), r.digestDays ?? 3))}</select><span class="hint">Every bill due in that window, each morning at about 7 am.</span></label>
    <label class="field">Big one-off bills (quarterly, annual, 5-yearly) — extra warning<select name="lumpDays">${[0, 7, 14, 21, 30].map((x) => opt(x, x ? x + ' days before' : 'No extra warning', (r.lumpDays || [14])[0] ?? 0))}</select></label>
    <label class="field">Annual renewal not reviewed — warn<select name="reviewDays">${[30, 45, 60].map((x) => opt(x, x + ' days before', r.reviewDays ?? 45))}</select><span class="hint">Review reminders go out on Monday mornings.</span></label>
    <label class="switch"><span class="stack" style="gap:2px"><b style="font-size:15px">Sunday 6 pm: the week ahead</b><span class="small muted">Household bills for the next 7 days</span></span><input type="checkbox" name="weekly" ${r.weekly !== false ? 'checked' : ''}></label>
    <label class="switch"><span class="stack" style="gap:2px"><b style="font-size:15px">Transfer days</b><span class="small muted">7 am on the day, and 6 pm if not ticked</span></span><input type="checkbox" name="transferCheck" ${r.transferCheck !== false ? 'checked' : ''}></label>
    <label class="field">Alert server<input name="server" value="${n.server || 'https://ntfy.sh'}"><span class="hint">Change this later to move alerts to your QNAP.</span></label>
    <div class="small muted">Alerts show only the bill name, amount and due date.</div>
    <button class="btn sec" type="submit">Save alert settings</button></form>`;
}

// ----- sync -----
function scrSync() {
  const dev = S.dev;
  if (!dev.github) return h`${back('#/settings', 'Sharing & backup')}
  <div class="small" style="color:var(--ink2);line-height:1.5">Connect this phone to your private <b>bills-data</b> repo on GitHub. Everything is locked on the phone with your family passphrase before it's sent, so GitHub only ever stores scrambled data.</div>
  ${!S.doc ? h`<div class="banner green small" style="line-height:1.5"><b>Getting your bills back?</b> Fill in the box below with your access key and the <b>same passphrase as before</b> — everything comes back from GitHub. No access key? Make a new one (bills-data only, Contents: Read and write).</div>` : ''}
  <form data-form="connect" class="card pad stack-lg"><h3>${S.doc ? 'First phone (Shaun)' : 'Restore from GitHub'}</h3>
    <div class="grid2"><label class="field">GitHub user<input name="owner" value="sskehan" autocapitalize="off"></label><label class="field">Private repo<input name="repo" value="bills-data" autocapitalize="off"></label></div>
    <label class="field">Access key (fine-grained token)<input name="token" autocomplete="off" autocapitalize="off" placeholder="github_pat_…"><span class="hint">Only for the bills-data repo, with Contents: Read and write.</span></label>
    <label class="field">Family passphrase<input name="pass" type="password" autocomplete="new-password"><span class="hint">At least 12 characters. Write it down — without it the backup can't be opened.</span></label>
    <label class="field">Passphrase again<input name="pass2" type="password" autocomplete="new-password"></label>
    <label class="field">Whose phone is this?<input name="name" value="${dev.name || 'Shaun'}"></label>
    <button class="btn" type="submit">${S.doc ? 'Connect & back up now' : 'Get my bills back'}</button></form>
  <form data-form="join" class="card pad stack-lg"><h3>Joining (Lyndsey, or a new phone)</h3>
    <label class="field">Setup code<textarea name="code" placeholder="BILLS1.…" style="font-family:var(--mono);font-size:12px"></textarea></label>
    <button class="btn small ghost" type="button" data-act="scan" style="align-self:flex-start">Scan the QR code instead</button>
    <label class="field">Family passphrase<input name="pass" type="password" autocomplete="current-password"></label>
    <label class="field">Whose phone is this?<input name="name" value="${dev.name || 'Lyndsey'}"></label>
    <button class="btn" type="submit">Join</button></form>
  ${dbxPanel()}
  <div class="card pad stack"><h3>Without GitHub</h3><div class="small muted">You can still save a locked backup file and restore it on another phone.</div><div class="grid2"><button class="btn small ghost" data-act="dlbackup">Save backup file</button><button class="btn small ghost" data-act="restorefile">Restore from file</button></div></div>
  ${clearWarn()}`;
  return h`${back('#/settings', 'Sharing & backup')}
  <div class="hero"><div class="row" style="gap:10px">${icon('shield', 22)}<b style="font-size:17px">${S.sync === 'error' ? 'Sync problem' : 'Everything is backed up'}</b></div>
    <div class="sub">${S.sync === 'error' ? S.syncErr : 'Saved after every change to ' + dev.github.owner + '/' + dev.github.repo + ', locked with your family passphrase.'} ${dev.lastSync ? 'Last sync ' + new Date(dev.lastSync).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) + '.' : ''}</div>
    <button class="btn" style="background:#fff;color:var(--brand-dark);align-self:flex-start" data-act="syncnow">Sync now</button></div>
  <div class="card pad stack"><h3>Add a phone</h3><div class="small muted">On the other phone open the Bills link, go to Settings → Sharing & backup → Join, scan this code (or paste it), then type the family passphrase. The code is locked with the passphrase, so it's useless on its own.</div>
    <button class="btn sec" data-act="setupcode">Show setup code</button><div id="setupcode"></div></div>
  <div class="card pad stack"><div class="between"><h3>Backup history</h3><button class="btn small ghost" data-act="history">Load</button></div><div class="small muted">Every saved version is kept on GitHub. Roll the whole app back if something was deleted by mistake.</div><div id="history"></div></div>
  ${dbxPanel()}
  <div class="card pad stack"><h3>Extra copy</h3><div class="small muted">Save a locked file to Google Drive or your NAS now and then — it opens with the same passphrase.</div><div class="grid2"><button class="btn small ghost" data-act="dlbackup">Save backup file</button><button class="btn small ghost" data-act="restorefile">Restore from file</button></div></div>
  <div class="card pad stack"><h3>This phone</h3><div class="small muted">${dev.name || 'Not named'} · connected to ${dev.github.owner}/${dev.github.repo}</div><button class="btn small danger" data-act="disconnect" style="align-self:flex-start">Disconnect this phone</button></div>
  ${clearWarn()}`;
}

function dbxPanel() {
  if (!DB.isOn(S.dev)) return h`<div class="card pad stack" style="gap:10px"><h3>Dropbox</h3>
    <div class="small muted" style="line-height:1.5">Keep a locked copy of your bills in your own Dropbox as well. It's saved a few seconds after every change, with a full snapshot each day kept for ${DB.KEEP_DAYS} days. If Chrome is cleared or the phone is replaced, sign in to Dropbox and everything comes back.</div>
    <button class="btn" data-act="dbxconnect" style="align-self:flex-start">Connect Dropbox</button>
    <div class="xs muted">The app can only see its own folder (Dropbox › Apps › Bills). It's locked with the family passphrase, like GitHub.</div></div>`;
  const dx = S.dev.dbx;
  return h`<div class="card pad stack" style="gap:10px"><div class="between"><h3>Dropbox</h3><span class="pill ${S.dbx === 'error' ? 'red' : 'green'}">${S.dbx === 'error' ? 'Problem' : S.dbx === 'syncing' ? 'Saving…' : 'On'}</span></div>
    <div class="small" style="line-height:1.6">${dx.email ? h`<div><span class="muted">Account</span> ${dx.email}</div>` : ''}<div><span class="muted">Status</span> ${dbxLine()}</div><div><span class="muted">Last snapshot</span> ${dx.lastSnapDay ? C.fmtDate(dx.lastSnapDay, { year: true }) : 'later today'}</div></div>
    <div class="grid2"><button class="btn small" data-act="dbxsync">Save to Dropbox now</button><button class="btn small sec" data-act="dbxsnap">Snapshot now</button></div>
    <div class="grid2"><button class="btn small ghost" data-act="dbxlist">Restore a snapshot…</button><button class="btn small ghost" data-act="dbxoff">Disconnect</button></div>
    <div class="xs muted" style="line-height:1.5">In Dropbox › Apps › Bills: <b>live</b> is the current copy and <b>snapshots</b> holds one a day (plus one before every restore) for ${DB.KEEP_DAYS} days. Each file opens with the family passphrase, and also works with <b>Restore from file</b>.</div></div>`;
}
function clearWarn() {
  return h`<div class="banner amber small" style="line-height:1.5"><b>Clearing Chrome?</b> In <i>Delete browsing data</i>, untick <b>Cookies and site data</b>. That option deletes the bills on this phone. They'd still be in ${DB.isOn(S.dev) ? 'Dropbox' : ''}${DB.isOn(S.dev) && S.dev.github ? ' and ' : ''}${S.dev.github ? 'GitHub' : ''}${!DB.isOn(S.dev) && !S.dev.github ? 'a backup only if you’ve connected one' : ''}, but you'd need the passphrase to get them back.</div>`;
}

// ----- check my bills -----
function scrHealth() {
  const d = doc(), t = today();
  const dev = [];
  const day = 24 * 3600 * 1000;
  if (!S.dev.github) dev.push({ level: 'red', text: 'Not connected to GitHub — the 7 am alerts and Lyndsey’s phone are using old information.', href: '#/sync', fix: 'Reconnect' });
  else if (S.sync === 'error') dev.push({ level: 'red', text: 'GitHub isn’t accepting changes: ' + S.syncErr, href: '#/sync', fix: 'Open' });
  else if (!S.dev.lastSync || Date.now() - S.dev.lastSync > day) dev.push({ level: 'amber', text: 'Last saved to GitHub ' + (S.dev.lastSync ? new Date(S.dev.lastSync).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : 'never') + '.', href: '#/sync', fix: 'Sync now' });
  if (!DB.isOn(S.dev)) dev.push({ level: 'amber', text: 'Dropbox backup isn’t connected on this phone.', href: '#/sync', fix: 'Connect' });
  else if (S.dbx === 'error') dev.push({ level: 'red', text: 'Dropbox backup problem: ' + S.dbxErr, href: '#/sync', fix: 'Open' });
  const items = dev.concat(C.healthCheck(d, t));
  const red = items.filter((x) => x.level === 'red').length, amber = items.length - red;
  const counted = C.liveBills(d).filter((b) => b.status === 'active').length;
  return h`${back('#/settings', 'Check my bills', 'Run on this phone · ' + C.fmtDate(t, { year: true }))}
  <div class="card pad stack" style="gap:6px">${!items.length ? h`<div class="banner green"><b>All clear.</b> Every one of your ${counted} active bills has a date, an amount and an account, nothing is unpaid, and backups are working.</div>`
    : h`<div class="row" style="gap:10px"><span class="pill ${red ? 'solid-red' : 'amber'}">${red ? red + ' to fix' : 'Nothing urgent'}</span>${amber ? h`<span class="pill amber">${amber} to look at</span>` : ''}</div><div class="small muted">Checked ${counted} active bills, every payment tick, your accounts, payday, alerts and backups.</div>`}</div>
  ${items.length ? h`<div class="card list">${items.map((x) => h`<a class="item" href="${x.bill ? '#/bill/' + x.bill.id : x.href || '#/settings'}"><span class="pill ${x.level === 'red' ? 'solid-red' : 'amber'}">${x.level === 'red' ? 'FIX' : 'CHECK'}</span><span class="grow stack" style="gap:2px"><span class="t" style="font-weight:600">${x.bill ? x.bill.name : 'Setup'}</span><span class="s">${x.text}</span></span>${icon('next', 18)}</a>`)}</div>` : ''}
  <div class="card pad small muted" style="line-height:1.5"><b>What's checked:</b> every active bill has a usable due date and an amount; it's paid from an account you still have; ticks sit on dates the bill actually falls on; nothing pay-it-yourself is left unticked; no direct debit is flagged "didn't come out"; no bill is in twice; payday and the alert topic are set; and this phone is saving to GitHub and Dropbox.</div>`;
}

// ----- excel -----
function scrExcel() {
  return h`${back('#/settings', 'Excel workbook')}
  <div class="card pad stack small" style="line-height:1.55"><h3>Refresh button in tab 11</h3><div>A macro in your workbook fetches the latest locked backup from GitHub, unlocks it on your PC, and writes the bills into the <b>Bills Register</b> (rows 102 on). Your formulas, month planner and other tabs then update as normal. The app is the master copy; Excel shows the latest whenever you click Refresh (or when the workbook opens).</div><div class="muted">Setup steps are in the guide that came with the app.</div></div>
  <div class="card pad stack"><h3>Quick CSV</h3><div class="small muted">Or download the register as a CSV and paste it in yourself.</div><button class="btn sec" data-act="csv">Download register CSV</button></div>`;
}

// ----- reports -----
function reportRange() {
  const d = doc(), t = today();
  const k = S.ui.rKind;
  if (k === 'custom') {
    const from = S.ui.rFrom || C.addDays(t, -30), to = S.ui.rTo || t;
    return { from, to: to < from ? from : to, label: C.fmtDate(from, { year: true }) + ' – ' + C.fmtDate(to, { year: true }) };
  }
  return C.periodRange(k, S.ui.rAnchor || t, d);
}
function scrReports() {
  const d = doc(), t = today();
  const R = reportRange();
  const incl = (b) => C.inTotals(b) || (S.ui.rInv && b.kind === 'investment');
  const items = C.schedule(d, R.from, R.to, t, (b) => b.status !== 'pending' && incl(b));
  const hhItems = items.filter((i) => C.inTotals(i.bill));
  const total = C.sumAmounts(items);
  const span = C.daysBetween(R.from, R.to) + 1;
  const annual = C.liveBills(d).filter((b) => C.inTotals(b) && b.status === 'active').reduce((a, b) => a + C.annualAmount(b, t, d), 0);
  const avgFor = annual / 365.25 * span;
  const byBill = new Map();
  for (const i of hhItems) { const c = byBill.get(i.bill.id) || { bill: i.bill, total: 0 }; c.total += i.amount || 0; byBill.set(i.bill.id, c); }
  const top = [...byBill.values()].sort((a, b) => b.total - a.total).slice(0, 8);
  const types = (d.types || []).filter((x) => !x.del).sort((a, b) => (a.order || 0) - (b.order || 0));
  const share = C.totalsByType(d, hhItems).sort((a, b) => b.total - a.total);
  if (S.ui.rInv) { const inv = C.sumAmounts(items.filter((i) => !C.inTotals(i.bill))); if (inv) share.push({ name: 'Investment properties (included)', color: '#6559B8', total: inv }); share.sort((a, b) => b.total - a.total); }
  const grand = share.reduce((a, x) => a + x.total, 0) || 1, maxS = share.length ? share[0].total : 1;
  // months for the chart
  const months = [];
  if (span > 62) for (let m = R.from.slice(0, 8) + '01'; m <= R.to; m = C.addMonths(m, 1)) {
    const e = C.addDays(C.addMonths(m, 1), -1);
    const its = hhItems.filter((i) => i.due >= m && i.due <= e);
    months.push({ m, its, total: C.sumAmounts(its), byType: types.map((ty) => ({ ty, v: C.sumAmounts(its.filter((i) => i.bill.typeId === ty.id)) })) });
  }
  const maxM = Math.max(1, ...months.map((x) => x.total));
  const scaleTop = Math.ceil(maxM / 2000) * 2000 || 2000;
  const sel = months.find((x) => x.m === S.ui.rSel) || months.find((x) => t.startsWith(x.m.slice(0, 7))) || months[0];
  const changes = C.priceChanges(d, R.from, R.to);
  const props = (d.properties || []).filter((p) => !p.del);
  const invRows = props.map((p) => ({ p, rent: C.rentIn(d, p, R.from, R.to), cost: C.propertyCosts(d, p.id, R.from, R.to, t) }));
  const portfolioCost = C.propertyCosts(d, null, R.from, R.to, t);
  const invRent = C.round2(invRows.reduce((a, x) => a + x.rent, 0)), invCost = C.round2(invRows.reduce((a, x) => a + x.cost, 0) + portfolioCost);
  const big = months.length ? months.slice().sort((a, b) => b.total - a.total)[0] : null;
  const quiet = months.length ? months.slice().sort((a, b) => a.total - b.total)[0] : null;
  const kinds = [['pay', 'Pay fortnight'], ['month', 'Month'], ['quarter', 'Quarter'], ['fy', 'Financial year'], ['cal', 'Calendar year'], ['custom', 'Custom dates']];
  return h`<div class="print-only"><h1>Bills report — ${R.label}</h1><div class="small muted">Skehan household · printed ${C.fmtDate(t, { year: true })} · ${S.ui.rInv ? 'includes investment properties' : 'household bills only'}</div></div>
  <div class="no-print">${back('#/', 'Reports')}</div>
  <div class="chips no-print">${kinds.map(([k, l]) => h`<button class="chip" data-act="rkind" data-v="${k}" aria-pressed="${S.ui.rKind === k}">${l}</button>`)}</div>
  ${S.ui.rKind === 'custom' ? h`<div class="grid2 no-print"><label class="field">From<input type="date" value="${R.from}" data-input="rFrom"></label><label class="field">To<input type="date" value="${R.to}" data-input="rTo"></label></div>`
    : h`<div class="between no-print"><button class="btn small ghost" data-act="rshift" data-v="-1">${icon('back', 16)} Previous</button><b class="small" style="text-align:center">${R.label}</b><button class="btn small ghost" data-act="rshift" data-v="1">Next ${icon('next', 16)}</button></div>`}
  <label class="card switch no-print" style="padding:10px 12px"><span class="small" style="font-weight:500">Include investment properties</span><input type="checkbox" data-rinv="1" ${S.ui.rInv ? 'checked' : ''}></label>
  <div class="grid2">
    <div class="tile"><span class="k">${S.ui.rInv ? 'All bills' : 'Household bills'}</span><span class="v">${C.money(total)}</span><span class="xs muted">${items.length} payments · ${C.fmtDate(R.from, { dow: false, year: true })} – ${C.fmtDate(R.to, { dow: false, year: true })}</span></div>
    <div class="tile"><span class="k">${span > 62 ? 'Average month' : 'Compared with average'}</span><span class="v">${span > 62 ? C.money(C.sumAmounts(hhItems) / (span / 30.4375)) : (avgFor ? ((C.sumAmounts(hhItems) / avgFor - 1) * 100 >= 0 ? '+' : '') + Math.round((C.sumAmounts(hhItems) / avgFor - 1) * 100) + '%' : '—')}</span><span class="xs muted">${span > 62 ? C.money(C.sumAmounts(hhItems) / (span / 14)) + ' per fortnight' : 'vs a typical ' + span + ' days (' + C.money(avgFor) + ')'}</span></div>
    ${big ? h`<div class="tile"><span class="k">Most expensive month</span><span class="v" style="font-family:var(--sans)">${C.monthName(Number(big.m.slice(5, 7)) - 1)}</span><span class="xs muted">${C.money(big.total)} household</span></div><div class="tile"><span class="k">Quietest month</span><span class="v" style="font-family:var(--sans)">${C.monthName(Number(quiet.m.slice(5, 7)) - 1)}</span><span class="xs muted">${C.money(quiet.total)} household</span></div>`
      : h`<div class="tile"><span class="k">Biggest single bill</span><span class="v">${top[0] ? C.money(top[0].total) : '—'}</span><span class="xs muted">${top[0] ? top[0].bill.name : ''}</span></div><div class="tile"><span class="k">Paid so far</span><span class="v">${C.money(C.sumAmounts(hhItems.filter((i) => i.state === 'paid')))}</span><span class="xs muted">of ${C.money(C.sumAmounts(hhItems))} household</span></div>`}
  </div>
  ${months.length > 1 ? h`<div class="card pad stack" style="gap:12px"><div class="between"><h3>Household bills by month</h3><button class="btn small ghost no-print" data-act="rtable">${S.ui.rTable ? 'Show chart' : 'Show table'}</button></div>
    <div class="row wrap" style="gap:6px 14px">${types.filter((ty) => months.some((m) => m.byType.find((x) => x.ty.id === ty.id).v)).map((ty) => h`<span class="row xs" style="gap:6px;color:var(--ink2)"><span class="dot" style="background:${ty.color}"></span>${ty.name}</span>`)}</div>
    ${S.ui.rTable ? h`<div style="overflow-x:auto"><table class="t"><thead><tr><th>Month</th><th class="r">Total</th><th>Biggest type</th></tr></thead><tbody>${months.map((m) => { const b = m.byType.slice().sort((a, c) => c.v - a.v)[0]; return h`<tr><td>${C.monthName(Number(m.m.slice(5, 7)) - 1, false)} ${m.m.slice(0, 4)}</td><td class="r">${C.money(m.total)}</td><td>${b && b.v ? b.ty.name : '—'}</td></tr>`; })}</tbody></table></div>`
    : h`<div class="stackchart"><span class="grid" style="top:${196 - 170 * (scaleTop / 2) / scaleTop}px"></span><span class="gl" style="top:${196 - 170 * 0.5 - 14}px">${C.money(scaleTop / 2, 0)}</span><span class="grid" style="top:${196 - 170}px"></span><span class="gl" style="top:${196 - 170 - 14}px">${C.money(scaleTop, 0)}</span>
      ${months.map((m) => h`<button class="${sel && sel.m === m.m ? 'sel' : ''}" data-act="rsel" data-v="${m.m}" aria-label="${C.monthName(Number(m.m.slice(5, 7)) - 1)} ${C.money(m.total)}">${m.byType.filter((x) => x.v > 0).map((x) => h`<span class="sbar" style="height:${Math.max(1, Math.round(x.v / scaleTop * 170))}px;background:${x.ty.color}"></span>`)}</button>`)}</div>
      <div class="xlabels">${months.map((m) => h`<span>${C.monthName(Number(m.m.slice(5, 7)) - 1, false).slice(0, 1)}</span>`)}</div>
      ${sel ? h`<div class="stack" style="background:var(--bg);border-radius:12px;padding:12px;gap:6px"><div class="between small" style="font-weight:600"><span>${C.monthName(Number(sel.m.slice(5, 7)) - 1)} ${sel.m.slice(0, 4)}</span><span class="mono">${C.money(sel.total)}</span></div>${sel.byType.filter((x) => x.v).map((x) => h`<div class="between xs" style="color:var(--ink2)"><span class="row" style="gap:6px"><span class="dot" style="background:${x.ty.color}"></span>${x.ty.name}</span><span class="mono">${C.money(x.v)}</span></div>`)}</div>` : ''}`}
  </div>` : ''}
  <div class="card pad stack" style="gap:12px"><h3>Where the money goes</h3>
    ${share.length ? share.map((s) => h`<div class="stack" style="gap:4px"><div class="between small"><span class="row" style="gap:6px"><span class="dot" style="background:${s.color}"></span>${s.name}</span><span><span class="mono" style="font-weight:600">${C.money(s.total, 0)}</span> <span class="muted">· ${Math.round(s.total / grand * 100)}%</span></span></div><div class="bar"><span style="width:${(s.total / maxS * 100).toFixed(1)}%;background:${s.color}"></span></div></div>`) : h`<div class="small muted">Nothing in this period.</div>`}</div>
  ${top.length ? h`<div class="card pad stack" style="gap:6px"><h3>Biggest household bills</h3><table class="t"><tbody>${top.map((x, k) => h`<tr><td style="width:18px" class="muted">${k + 1}</td><td><span class="row" style="gap:8px"><span class="dot" style="background:${C.typeColor(d, x.bill)}"></span>${x.bill.name}</span></td><td class="r">${C.money(x.total)}</td></tr>`)}</tbody></table></div>` : ''}
  <div class="card pad stack" style="gap:8px"><h3>Price changes</h3>${changes.length ? h`<table class="t"><thead><tr><th>Bill</th><th>From</th><th class="r">New</th><th class="r">Change</th></tr></thead><tbody>${changes.map((c) => h`<tr><td>${c.bill.name}</td><td>${C.fmtDate(c.from, { dow: false, year: true })}</td><td class="r">${C.money(c.amount)}</td><td class="r" style="color:${c.change > 0 ? 'var(--red)' : '#1B7048'}">${c.change > 0 ? '+' : ''}${c.pct}%</td></tr>`)}</tbody></table>` : h`<div class="small muted">No bills changed price in this period. Each time you use “Change amount” it's listed here.</div>`}</div>
  <a class="hero inv" href="#/properties" style="color:#fff"><div class="between"><h3>Investment properties</h3>${icon('next', 18)}</div><div class="xs" style="color:#D3D0E6">${S.ui.rInv ? 'Included in the figures above' : 'Kept apart — not in the figures above'}</div>
    <table class="t" style="color:#fff"><thead><tr><th style="border-color:#5A5590"></th><th class="r" style="border-color:#5A5590">Rent</th><th class="r" style="border-color:#5A5590">Costs</th><th class="r" style="border-color:#5A5590">Net</th></tr></thead><tbody>${invRows.map((x) => h`<tr><td style="border-color:#4A4580">${x.p.name}</td><td class="r" style="border-color:#4A4580">${C.money(x.rent)}</td><td class="r" style="border-color:#4A4580">${C.money(x.cost)}</td><td class="r" style="border-color:#4A4580">${C.money(x.rent - x.cost)}</td></tr>`)}${portfolioCost ? h`<tr><td style="border-color:#4A4580">Across the portfolio</td><td class="r" style="border-color:#4A4580">—</td><td class="r" style="border-color:#4A4580">${C.money(portfolioCost)}</td><td class="r" style="border-color:#4A4580">${C.money(-portfolioCost)}</td></tr>` : ''}<tr><td><b>Total</b></td><td class="r"><b>${C.money(invRent)}</b></td><td class="r"><b>${C.money(invCost)}</b></td><td class="r"><b>${C.money(invRent - invCost)}</b></td></tr></tbody></table></a>
  <div class="small muted" style="line-height:1.45">Future dates are projected from your bills; past ones use the amounts that applied then. Paid ticks and direct debits turn projections into actuals.</div>
  <button class="btn no-print" data-act="print">${icon('download', 18)} Export PDF</button>`;
}

// ----- setup -----
function scrSetup() {
  return h`<div class="stack" style="gap:6px;padding-top:12px"><h1>Bills</h1><div class="muted">Let's get your bills onto this phone.</div></div>
  <div class="card pad stack" style="gap:10px;border:1.5px solid var(--brand)"><h3>Cleared Chrome, or a new phone?</h3><span class="small muted">Get your bills back from a copy you've saved before. You'll need the family passphrase.</span>
    <button class="btn" data-act="dbxconnect">Get my bills from Dropbox</button>
    <div class="grid2"><a class="btn sec" href="#/sync">From GitHub</a><button class="btn sec" data-act="restorefile">From a backup file</button></div></div>
  <div class="eyebrow">Or start fresh</div>
  <button class="card pad stack" data-act="importfile" style="text-align:left;gap:6px;color:inherit"><h3>Import from your spreadsheet</h3><span class="small muted">Open the <b>bills-import.json</b> file that came with the app (made from tab 11).</span></button>
  <a class="card pad stack" href="#/sync" style="gap:6px;color:inherit"><h3>Join the family copy</h3><span class="small muted">For Lyndsey's phone — use the setup code from Shaun's phone and the passphrase.</span></a>
  <button class="card pad stack" data-act="startempty" style="text-align:left;gap:6px;color:inherit"><h3>Start empty</h3><span class="small muted">Add bills by hand.</span></button>`;
}

// ---------- router ----------
const TABS = [['#/', 'Upcoming', 'clock'], ['#/calendar', 'Calendar', 'cal'], ['#/bills', 'Bills', 'list'], ['#/reviews', 'Reviews', 'shield'], ['#/settings', 'Settings', 'sliders']];
function screen() {
  const [r, ...p] = S.route.split('/');
  switch (r) {
    case '': return scrUpcoming();
    case 'attention': return scrAttention();
    case 'calendar': return scrCalendar();
    case 'bills': return scrBills();
    case 'reviews': return scrReviews();
    case 'settings': return scrSettings();
    case 'activity': return scrActivity();
    case 'bill': return scrBill(p[0]);
    case 'edit': return scrEdit(p[0]);
    case 'pay': return scrPay();
    case 'transfers': return scrTransfers();
    case 'accounts': return scrAccounts();
    case 'types': return scrTypes();
    case 'properties': return scrProperties();
    case 'others': return scrOthers();
    case 'checkpay': return scrCheckPay();
    case 'alerts': return scrAlerts();
    case 'sync': return scrSync();
    case 'excel': return scrExcel();
    case 'reports': return scrReports();
    case 'setup': return scrSetup();
    case 'health': return scrHealth();
    default: return scrUpcoming();
  }
}
let lastRoute = null;
function render() {
  const app = $app();
  const keepScroll = lastRoute === S.route;
  const y = window.scrollY;
  const active = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.input;
  const tab = '#/' + (S.route.split('/')[0] || '');
  const noTabs = !S.doc || S.route === 'setup';
  try {
    app.innerHTML = screen().toString();
  } catch (e) {
    console.error(e);
    app.innerHTML = h`<div class="banner red">Something went wrong showing this screen: ${e.message}</div><a class="btn" href="#/">Back to Upcoming</a>`.toString();
  }
  document.getElementById('tabs').innerHTML = noTabs ? '' : TABS.map(([href, label, ic]) => h`<a href="${href}" ${tab === href || (href === '#/bills' && ['bill', 'edit'].includes(S.route.split('/')[0])) || (href === '#/settings' && ['pay', 'transfers', 'accounts', 'types', 'properties', 'others', 'checkpay', 'alerts', 'sync', 'excel', 'activity', 'health'].includes(S.route.split('/')[0])) ? raw('aria-current="page"') : ''}>${icon(ic)}${label}</a>`).join('');
  document.getElementById('tabs').hidden = noTabs;
  app.querySelectorAll('form[data-form="bill"]').forEach((f) => { const dr = getDraft(f.dataset.id); if (dr) applyDraft(f, dr); updateShows(f); });
  if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
  if (active) { const el = app.querySelector(`[data-input="${active}"]`); if (el) { el.focus(); const v = el.value; if (el.setSelectionRange && el.type !== 'date') try { el.setSelectionRange(v.length, v.length); } catch {} } }
  lastRoute = S.route;
}
function onRoute() {
  S.route = (location.hash || '#/').slice(2);
  if (!S.doc && !['setup', 'sync'].includes(S.route.split('/')[0])) { location.hash = '#/setup'; return; }
  render();
}

// ---------- actions ----------
const A = {
  range: (el) => { S.ui.range = Number(el.dataset.v); render(); },
  toggle: (el) => { const k = el.dataset.k; S.ui.open[k] = !S.ui.open[k]; render(); },
  calsel: (el) => { S.ui.calSel = el.dataset.d; render(); },
  calmonth: (el) => { const m = S.ui.calMonth || today().slice(0, 8) + '01'; S.ui.calMonth = C.addMonths(m, Number(el.dataset.v)); S.ui.calSel = null; render(); },
  pay: async (el) => {
    const d = doc(), b = C.byId(d.bills, el.dataset.bill), due = el.dataset.due;
    const ex = C.paymentFor(d, b.id, due);
    if (ex && ex.status !== 'missed') { await commit('Un-ticked ' + b.name + ' (' + C.fmtDate(due, { dow: false }) + ')', (dd) => { touch(ex); ex.del = true; }); return; }
    const a = C.amountOn(b, due, d);
    await commit('Paid ' + b.name + ' ' + C.money(a) + ' (due ' + C.fmtDate(due, { dow: false }) + ')', (dd) => { if (ex) { touch(ex); ex.del = true; } dd.payments.push(touch({ id: C.uid('pm'), billId: b.id, due, date: today(), amount: a, status: 'paid' })); });
    toast('Marked paid today', 6000, h`<button class="btn small sec" data-act="payedit" data-bill="${b.id}" data-due="${due}" style="margin-left:12px">Change</button>`.toString());
  },
  payedit: (el) => {
    const d = doc(), b = C.byId(d.bills, el.dataset.bill), due = el.dataset.due, t = today();
    const p = C.paymentFor(d, b.id, due), s = C.payState(d, b, due, t);
    const rec = p && p.status !== 'missed' ? p : null;
    const tEl = document.querySelector('.toast'); if (tEl) tEl.hidden = true;
    const auto = b.payMethod !== 'manual';
    const defDate = rec && C.isISO(rec.date) ? rec.date : C.settled(s) || auto ? due : t;
    openSheet(h`<h2>Payment — ${b.name}</h2><div class="small muted">Due ${C.fmtDate(due, { year: true })} · ${auto ? 'direct debit' : 'you pay it'}</div>
      <form data-form="payedit" data-bill="${b.id}" data-due="${due}" class="stack-lg">
        <label class="field">Paid on<input type="date" name="date" value="${defDate}" required><span class="hint">A date still to come means it's scheduled (e.g. a BPAY set up for Friday) — reminders stop.</span></label>
        <label class="field">Amount paid ($)<input class="money" type="number" step="0.01" inputmode="decimal" name="amount" value="${rec && typeof rec.amount === 'number' ? rec.amount : C.amountOn(b, due, d) ?? ''}"><span class="hint">Change it for a part payment or a late fee. Reports use what was paid.</span></label>
        <label class="field">Note (optional)<input name="note" value="${(rec && rec.note) || ''}" placeholder="e.g. BPAY receipt 12345"></label>
        <button class="btn" type="submit">Save</button>
        ${rec ? h`<button class="btn ghost danger" type="button" data-act="payremove" data-bill="${b.id}" data-due="${due}">${auto ? 'Reset to automatic' : 'Remove payment (not paid)'}</button>` : ''}
      </form>`.toString());
  },
  payremove: async (el) => {
    const d = doc(), b = C.byId(d.bills, el.dataset.bill), due = el.dataset.due, ex = C.paymentFor(d, b.id, due);
    closeSheet(); if (!ex) return;
    await commit('Removed the ' + b.name + ' payment for ' + C.fmtDate(due, { dow: false }), () => { touch(ex); ex.del = true; });
    toast(b.payMethod === 'manual' ? 'Marked not paid' : 'Back to automatic');
  },
  missed: async (el) => {
    const d = doc(), b = C.byId(d.bills, el.dataset.bill), due = el.dataset.due;
    const ex = C.paymentFor(d, b.id, due);
    if (ex && ex.status === 'missed') { await commit('Undid "didn’t come out" for ' + b.name, () => { touch(ex); ex.del = true; }); return; }
    await commit(b.name + ' ' + C.fmtDate(due, { dow: false }) + ' didn’t come out', (dd) => dd.payments.push(touch({ id: C.uid('pm'), billId: b.id, due, date: today(), status: 'missed' })));
  },
  trtick: async (el) => {
    const date = el.dataset.date, cur = (doc().transferChecks || {})[date];
    await commit((cur && !cur.undone ? 'Un-ticked' : 'Ticked') + ' the savings transfer for ' + C.fmtDate(date, { dow: false }), (dd) => {
      dd.transferChecks = dd.transferChecks || {};
      if (cur && !cur.undone) dd.transferChecks[date] = { undone: true, u: Date.now(), by: who() };
      else dd.transferChecks[date] = { by: who(), at: Date.now(), u: Date.now() };
    });
  },
  todo: async (el) => { const b = C.byId(doc().bills, el.dataset.bill); const td = b.todos.find((x) => x.id === el.dataset.id); await commit((td.done ? 'Re-opened: ' : 'Done: ') + td.text, () => { td.done = !td.done; touch(b); }); },
  reveal: (el) => { el.textContent = el.dataset.v; },
  copy: (el) => copyText(el.dataset.v),
  review: (el) => {
    const b = C.byId(doc().bills, el.dataset.bill);
    const s = openSheet(h`<h2>Reviewed — ${b.name}</h2><form data-form="review" data-id="${b.id}" class="stack-lg"><label class="field">Date reviewed<input type="date" name="date" value="${today()}" max="${today()}"></label>
      <div class="stack" style="gap:8px"><span class="field" style="gap:0">What happened?</span><div class="chips">${['Kept the same', 'Got a cheaper quote', 'Switched provider', 'Negotiated a discount'].map((o, i) => h`<label class="chip" style="position:relative;display:inline-flex;align-items:center"><input type="radio" name="outcome" value="${o}" ${i === 0 ? 'checked' : ''} style="position:absolute;opacity:0;inset:0">${o}</label>`)}</div></div>
      <label class="field">Note (optional)<input name="note" placeholder="e.g. quote from another insurer"></label><button class="btn" type="submit">Save review</button></form>`.toString());
    syncChipPressed(s);
  },
  newamount: (el) => {
    const d = doc(), b = C.byId(d.bills, el.dataset.bill), nd = C.nextDue(b, today()) || today();
    const cur = C.baseAmountOn(b, nd);
    openSheet(h`<h2>Change amount — ${b.name}</h2><form data-form="newamount" data-id="${b.id}" class="stack-lg"><div class="grid2"><label class="field">New amount<input class="money" type="number" step="0.01" min="0" inputmode="decimal" name="amount" placeholder="${cur ?? ''}" required data-cur="${cur ?? ''}"></label><label class="field">Starts from<input type="date" name="from" value="${nd}"></label></div>
      <div class="small muted" id="amtprev">Currently ${C.money(cur)}. Earlier payments keep the old amount.</div><label class="field">Note (optional)<input name="note" placeholder="e.g. 2027 renewal notice"></label><button class="btn" type="submit">Save new amount</button></form>`.toString());
  },
  stop: async (el) => {
    const b = C.byId(doc().bills, el.dataset.bill);
    if (!(await confirmSheet('Stop ' + b.name + '?', 'Use this when you cancel or switch. Reminders stop from today; past payments stay in reports. You can restart it later.', 'Stop bill', true))) return;
    await commit('Stopped ' + b.name, () => { b.status = 'stopped'; b.stoppedAt = today(); touch(b); });
  },
  restart: async (el) => { const b = C.byId(doc().bills, el.dataset.bill); await commit('Restarted ' + b.name, () => { b.status = 'active'; delete b.stoppedAt; touch(b); }); },
  delete: async (el) => {
    const b = C.byId(doc().bills, el.dataset.bill);
    if (!(await confirmSheet('Delete ' + b.name + ' permanently?', 'This removes it and its payment history from every report. To keep the history, use <b>Stop this bill</b> instead. You can still get it back from Backup history.', 'Delete', true))) return;
    await commit('Deleted ' + b.name, () => { touch(b); b.del = true; });
    location.hash = '#/bills';
  },
  setpay: async (el) => { const b = C.byId(doc().bills, el.dataset.bill), v = el.dataset.v; await commit(b.name + ': ' + { dd: 'direct debit', manual: 'I pay it', rent: 'from rent' }[v], (dd) => { b.payMethod = v; touch(b); dd.settings.payCheckPending = (dd.settings.payCheckPending || []).filter((x) => x !== b.id); touch(dd.settings); }); },
  allDD: async () => { if (!(await confirmSheet('All the rest are direct debits?', 'Every bill still on the list will be set to Direct debit. You can change any of them later.', 'Yes'))) return; await commit('Confirmed the rest are direct debits', (dd) => { dd.settings.payCheckPending = []; touch(dd.settings); }); },
  payoverride: () => {
    const d = doc(), pds = C.paydays(d.settings, C.addDays(today(), -14), C.addDays(today(), 120));
    openSheet(h`<h2>One-off pay change</h2><form data-form="override" class="stack-lg"><div class="grid2"><label class="field">Whose pay<select name="personId">${(d.people || []).filter((p) => !p.del).map((p) => opt(p.id, p.name))}</select></label><label class="field">Payday<select name="date">${pds.map((p) => opt(p, C.fmtDate(p, { year: true })))}</select></label></div>
      <div class="grid2"><label class="field">Take-home that payday<input class="money" type="number" step="0.01" name="takeHome"></label><label class="field">Gross (optional)<input class="money" type="number" step="0.01" name="gross"></label></div><label class="field">Why (optional)<input name="note" placeholder="Overtime, leave loading…"></label><button class="btn" type="submit">Save</button></form>`.toString());
  },
  deloverride: async (el) => { const o = (doc().payOverrides || []).find((x) => x.id === el.dataset.id); await commit('Removed a one-off pay change', () => { touch(o); o.del = true; }); },
  editacc: (el) => {
    const d = doc(), a = C.byId(d.accounts, el.dataset.id) || { id: '', name: '', kind: 'bank', note: '' };
    const n = C.liveBills(d).filter((b) => b.accountId === a.id && b.status !== 'stopped').length;
    const others = (d.accounts || []).filter((x) => !x.del && x.active !== false && x.id !== a.id);
    openSheet(h`<h2>${a.id ? 'Edit account' : 'Add an account'}</h2><form data-form="account" data-id="${a.id}" class="stack-lg"><label class="field">Name<input name="name" value="${a.name}" required></label><label class="field">Kind<select name="kind">${opt('bank', 'Bank account', a.kind)}${opt('credit', 'Credit card', a.kind)}${opt('savings', 'Savings', a.kind)}</select></label><label class="field">Note (optional)<input name="note" value="${a.note || ''}"></label><button class="btn" type="submit">Save</button></form>
      ${a.id ? h`<form data-form="removeacc" data-id="${a.id}" class="card pad stack"><h3>Remove ${a.name}</h3>${n ? h`<div class="small muted">${n} bills are paid from it. Move them to:</div><label class="field"><select name="to">${others.map((o) => opt(o.id, o.name))}</select></label>` : h`<div class="small muted">No bills use it. Past payments are kept.</div>`}<button class="btn danger" type="submit">${n ? 'Move ' + n + ' bills and remove' : 'Remove account'}</button></form>` : ''}`.toString());
  },
  restoreacc: async (el) => { const a = C.byId(doc().accounts, el.dataset.id); await commit('Restored account ' + a.name, () => { a.active = true; touch(a); }); },
  movebills: () => {
    const d = doc(), accs = (d.accounts || []).filter((a) => !a.del && a.active !== false);
    const bills = C.liveBills(d).filter((b) => b.status !== 'stopped').sort((a, b) => C.accountName(d, a.accountId).localeCompare(C.accountName(d, b.accountId)) || a.name.localeCompare(b.name));
    openSheet(h`<h2>Move bills to another account</h2><form data-form="movebills" class="stack-lg"><label class="field">Move to<select name="to">${accs.map((a) => opt(a.id, a.name))}</select></label>
      <label class="switch"><span class="small">Also link to the day-before savings transfer</span><input type="checkbox" name="link"></label>
      <div class="card list" style="max-height:45vh;overflow:auto">${bills.map((b) => h`<label class="item" style="cursor:pointer"><input type="checkbox" name="b" value="${b.id}" style="width:22px;height:22px"><span class="grow stack" style="gap:2px"><span class="t">${b.name}</span><span class="s">${C.accountName(d, b.accountId)}</span></span></label>`)}</div>
      <div class="xs muted">Each moved bill gets a “tell the provider” to-do until you tick it.</div><button class="btn" type="submit">Move selected</button></form>`.toString());
  },
  edittype: (el) => {
    const d = doc(), t = C.byId(d.types, el.dataset.id) || { id: '', name: '', color: PALETTE.find(([c]) => !(d.types || []).some((x) => !x.del && x.color === c))?.[0] || '#4C7A9A' };
    const n = C.liveBills(d).filter((b) => b.typeId === t.id).length;
    const s = openSheet(h`<h2>${t.id ? 'Edit type' : 'Add a type'}</h2><form data-form="type" data-id="${t.id}" class="stack-lg"><label class="field">Name<input name="name" value="${t.name}" required></label>
      <div class="stack" style="gap:8px"><span class="field" style="gap:0">Colour</span><div style="display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:6px">${PALETTE.map(([c, l]) => h`<label style="position:relative;height:38px;border-radius:8px;background:${c};border:3px solid ${c === t.color ? '#191C1F' : '#fff'};outline:1px solid var(--line)" title="${l}"><input type="radio" name="color" value="${c}" ${c === t.color ? 'checked' : ''} aria-label="${l}" style="position:absolute;opacity:0;inset:0;margin:0"></label>`)}</div><span class="xs muted" id="clash"></span></div>
      <button class="btn" type="submit">Save</button></form>${t.id ? (n ? h`<div class="small muted">${n} bills use this type — move them to another type before deleting it.</div>` : h`<button class="btn danger small" data-act="deltype" data-id="${t.id}">Delete type</button>`) : ''}`.toString());
    s.addEventListener('change', (e) => { if (e.target.name === 'color') { s.querySelectorAll('input[name=color]').forEach((i) => { i.parentElement.style.borderColor = i.checked ? '#191C1F' : '#fff'; }); const other = (d.types || []).find((x) => !x.del && x.id !== t.id && x.color === e.target.value); s.querySelector('#clash').textContent = other ? 'Also used by ' + other.name + ' — pick another so they’re easy to tell apart.' : ''; } });
  },
  deltype: async (el) => { const t = C.byId(doc().types, el.dataset.id); closeSheet(); await commit('Deleted type ' + t.name, () => { touch(t); t.del = true; }); },
  editprop: (el) => {
    const d = doc(), p = C.byId(d.properties, el.dataset.id) || { id: '', name: '', status: 'active', manager: '', expectedWeekly: '' };
    openSheet(h`<h2>${p.id ? 'Edit property' : 'Add a property'}</h2><form data-form="property" data-id="${p.id}" class="stack-lg"><label class="field">Name<input name="name" value="${p.name}" required></label><label class="field">Managed by<input name="manager" value="${p.manager || ''}"></label>
      <div class="grid2"><label class="field">Status<select name="status">${opt('active', 'Owned', p.status)}${opt('expected', 'Not rented yet', p.status)}${opt('sold', 'Sold', p.status)}</select></label><label class="field">Sold on (if sold)<input type="date" name="soldAt" value="${p.soldAt || ''}"></label></div>
      <label class="field">Expected rent per week (before it's rented)<input class="money" type="number" step="0.01" name="expectedWeekly" value="${p.expectedWeekly ?? ''}"></label>
      <label class="field">Vacant from / to (optional — rent stops for those days)<span class="grid2"><input type="date" name="vacFrom"><input type="date" name="vacTo"></span></label>
      <button class="btn" type="submit">Save</button></form>`.toString());
  },
  rent: (el) => {
    const d = doc(), p = C.byId(d.properties, el.dataset.id);
    const rents = (p.rents || []).filter((r) => !r.del).sort((a, b) => (a.from < b.from ? 1 : -1));
    openSheet(h`<h2>Rent — ${p.name}</h2><form data-form="rent" data-id="${p.id}" class="stack-lg"><div class="grid2"><label class="field">Rent per week<input class="money" type="number" step="0.01" name="weekly" required value="${rents[0] ? '' : p.expectedWeekly || ''}" placeholder="${rents[0] ? rents[0].weekly : ''}"></label><label class="field">From<input type="date" name="from" value="${today()}" required></label></div><span class="xs muted">The full rent before the agent's fees (record their fee as a bill “taken from rent”).</span><button class="btn" type="submit">Save rent</button></form>
      ${rents.length ? h`<div class="card list">${rents.map((r) => h`<div class="item"><span class="grow">${C.money(r.weekly)} a week from ${C.fmtDate(r.from, { year: true, dow: false })}</span><button class="btn small ghost" data-act="delrent" data-prop="${p.id}" data-id="${r.id}">Remove</button></div>`)}</div>` : ''}`.toString());
  },
  delrent: async (el) => { const p = C.byId(doc().properties, el.dataset.prop); const r = p.rents.find((x) => x.id === el.dataset.id); closeSheet(); await commit('Removed a rent entry for ' + p.name, () => { r.del = true; touch(p); }); },
  editother: (el) => { const o = C.byId(doc().others, el.dataset.id) || { id: '', name: '' }; openSheet(h`<h2>${o.id ? 'Rename' : 'Add someone'}</h2><form data-form="other" data-id="${o.id}" class="stack-lg"><label class="field">Name<input name="name" value="${o.name}" placeholder="e.g. Dad — Moulden unit" required></label><button class="btn" type="submit">Save</button></form>`.toString()); },
  newtopic: async () => { const rnd = Array.from(crypto.getRandomValues(new Uint8Array(18)), (x) => 'abcdefghijkmnopqrstuvwxyz23456789'[x % 33]).join(''); await commit('Created the alert topic', (dd) => { dd.settings.ntfy = { ...(dd.settings.ntfy || {}), server: (dd.settings.ntfy && dd.settings.ntfy.server) || 'https://ntfy.sh', topic: 'bills-' + rnd }; touch(dd.settings); }); },
  testalert: async () => {
    const n = doc().settings.ntfy;
    try {
      const r = await fetch((n.server || 'https://ntfy.sh').replace(/\/$/, '') + '/', { method: 'POST', body: JSON.stringify({ topic: n.topic, title: 'Bills test alert', message: 'If you can read this on your phone, alerts are working. Sent by ' + who() + '.', tags: ['white_check_mark'] }) });
      toast(r.ok ? 'Sent — check your phone' : 'ntfy said ' + r.status);
    } catch (e) { toast('Could not reach the alert server'); }
  },
  syncnow: () => doSync(true),
  setupcode: async () => {
    const box = document.getElementById('setupcode');
    box.innerHTML = '<div class="small muted">Making the code…</div>';
    const code = await makeSetupCode({ owner: S.dev.github.owner, repo: S.dev.github.repo, token: S.dev.github.token }, S.dev.passphrase);
    let svg = '';
    try { const q = window.qrcode(0, 'L'); q.addData(code); q.make(); svg = q.createSvgTag({ cellSize: 3, margin: 2, scalable: true }); } catch (e) { svg = ''; }
    box.innerHTML = h`${svg ? h`<div style="background:#fff;border-radius:12px;padding:8px;max-width:280px;align-self:center">${raw(svg)}</div>` : ''}<div class="mono xs" style="word-break:break-all;background:var(--bg);border-radius:8px;padding:10px;max-height:120px;overflow:auto">${code}</div><button class="btn small ghost" data-act="copy" data-v="${code}">Copy code</button>`.toString();
    box.className = 'stack';
  },
  history: async () => {
    const box = document.getElementById('history');
    box.innerHTML = '<div class="small muted">Loading…</div>';
    try {
      const list = await St.ghHistory(S.dev.github, 'data.enc.json');
      box.innerHTML = h`<div class="list">${list.map((c, i) => h`<div class="item" style="padding-left:0"><span class="grow stack" style="gap:2px"><span class="t" style="font-size:14px">${new Date(c.date).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</span><span class="s">${c.message}</span></span>${i === 0 ? h`<span class="xs muted">Current</span>` : h`<button class="btn small ghost" data-act="restorever" data-sha="${c.sha}" data-when="${new Date(c.date).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}">Restore</button>`}</div>`)}</div>`.toString();
    } catch (e) { box.innerHTML = h`<div class="banner red">${e.message}</div>`.toString(); }
  },
  restorever: async (el) => {
    if (!(await confirmSheet('Restore the version from ' + el.dataset.when + '?', 'Both phones go back to how things were then. The current version stays in the history, so this can be undone.', 'Restore', true))) return;
    try {
      if (DB.isOn(S.dev)) await DB.snapshot(S.doc, S.dev, saveDev, dbxClient(), 'before-restore').catch(() => {});
      await replaceDoc(await St.loadVersion(S.dev, el.dataset.sha), 'Restored the version from ' + el.dataset.when);
    } catch (e) { toast(e.message, 5000); }
  },
  dbxconnect: async () => {
    if (!navigator.onLine) return toast("You're offline — connect Dropbox when you have internet");
    await DB.startConnect(S.dev, saveDev);
  },
  dbxsync: () => doDbx(true),
  dbxsnap: async () => {
    try { await DB.snapshot(S.doc, S.dev, saveDev, dbxClient(), 'manual'); toast('Snapshot saved to Dropbox'); } catch (e) { toast(e.message, 5000); }
  },
  dbxlist: async () => {
    const s = openSheet('<h2>Dropbox snapshots</h2><div class="small muted">Loading…</div>');
    try {
      const list = await DB.listSnapshots(dbxClient());
      s.innerHTML = h`<h2>Dropbox snapshots</h2><div class="small muted">One a day for ${DB.KEEP_DAYS} days, plus one before every restore. Restoring puts both phones back to that copy; a snapshot of what's here now is saved first.</div>
        <div class="list">${list.length ? list.map((x) => h`<div class="item" style="padding-left:0"><span class="grow stack" style="gap:2px"><span class="t" style="font-size:14px">${x.name.replace(/^bills-|\.enc\.json$/g, '').replace(/-(\d{2})(\d{2})-/, ' $1:$2 · ').replace(/-/g, ' ').replace(/^(\d{4}) (\d{2}) (\d{2})/, '$3/$2/$1')}</span><span class="s">${x.when ? 'Saved ' + new Date(x.when).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</span></span><button class="btn small ghost" data-act="dbxrestore" data-path="${x.path}" data-name="${x.name}">Restore</button></div>`) : h`<div class="empty">No snapshots yet — the first is made today.</div>`}</div>
        <button class="btn ghost" data-act="closesheet">Close</button>`.toString();
    } catch (e) { s.innerHTML = h`<h2>Dropbox snapshots</h2><div class="banner red">${e.message}</div><button class="btn ghost" data-act="closesheet">Close</button>`.toString(); }
  },
  dbxrestore: async (el) => {
    closeSheet();
    if (!(await confirmSheet('Restore this Dropbox snapshot?', 'Both phones go back to the bills as they were in <b>' + el.dataset.name + '</b>. A snapshot of what\'s here now is saved to Dropbox first, so this can be undone.', 'Restore', true))) return;
    try {
      const cl = dbxClient();
      const old = await DB.readSnapshot(cl, el.dataset.path, S.dev.passphrase);
      if (S.doc) await DB.snapshot(S.doc, S.dev, saveDev, cl, 'before-restore');
      if (!S.doc) { S.doc = St.joinDoc(); }
      await replaceDoc(old, 'Restored Dropbox snapshot ' + el.dataset.name);
      await doDbx();
      toast('Restored from Dropbox');
    } catch (e) { toast(e.message, 5000); }
  },
  dbxoff: async () => {
    if (!(await confirmSheet('Disconnect Dropbox on this phone?', 'Your bills stay on this phone and in GitHub. The copy and snapshots already in Dropbox are kept.', 'Disconnect', true))) return;
    S.dev.dbx = null; await saveDev(); S.dbx = 'off'; render();
  },
  closesheet: () => closeSheet(),
  draftdiscard: async (el) => {
    if (!(await confirmSheet('Discard what you typed?', 'The ' + (el.dataset.id ? 'bill goes back to how it was saved' : 'unfinished bill is cleared') + '.', 'Discard', true))) return;
    clearDraft(el.dataset.id); lastRoute = null; render();
  },
  dlbackup: async () => {
    if (!S.dev.passphrase) {
      const pass = prompt('Choose a passphrase to lock the backup file (write it down):');
      if (!pass || pass.length < 8) return toast('Use at least 8 characters');
      S.dev.passphrase = pass; await St.saveDevice(S.dev);
    }
    download('bills-backup-' + today() + '.json', await St.lockedBackupFile(S.doc, S.dev));
  },
  restorefile: async () => {
    const f = await pickFile(); if (!f) return;
    try {
      let j = JSON.parse(f.text), d;
      if (St.looksLikeDoc(j)) d = j;
      else { const pass = prompt('Passphrase for this backup:'); if (!pass) return; d = await St.readBackupFile(f.text, pass); if (!S.dev.passphrase) { S.dev.passphrase = pass; await St.saveDevice(S.dev); } }
      if (S.doc && !(await confirmSheet('Replace what\'s on this phone?', 'The backup will be merged with what\'s here; where both changed the same thing, the newer change wins.', 'Restore'))) return;
      clampStamps(d);
      S.doc = S.doc ? C.mergeDocs(S.doc, d) : d;
      await saveDoc(S.doc); await askName(); location.hash = '#/'; render(); queueSync(500); toast('Restored');
    } catch (e) { toast(e.message, 5000); }
  },
  importfile: async () => {
    const f = await pickFile(); if (!f) return;
    try {
      const j = JSON.parse(f.text);
      if (!St.looksLikeDoc(j)) { if (j.ct) { const pass = prompt('Passphrase for this backup:'); if (!pass) return; S.doc = await St.readBackupFile(f.text, pass); if (!S.dev.passphrase) S.dev.passphrase = pass; await saveDoc(S.doc); await St.saveDevice(S.dev); await askName(); location.hash = '#/'; return; } throw new Error("That isn't a Bills import file"); }
      if (!j.trackedFrom) j.trackedFrom = today();
      clampStamps(j);
      S.doc = S.doc ? C.mergeDocs(S.doc, j) : j;
      await saveDoc(S.doc); await askName();
      location.hash = '#/'; toast('Imported ' + C.liveBills(S.doc).length + ' bills');
    } catch (e) { toast(e.message, 5000); }
  },
  startempty: async () => { S.doc = St.emptyDoc(); S.doc.trackedFrom = today(); S.doc.people = [{ id: C.uid('pe'), name: 'Me', pays: [], u: Date.now() }]; await saveDoc(S.doc); await askName(); location.hash = '#/'; },
  disconnect: async () => {
    if (!(await confirmSheet('Disconnect this phone?', 'Your bills stay on this phone, but it stops syncing and backing up. The other phone and GitHub are not changed.', 'Disconnect', true))) return;
    S.dev.github = null; S.dev.passphrase = ''; S.dev.salt = null; await St.saveDevice(S.dev); S.sync = 'off'; render();
  },
  'rename-device': async () => { await askName(true); render(); },
  csv: () => download('bills-register-' + today() + '.csv', registerCSV(), 'text/csv'),
  rkind: (el) => { S.ui.rKind = el.dataset.v; S.ui.rAnchor = today(); S.ui.rSel = null; render(); },
  rshift: (el) => { S.ui.rAnchor = C.shiftPeriod(S.ui.rKind, S.ui.rAnchor || today(), Number(el.dataset.v)); S.ui.rSel = null; render(); },
  rinv: (el) => { S.ui.rInv = el.checked; render(); },
  rtable: () => { S.ui.rTable = !S.ui.rTable; render(); },
  rsel: (el) => { S.ui.rSel = el.dataset.v; render(); },
  print: () => window.print(),
  scan: () => startScan(),
};
function syncChipPressed(root) {
  const upd = () => root.querySelectorAll('label.chip').forEach((l) => { const i = l.querySelector('input'); if (i) l.setAttribute('aria-pressed', i.checked ? 'true' : 'false'); });
  root.addEventListener('change', upd); upd();
}
async function askName(force) {
  if (S.dev.name && !force) return;
  const n = prompt('Whose phone is this? (shown next to changes you make)', S.dev.name || 'Shaun');
  if (n) { S.dev.name = n.trim().slice(0, 30); await St.saveDevice(S.dev); }
}

// ---------- forms ----------
const F = {
  payedit: async (form) => {
    const d = doc(), b = C.byId(d.bills, form.dataset.bill), due = form.dataset.due, fd = new FormData(form);
    const date = fd.get('date'), amount = fd.get('amount') === '' ? null : Number(fd.get('amount')), note = (fd.get('note') || '').trim();
    if (!C.isISO(date)) return toast('Pick the date it was paid');
    if (amount !== null && !(amount >= 0)) return toast('Check the amount');
    const ex = C.paymentFor(d, b.id, due), rec = ex && ex.status !== 'missed' ? ex : null;
    const was = rec && rec.date && rec.date !== date ? ' (was ' + C.fmtDate(rec.date, { dow: false }) + ')' : '';
    closeSheet();
    await commit((rec ? 'Changed ' : 'Recorded ') + b.name + ' payment: ' + (date > today() ? 'scheduled ' : 'paid ') + C.fmtDate(date, { dow: false }) + was + (amount !== null ? ' · ' + C.money(amount) : ''), (dd) => {
      if (rec) { Object.assign(rec, { date, amount: amount ?? C.amountOn(b, due, dd), note }); touch(rec); }
      else { if (ex) { touch(ex); ex.del = true; } dd.payments.push(touch({ id: C.uid('pm'), billId: b.id, due, date, amount: amount ?? C.amountOn(b, due, dd), note, status: 'paid' })); }
    });
    toast(date > today() ? 'Scheduled for ' + C.fmtDate(date) : 'Payment saved');
  },
  bill: (form) => saveBillForm(form),
  review: async (form) => {
    const fd = new FormData(form), b = C.byId(doc().bills, form.dataset.id), date = fd.get('date') || today();
    if (date > today()) return toast("The date can't be in the future");
    closeSheet();
    await commit('Reviewed ' + b.name + ' — ' + fd.get('outcome'), () => { b.review = b.review || {}; b.review.applicable = true; b.review.last = date; b.review.log = (b.review.log || []).concat([{ date, outcome: fd.get('outcome'), note: fd.get('note') || '', by: who() }]); touch(b); });
    toast('Review saved — next one ' + C.fmtDate(C.addMonths(date, 12), { year: true, dow: false }));
  },
  newamount: async (form) => {
    const fd = new FormData(form), b = C.byId(doc().bills, form.dataset.id);
    const v = Number(fd.get('amount')), from = fd.get('from');
    if (!(v >= 0) || fd.get('amount') === '' || !C.isISO(from)) return toast('Enter the amount and start date');
    const old = C.baseAmountOn(b, from);
    closeSheet();
    await commit(b.name + ' ' + C.money(old) + ' → ' + C.money(v) + ' from ' + C.fmtDate(from, { dow: false, year: true }), () => { b.amounts = (b.amounts || []).filter((a) => a.from !== from).concat([{ id: C.uid('am'), from, amount: v, note: fd.get('note') || 'Changed by ' + who() }]); touch(b); });
  },
  payday: async (form) => { const v = new FormData(form).get('base'); if (!C.isISO(v)) return toast('Pick a payday'); await commit('Payday set to every 2nd ' + C.dowName(C.dow(v), true), (dd) => { dd.settings.payday = { base: v }; touch(dd.settings); }); toast('Saved'); },
  pay: async (form) => {
    const fd = new FormData(form), p = C.byId(doc().people, form.dataset.id);
    const th = fd.get('takeHome') === '' ? null : Number(fd.get('takeHome')), gr = fd.get('gross') === '' ? null : Number(fd.get('gross'));
    if (th === null && gr === null) return toast('Enter at least the take-home pay');
    const from = fd.get('from');
    await commit(p.name + "'s pay from " + C.fmtDate(from, { dow: false }) + ': ' + C.money(th), () => { p.pays = (p.pays || []).filter((x) => x.from !== from).concat([{ id: C.uid('py'), from, takeHome: th, gross: gr }]); touch(p); });
    toast('Saved');
  },
  override: async (form) => {
    const fd = new FormData(form);
    const o = { id: C.uid('po'), personId: fd.get('personId'), date: fd.get('date'), takeHome: fd.get('takeHome') === '' ? null : Number(fd.get('takeHome')), gross: fd.get('gross') === '' ? null : Number(fd.get('gross')), note: fd.get('note') || '' };
    if (o.takeHome === null && o.gross === null) return toast('Enter an amount');
    closeSheet(); await commit('One-off pay change for ' + C.fmtDate(o.date, { dow: false }), (dd) => { dd.payOverrides = (dd.payOverrides || []).concat([touch(o)]); });
  },
  trset: async (form) => { const v = form.querySelector('[name=transferCheck]').checked; await commit('Transfer alerts ' + (v ? 'on' : 'off'), (dd) => { dd.settings.reminders.transferCheck = v; touch(dd.settings); }); },
  alerts: async (form) => {
    const fd = new FormData(form);
    await commit('Changed alert settings', (dd) => {
      const r = dd.settings.reminders;
      r.digestDays = Number(fd.get('digestDays')); const l = Number(fd.get('lumpDays')); r.lumpDays = l ? [l] : []; r.reviewDays = Number(fd.get('reviewDays'));
      r.weekly = fd.get('weekly') === 'on'; r.transferCheck = fd.get('transferCheck') === 'on';
      dd.settings.ntfy.server = (fd.get('server') || 'https://ntfy.sh').trim(); touch(dd.settings);
    });
    toast('Saved');
  },
  account: async (form) => {
    const fd = new FormData(form), id = form.dataset.id, name = (fd.get('name') || '').trim();
    if (!name) return;
    closeSheet();
    await commit((id ? 'Edited account ' : 'Added account ') + name, (dd) => {
      const a = id ? C.byId(dd.accounts, id) : { id: C.uid('a'), active: true };
      a.name = name; a.kind = fd.get('kind'); a.note = fd.get('note') || ''; touch(a);
      if (!id) dd.accounts.push(a);
    });
  },
  removeacc: async (form) => {
    const d = doc(), id = form.dataset.id, to = new FormData(form).get('to'), a = C.byId(d.accounts, id);
    const list = C.liveBills(d).filter((b) => b.accountId === id && b.status !== 'stopped');
    if (list.length && !to) return toast('Pick where the bills should go');
    closeSheet();
    await commit('Removed account ' + a.name + (list.length ? ' — moved ' + list.length + ' bills to ' + C.accountName(d, to) : ''), () => {
      for (const b of list) { b.accountId = to; if (b.payMethod !== 'manual') b.todos = (b.todos || []).concat([{ id: C.uid('td'), text: 'Tell ' + (b.provider || 'the provider') + ' about the new account (' + C.accountName(d, to) + ')', done: false }]); touch(b); }
      a.active = false; touch(a);
    });
  },
  movebills: async (form) => {
    const d = doc(), fd = new FormData(form), to = fd.get('to'), ids = fd.getAll('b'), link = fd.get('link') === 'on';
    if (!ids.length) return toast('Tick the bills to move');
    closeSheet();
    await commit('Moved ' + ids.length + ' bills to ' + C.accountName(d, to), () => {
      for (const id of ids) { const b = C.byId(d.bills, id); if (b.accountId === to) continue; b.accountId = to; if (link) b.transferDayBefore = true; if (b.payMethod !== 'manual') b.todos = (b.todos || []).concat([{ id: C.uid('td'), text: 'Tell ' + (b.provider || 'the provider') + ' about the new account (' + C.accountName(d, to) + ')', done: false }]); touch(b); }
    });
  },
  type: async (form) => {
    const fd = new FormData(form), id = form.dataset.id, name = (fd.get('name') || '').trim();
    if (!name) return;
    closeSheet();
    await commit((id ? 'Edited type ' : 'Added type ') + name, (dd) => {
      const t = id ? C.byId(dd.types, id) : { id: C.uid('t'), order: Math.max(0, ...dd.types.map((x) => x.order || 0)) + 1 };
      t.name = name; t.color = fd.get('color') || t.color || '#4C7A9A'; touch(t);
      if (!id) dd.types.push(t);
    });
  },
  property: async (form) => {
    const fd = new FormData(form), id = form.dataset.id, name = (fd.get('name') || '').trim();
    if (!name) return;
    closeSheet();
    await commit((id ? 'Edited property ' : 'Added property ') + name, (dd) => {
      const p = id ? C.byId(dd.properties, id) : { id: C.uid('p'), rents: [], vacancies: [] };
      p.name = name; p.manager = fd.get('manager') || ''; p.status = fd.get('status'); p.soldAt = fd.get('soldAt') || null;
      p.expectedWeekly = fd.get('expectedWeekly') === '' ? null : Number(fd.get('expectedWeekly'));
      if (p.status === 'sold' && !p.soldAt) p.soldAt = today();
      if (C.isISO(fd.get('vacFrom'))) p.vacancies = (p.vacancies || []).concat([{ id: C.uid('v'), from: fd.get('vacFrom'), to: fd.get('vacTo') || null }]);
      if (p.status === 'sold') for (const b of dd.bills) if (b.propertyId === p.id && b.status === 'active') { b.status = 'stopped'; b.stoppedAt = p.soldAt; touch(b); }
      touch(p); if (!id) dd.properties.push(p);
    });
  },
  rent: async (form) => {
    const fd = new FormData(form), p = C.byId(doc().properties, form.dataset.id), w = Number(fd.get('weekly')), from = fd.get('from');
    if (!(w > 0) || !C.isISO(from)) return toast('Enter the weekly rent and start date');
    closeSheet();
    await commit(p.name + ' rent ' + C.money(w) + '/wk from ' + C.fmtDate(from, { dow: false, year: true }), () => { p.rents = (p.rents || []).filter((r) => r.from !== from).concat([{ id: C.uid('r'), from, weekly: w }]); if (p.status === 'expected') p.status = 'active'; touch(p); });
  },
  other: async (form) => {
    const fd = new FormData(form), id = form.dataset.id, name = (fd.get('name') || '').trim();
    if (!name) return; closeSheet();
    await commit((id ? 'Renamed ' : 'Added ') + name, (dd) => { const o = id ? C.byId(dd.others, id) : { id: C.uid('o') }; o.name = name; touch(o); if (!id) dd.others = (dd.others || []).concat([o]); });
  },
  connect: async (form) => {
    const fd = new FormData(form);
    const gh = { owner: fd.get('owner').trim(), repo: fd.get('repo').trim(), token: fd.get('token').trim() };
    const pass = fd.get('pass'), name = fd.get('name').trim();
    if (pass.length < 12) return toast('Use a passphrase of at least 12 characters');
    if (pass !== fd.get('pass2')) return toast("The two passphrases don't match");
    toast('Checking GitHub…', 8000);
    try {
      await St.ghCheck(gh);
      S.dev = { ...S.dev, github: gh, passphrase: pass, name: name || S.dev.name };
      if (S.doc) { touch(S.doc.settings); }
      const restoring = !S.doc;
      const r = await St.sync(S.doc || St.joinDoc(), S.dev, restoring ? 'Restored on this phone' : 'First backup');
      if (restoring && !C.liveBills(r.doc).length && !r.doc.people.length) { const fresh = St.emptyDoc(); fresh.trackedFrom = today(); r.doc = C.mergeDocs(r.doc, fresh); }
      S.doc = r.doc; await saveDoc(S.doc); await St.saveDevice(S.dev); S.sync = 'ok';
      toast(restoring && C.liveBills(S.doc).length ? 'Your bills are back — ' + C.liveBills(S.doc).length + ' bills from GitHub' : 'Connected — your bills are backed up', 5000); if (restoring) await askName(); location.hash = restoring && C.liveBills(S.doc).length ? '#/' : '#/sync'; render(); queueDbx(1000);
    } catch (e) { S.dev.github = null; toast(e.message, 6000); }
  },
  join: async (form) => {
    const fd = new FormData(form);
    try {
      const gh = await readSetupCode(fd.get('code'), fd.get('pass'));
      await St.ghCheck(gh);
      S.dev = { ...S.dev, github: gh, passphrase: fd.get('pass'), name: fd.get('name').trim() || S.dev.name };
      const r = await St.sync(S.doc || St.joinDoc(), S.dev, 'Joined');
      S.doc = r.doc; await saveDoc(S.doc); await St.saveDevice(S.dev); S.sync = 'ok';
      toast('Joined — ' + C.liveBills(S.doc).length + ' bills'); location.hash = '#/';
    } catch (e) { toast(e.message, 6000); }
  },
};

// ---------- QR scanning (Android Chrome) ----------
async function startScan() {
  if (!('BarcodeDetector' in window)) return toast('Scanning isn’t available here — paste the code instead');
  const s = openSheet('<h2>Scan the setup code</h2><video playsinline muted style="width:100%;border-radius:12px;background:#000;max-height:50vh"></video><button class="btn ghost" data-act="closesheet">Cancel</button>');
  const video = s.querySelector('video');
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); } catch { closeSheet(); return toast('Camera permission was refused'); }
  video.srcObject = stream; await video.play();
  const det = new window.BarcodeDetector({ formats: ['qr_code'] });
  const stop = () => stream.getTracks().forEach((t) => t.stop());
  s.querySelector('[data-act=closesheet]').onclick = () => { stop(); closeSheet(); };
  const loop = async () => {
    if (!document.body.contains(video)) return stop();
    try { const codes = await det.detect(video); if (codes.length) { stop(); closeSheet(); const ta = document.querySelector('form[data-form=join] [name=code]'); if (ta) ta.value = codes[0].rawValue; toast('Code scanned — now type the passphrase'); return; } } catch {}
    requestAnimationFrame(loop);
  };
  loop();
}

// ---------- Excel CSV (same columns as tab 11's Bills Register) ----------
function registerCSV() {
  const d = doc(), t = today();
  const sheetCat = (b) => b.kind === 'investment' ? 'Properties' : b.typeId === 't_home' ? 'Properties' : b.typeId === 't_kids' ? 'Children' : (C.typeOf(d, b) || {}).name || 'Other';
  const rows = [['Category', 'Bill Name', 'Amount ($)', 'Frequency', 'Due Date(s)', 'Provider / Company', 'Policy / Account #', 'Account Paid From', 'Review Applicable?', 'Last Reviewed', 'Reference Date', 'Notes']];
  for (const b of C.liveBills(d).filter((x) => x.kind !== 'reminder' && x.status !== 'stopped' && !C.isOneOff(x))) {
    const a = C.amountOn(b, C.nextDue(b, t) || t, d);
    rows.push([sheetCat(b), b.name, a ?? '', b.freq || '', b.dueText || '', b.provider || '', b.accountNo || '', b.accountId ? C.accountName(d, b.accountId) : '', b.review && b.review.applicable ? 'YES' : 'NO', (b.review && b.review.last) || '', b.refDate || '', b.notes || '']);
  }
  return rows.map((r) => r.map((v) => { const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
}

// ---------- events ----------
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = A[el.dataset.act];
  if (!fn) return;
  if (el.tagName === 'A') e.preventDefault();
  if (el.type !== 'checkbox') e.preventDefault();
  Promise.resolve(fn(el, e)).catch((err) => { console.error(err); toast(err.message || 'Something went wrong', 5000); });
});
document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const fn = F[form.dataset.form];
  if (fn) Promise.resolve(fn(form)).catch((err) => { console.error(err); toast(err.message || 'Something went wrong', 5000); });
});
document.addEventListener('change', (e) => {
  if (e.target.name === 'includeInTotals') e.target.dataset.inclAuto = '0';
  const form = e.target.closest('form[data-form="bill"]');
  if (form) {
    if (e.target.name === 'payMethod') form.dataset.payTouched = '1';
    // a new one-off bill is usually paid by hand
    if (e.target.name === 'freq' && e.target.value === 'One-off' && !form.dataset.id && !form.dataset.payTouched) { const m = form.querySelector('input[name=payMethod][value=manual]'); if (m) m.checked = true; }
    updateShows(form); saveDraft(form);
  }
  if (e.target.matches('[data-autosave]')) { const f = e.target.closest('form[data-form]'); F[f.dataset.form](f); }
  if (e.target.matches('[data-rinv]')) A.rinv(e.target);
  if (e.target.dataset.input === 'rFrom' || e.target.dataset.input === 'rTo') { S.ui[e.target.dataset.input] = e.target.value; render(); }
});
document.addEventListener('input', (e) => {
  const bf = e.target.closest && e.target.closest('form[data-form="bill"]'); if (bf) saveDraft(bf);
  if (e.target.dataset.input === 'q') { S.ui.q = e.target.value; render(); }
  if (e.target.name === 'amount' && e.target.dataset.cur !== undefined) {
    const p = document.getElementById('amtprev'); const cur = Number(e.target.dataset.cur), v = Number(e.target.value);
    const af = document.getElementById('amtfrom'); if (af) af.hidden = e.target.value === '' || Number(e.target.value) === cur;
    if (p && e.target.value !== '' && cur) p.textContent = (v >= cur ? 'Up ' : 'Down ') + C.money(Math.abs(v - cur)) + ' (' + (v >= cur ? '+' : '−') + Math.abs((v - cur) / cur * 100).toFixed(1) + '%) on ' + C.money(cur) + '.';
  }
});
window.addEventListener('hashchange', onRoute);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (!editing()) render(); queueSync(300); queueDbx(800); } });
window.addEventListener('online', () => { queueSync(300); queueDbx(800); });

// ---------- start ----------
async function start() {
  S.dev = await St.loadDevice();
  S.doc = await St.loadLocal();
  const qp = new URLSearchParams(location.search);
  if (qp.has('code') || qp.has('error')) { onRoute(); await dbxReturn(qp); }
  if (S.doc) { const fixed = C.fixNewBillStarts(S.doc, tz()); if (fixed.length) { fixed.forEach((b) => { b.u = Date.now(); }); S.doc.updatedAt = Date.now(); S.doc.activity = S.doc.activity || []; S.doc.activity.unshift({ id: C.uid('ac'), at: Date.now(), u: Date.now(), by: S.dev.name || 'Me', text: 'Removed the made-up history before ' + fixed.map((b) => b.name + ' was added (' + C.fmtDate(b.startDate, { dow: false }) + ')').join(', ') }); await saveDoc(S.doc); } }
  if (S.doc && recolourTypes(S.doc)) await saveDoc(S.doc);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
  onRoute();
  if (S.dev.github) { S.sync = 'off'; doSync(); setInterval(() => { if (document.visibilityState === 'visible') doSync(); }, 5 * 60 * 1000); }
  if (DB.isOn(S.dev)) { if (!S.dev.github && S.doc) relinkGithub(); queueDbx(1500); setInterval(() => { if (document.visibilityState === 'visible') doDbx(); }, 10 * 60 * 1000); }
}
start();
