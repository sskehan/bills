// Bills app — core logic (no screen code). Used by the phone app, the
// morning-alert job and the tests, so every figure comes from one place.
// Dates are plain 'YYYY-MM-DD' strings and all date maths is done in UTC
// so daylight saving never shifts a due date.

export const FREQS = ['Weekly', 'Fortnightly', 'Monthly', 'Quarterly', 'Annual', 'Every 5 yrs'];
export const PER_YEAR = { Weekly: 52, Fortnightly: 26, Monthly: 12, Quarterly: 4, Annual: 1, 'Every 5 yrs': 0.2 };
const DAY_STEP = { Weekly: 7, Fortnightly: 14 };
const MONTH_STEP = { Monthly: 1, Quarterly: 3, Annual: 12, 'Every 5 yrs': 60 };
export const LUMP = new Set(['Quarterly', 'Annual', 'Every 5 yrs']);
const DAY = 86400000;

// ---------- dates ----------
const pad = (n) => String(n).padStart(2, '0');
export function isISO(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseISO(s)); }
export function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }
export function toISO(t) { const d = new Date(t); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
export function addDays(iso, n) { return toISO(parseISO(iso) + n * DAY); }
export function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / DAY); } // b − a
export function dow(iso) { return new Date(parseISO(iso)).getUTCDay(); }
export function daysInMonth(y, m0) { return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate(); }
// Add months to the ORIGINAL date, clamping to month end (31 Aug + 3 → 30 Nov,
// + 6 → 28/29 Feb, + 9 → 31 May). Never chained, so dates never drift.
export function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const total = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(total / 12), nm = total - ny * 12;
  return ny + '-' + pad(nm + 1) + '-' + pad(Math.min(d, daysInMonth(ny, nm)));
}
export function todayISO(now = new Date(), tz = 'Australia/Sydney') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function hourIn(now = new Date(), tz = 'Australia/Sydney') {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(now)) % 24;
}
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function fmtDate(iso, opts = {}) {
  if (!isISO(iso)) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  let s = (opts.dow === false ? '' : DOW[dow(iso)] + ' ') + d + ' ' + MON[m - 1];
  if (opts.year || (opts.today && y !== Number(opts.today.slice(0, 4)))) s += ' ' + y;
  return s;
}
export function fmtLong(iso) { const [y, m, d] = iso.split('-').map(Number); return DOW_LONG[dow(iso)] + ' ' + d + ' ' + MON_LONG[m - 1] + ' ' + y; }
export function monthName(m0, long = true) { return long ? MON_LONG[m0] : MON[m0]; }
export function dowName(i, long = false) { return long ? DOW_LONG[i] : DOW[i]; }
export function relDays(n) {
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n < 0) return Math.abs(n) + ' days ago';
  return 'In ' + n + ' days';
}
export function isWeekend(iso) { const w = dow(iso); return w === 0 || w === 6; }
export function nextWeekday(iso) { let d = iso; while (isWeekend(d)) d = addDays(d, 1); return d; }

// ---------- money ----------
export function money(n, dp = 2) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const neg = n < 0 ? '−' : '';
  return neg + '$' + Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---------- ids / stamps ----------
export function uid(prefix = 'x') { return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

// ---------- recurrence ----------
// All due dates of a bill between from and to (inclusive), always counted
// from the bill's reference date.
export function occurrences(bill, from, to) {
  if (!bill || !isISO(bill.refDate) || !FREQS.includes(bill.freq)) return [];
  if (bill.status === 'pending' || bill.del) return [];
  const out = [];
  const ref = bill.refDate;
  let end = to;
  if (isISO(bill.endDate) && bill.endDate < end) end = bill.endDate;
  if (bill.status === 'stopped' && isISO(bill.stoppedAt) && bill.stoppedAt < end) end = bill.stoppedAt;
  let start = from;
  if (isISO(bill.startDate) && bill.startDate > start) start = bill.startDate;
  // A 5-yearly date (e.g. a licence expiry) is the next one — don't project backwards.
  if (bill.freq === 'Every 5 yrs' && ref > start) start = ref;
  if (end < start) return out;
  if (DAY_STEP[bill.freq]) {
    const n = DAY_STEP[bill.freq];
    const k = Math.ceil(daysBetween(ref, start) / n);
    for (let d = addDays(ref, k * n); d <= end; d = addDays(d, n)) if (d >= start) out.push(d);
  } else {
    const m = MONTH_STEP[bill.freq];
    const [ry, rm] = ref.split('-').map(Number);
    const [sy, sm] = start.split('-').map(Number);
    let k = Math.floor(((sy - ry) * 12 + (sm - rm)) / m) - 1;
    for (let guard = 0; guard < 2000; guard++, k++) {
      const d = addMonths(ref, k * m);
      if (d > end) break;
      if (d >= start) out.push(d);
    }
  }
  return out;
}
export function nextDue(bill, today) {
  const far = addDays(today, 366 * 6);
  const o = occurrences(bill, today, far);
  return o.length ? o[0] : null;
}
export function prevDue(bill, today) {
  const o = occurrences(bill, addDays(today, -366 * 6), addDays(today, -1));
  return o.length ? o[o.length - 1] : null;
}

// ---------- pay ----------
export function paydays(settings, from, to) {
  const base = settings && settings.payday && settings.payday.base;
  if (!isISO(base)) return [];
  return occurrences({ refDate: base, freq: 'Fortnightly' }, from, to);
}
export function payOn(person, iso) {
  if (!person || !Array.isArray(person.pays) || !person.pays.length) return null;
  const list = person.pays.filter((p) => !p.del).slice().sort((a, b) => (a.from < b.from ? -1 : 1));
  let cur = null;
  for (const p of list) if (p.from <= iso) cur = p;
  return cur;
}
export function payOverride(doc, personId, payday) {
  return (doc.payOverrides || []).find((o) => !o.del && o.personId === personId && o.date === payday) || null;
}
export function takeHomeFor(doc, personId, payday) {
  const ov = payOverride(doc, personId, payday);
  if (ov && typeof ov.takeHome === 'number') return ov.takeHome;
  const p = payOn((doc.people || []).find((x) => x.id === personId), payday);
  return p && typeof p.takeHome === 'number' ? p.takeHome : null;
}

// ---------- amounts ----------
export function baseAmountOn(bill, iso) {
  const list = (bill.amounts || []).filter((a) => typeof a.amount === 'number').slice().sort((a, b) => (a.from < b.from ? -1 : 1));
  if (!list.length) return null;
  let cur = list[0].amount;
  for (const a of list) if (a.from <= iso) cur = a.amount;
  return cur;
}
// Amount of one occurrence. "% of pay" bills use that fortnight's pay.
export function amountOn(bill, iso, doc) {
  if (bill.amountMode === 'percentPay' && doc && typeof bill.percent === 'number') {
    const person = (doc.people || []).find((p) => p.id === bill.personId);
    const pd = paydays(doc.settings, addDays(iso, -13), iso);
    const payday = pd.length ? pd[pd.length - 1] : iso;
    const ov = payOverride(doc, bill.personId, payday);
    const pay = payOn(person, payday);
    const field = bill.percentBase === 'takeHome' ? 'takeHome' : 'gross';
    const v = ov && typeof ov[field] === 'number' ? ov[field] : pay && typeof pay[field] === 'number' ? pay[field] : null;
    if (v !== null) return round2(v * bill.percent / 100);
  }
  return baseAmountOn(bill, iso);
}
export function isEstimate(bill) { return bill.amountMode && bill.amountMode !== 'fixed'; }
export function annualAmount(bill, today, doc) {
  const a = amountOn(bill, today, doc);
  return a === null || !PER_YEAR[bill.freq] ? 0 : a * PER_YEAR[bill.freq];
}

// ---------- classification ----------
export function liveBills(doc) { return (doc.bills || []).filter((b) => !b.del); }
export function inTotals(bill) {
  if (bill.kind === 'reminder') return false;
  if (typeof bill.includeInTotals === 'boolean') return bill.includeInTotals;
  return bill.kind === 'household';
}
export function group(bill) {
  if (bill.kind === 'reminder') return 'reminder';
  if (bill.kind === 'investment') return inTotals(bill) ? 'household' : 'investment';
  return inTotals(bill) ? 'household' : 'excluded';
}

// ---------- paid state ----------
export function paymentFor(doc, billId, due) {
  return (doc.payments || []).find((p) => !p.del && p.billId === billId && p.due === due) || null;
}
// 'paid' | 'due' (today or later, not paid) | 'overdue' (manual, past, unpaid) | 'missed' (debit flagged as not coming out)
export function payState(doc, bill, due, today) {
  const p = paymentFor(doc, bill.id, due);
  if (p && p.status === 'missed') return 'missed';
  if (p) return 'paid';
  const tracked = doc.trackedFrom || '0000-01-01';
  if (due < tracked) return 'paid';
  if (bill.payMethod === 'manual') return due < today ? 'overdue' : 'due';
  return due < today ? 'paid' : 'due';
}

// ---------- reviews (same rules as tab 11) ----------
export function reviewInfo(bill, today) {
  const r = bill.review || {};
  if (!r.applicable) return { status: 'na', label: 'N/A' };
  if (!isISO(r.last)) return { status: 'never', label: 'Never reviewed' };
  if (r.last > today) return { status: 'future', label: 'Date is in the future', next: addMonths(r.last, 12) };
  const next = addMonths(r.last, 12);
  if (today > next) return { status: 'overdue', label: 'Overdue', next };
  if (daysBetween(today, next) <= 30) return { status: 'soon', label: 'Due soon', next };
  return { status: 'ok', label: 'Up to date', next };
}
export function reviewCurrent(bill, today) { const s = reviewInfo(bill, today).status; return s === 'ok' || s === 'soon'; }

// ---------- lookups ----------
export function byId(list, id) { return (list || []).find((x) => x.id === id && !x.del) || null; }
export function accountName(doc, id) { const a = byId(doc.accounts, id); return a ? a.name : 'No account set'; }
export function typeOf(doc, bill) { return byId(doc.types, bill.typeId); }
export function typeColor(doc, bill) {
  if (bill.kind === 'reminder') return '#8A948D';
  const t = typeOf(doc, bill); return t ? t.color : '#8A948D';
}

// ---------- schedule helpers ----------
// Every unpaid / upcoming occurrence in a window, newest information applied.
export function schedule(doc, from, to, today, filter = () => true) {
  const out = [];
  for (const b of liveBills(doc)) {
    if (!filter(b)) continue;
    for (const d of occurrences(b, from, to)) {
      const amt = amountOn(b, d, doc);
      out.push({ bill: b, due: d, amount: amt, state: payState(doc, b, d, today), group: group(b) });
    }
  }
  out.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.bill.name.localeCompare(b.bill.name)));
  return out;
}
export function sumAmounts(items) { return round2(items.reduce((a, i) => a + (i.amount || 0), 0)); }

export function totalsByType(doc, items) {
  const map = new Map();
  for (const i of items) {
    const t = typeOf(doc, i.bill);
    const key = t ? t.id : 'none';
    const cur = map.get(key) || { type: t, name: t ? t.name : 'Other', color: t ? t.color : '#8A948D', total: 0, count: 0 };
    cur.total += i.amount || 0; cur.count++;
    map.set(key, cur);
  }
  return [...map.values()].map((x) => ({ ...x, total: round2(x.total) }));
}

// Day-before transfers from savings to personal.
export function transfers(doc, from, to, today) {
  const items = schedule(doc, addDays(from, 1), addDays(to, 1), today, (b) => b.transferDayBefore && b.status === 'active');
  const days = new Map();
  for (const i of items) {
    const t = addDays(i.due, -1);
    if (t < from || t > to) continue;
    const cur = days.get(t) || { date: t, items: [], total: 0 };
    cur.items.push(i); cur.total = round2(cur.total + (i.amount || 0));
    days.set(t, cur);
  }
  return [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).map((d) => ({ ...d, check: ((doc.transferChecks || {})[d.date] && !(doc.transferChecks || {})[d.date].undone) ? doc.transferChecks[d.date] : null }));
}

// Things that need attention, highest first (mirrors tab 11's follow-ups).
export function followUps(doc, today) {
  const out = [];
  for (const b of liveBills(doc)) {
    if (b.status === 'stopped') continue;
    const name = b.name;
    if (b.status === 'pending') { out.push({ bill: b, p: 3, text: 'Not started yet — add the details when known' }); continue; }
    const nd = nextDue(b, today);
    const days = nd ? daysBetween(today, nd) : null;
    const rv = reviewInfo(b, today);
    const amt = nd ? amountOn(b, nd, doc) : baseAmountOn(b, today);
    const t = [];
    let p = 9;
    if (b.payMethod === 'manual') {
      const past = occurrences(b, addDays(today, -60), addDays(today, -1)).filter((d) => payState(doc, b, d, today) === 'overdue');
      if (past.length) { p = 1; t.push('Not paid yet — was due ' + fmtDate(past[past.length - 1])); }
    }
    if (nd && b.freq === 'Every 5 yrs' && days <= 90) { p = Math.min(p, 1); t.push('Renewal due ' + fmtDate(nd, { year: true }) + ' — renew'); }
    if (nd && LUMP.has(b.freq) && days <= 14) { p = Math.min(p, 1); t.push(money(amt, 0) + ' lump sum due in ' + days + ' day(s)' + (b.payMethod === 'manual' ? ' — pay it yourself' : b.accountId ? ' — check funds in ' + accountName(doc, b.accountId) : '')); }
    if (nd && rv.status !== 'na' && (b.freq === 'Annual' || b.freq === 'Every 5 yrs') && days <= 45 && !reviewCurrentStrict(b, today)) { p = Math.min(p, 1); t.push('Renews in ' + days + ' days — review & compare before it renews'); }
    if (rv.status === 'overdue') { p = Math.min(p, 1); t.push('Review overdue (last reviewed ' + fmtDate(b.review.last, { year: true }) + ')'); }
    if (rv.status === 'future') { p = Math.min(p, 2); t.push('Last-reviewed date is in the future — check it'); }
    if (rv.status === 'never') { p = Math.min(p, 2); t.push("Never reviewed — check you're on the best deal"); }
    if (rv.status === 'soon') { p = Math.min(p, 2); t.push('Review due by ' + fmtDate(rv.next, { year: true })); }
    for (const td of b.todos || []) if (!td.done && !td.del) { p = Math.min(p, 2); t.push(td.text); }
    if (!nd && !isISO(b.refDate)) { p = Math.min(p, 3); t.push('No due date — add one due date'); }
    if (amt === null) { p = Math.min(p, 3); t.push('No amount yet'); }
    else if (amt === 0) { p = Math.min(p, 3); t.push('Amount is $0 — confirm or remove'); }
    if (b.expectedChange) { p = Math.min(p, 3); t.push('Expected change: ' + b.expectedChange); }
    if (b.kind !== 'reminder' && !b.provider) { p = Math.min(p, 3); t.push('Provider missing'); }
    if (t.length) out.push({ bill: b, p, text: t.join(' · '), next: nd, days });
  }
  out.sort((a, b) => a.p - b.p || (a.days ?? 9999) - (b.days ?? 9999));
  return out;
}
// tab 11 treats a review as current while today <= next review date
function reviewCurrentStrict(bill, today) { const r = reviewInfo(bill, today); return r.status === 'ok' || r.status === 'soon'; }

// ---------- reports ----------
export function fyStart(iso) { const [y, m] = iso.split('-').map(Number); return (m >= 7 ? y : y - 1) + '-07-01'; }
export function periodRange(kind, anchor, doc) {
  const [y, m] = anchor.split('-').map(Number);
  if (kind === 'month') { const s = y + '-' + pad(m) + '-01'; return { from: s, to: addDays(addMonths(s, 1), -1), label: monthName(m - 1) + ' ' + y }; }
  if (kind === 'quarter') { const qm = Math.floor((m - 1) / 3) * 3 + 1; const s = y + '-' + pad(qm) + '-01'; return { from: s, to: addDays(addMonths(s, 3), -1), label: 'Quarter ' + monthName(qm - 1, false) + '–' + monthName(qm + 1, false) + ' ' + y }; }
  if (kind === 'fy') { const s = fyStart(anchor); const e = addDays(addMonths(s, 12), -1); return { from: s, to: e, label: 'Financial year ' + s.slice(0, 4) + '–' + e.slice(2, 4) }; }
  if (kind === 'cal') { return { from: y + '-01-01', to: y + '-12-31', label: 'Calendar year ' + y }; }
  if (kind === 'pay') {
    const pd = paydays(doc.settings, addDays(anchor, -13), anchor);
    const s = pd.length ? pd[pd.length - 1] : anchor;
    return { from: s, to: addDays(s, 13), label: 'Pay fortnight ' + fmtDate(s) + ' – ' + fmtDate(addDays(s, 13), { year: true }) };
  }
  return { from: anchor, to: anchor, label: anchor };
}
export function shiftPeriod(kind, anchor, dir) {
  if (kind === 'month') return addMonths(anchor, dir);
  if (kind === 'quarter') return addMonths(anchor, 3 * dir);
  if (kind === 'fy' || kind === 'cal') return addMonths(anchor, 12 * dir);
  if (kind === 'pay') return addDays(anchor, 14 * dir);
  return anchor;
}

// Rent received in a period (weekly rent counted per day, so part-weeks are fair).
export function rentIn(doc, property, from, to) {
  if (!property || property.del) return 0;
  const rents = (property.rents || []).filter((r) => !r.del && isISO(r.from) && typeof r.weekly === 'number').sort((a, b) => (a.from < b.from ? -1 : 1));
  if (!rents.length) return 0;
  let total = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (isISO(property.soldAt) && d > property.soldAt) break;
    if ((property.vacancies || []).some((v) => !v.del && d >= v.from && d <= (v.to || '9999-12-31'))) continue;
    let cur = null;
    for (const r of rents) if (r.from <= d) cur = r;
    if (cur) total += cur.weekly / 7;
  }
  return round2(total);
}
export function propertyCosts(doc, propertyId, from, to, today) {
  return sumAmounts(schedule(doc, from, to, today, (b) => b.kind === 'investment' && (b.propertyId || null) === (propertyId || null)));
}

// Price history of one bill, oldest first, with % change.
export function priceHistory(bill) {
  const list = (bill.amounts || []).filter((a) => typeof a.amount === 'number').slice().sort((a, b) => (a.from < b.from ? -1 : 1));
  return list.map((a, i) => {
    const prev = i ? list[i - 1].amount : null;
    return { ...a, change: prev === null ? null : round2(a.amount - prev), pct: prev ? round2((a.amount - prev) / prev * 100) : null };
  });
}
export function priceChanges(doc, from, to) {
  const out = [];
  for (const b of liveBills(doc)) {
    for (const h of priceHistory(b)) if (h.change !== null && h.from >= from && h.from <= to) out.push({ bill: b, ...h });
  }
  return out.sort((a, b) => (a.from < b.from ? -1 : 1));
}

// ---------- merging two copies (Shaun's and Lyndsey's phones) ----------
const COLLECTIONS = ['accounts', 'types', 'properties', 'bills', 'payments', 'people', 'others', 'payOverrides'];
function mergeList(a = [], b = []) {
  const map = new Map();
  for (const x of a) map.set(x.id, x);
  for (const y of b) { const x = map.get(y.id); if (!x || (y.u || 0) > (x.u || 0)) map.set(y.id, y); }
  return [...map.values()];
}
export function mergeDocs(a, b) {
  if (!a) return b; if (!b) return a;
  const out = { ...a };
  for (const k of COLLECTIONS) out[k] = mergeList(a[k], b[k]);
  out.settings = ((b.settings && b.settings.u) || 0) > ((a.settings && a.settings.u) || 0) ? b.settings : a.settings;
  const tc = { ...(a.transferChecks || {}) };
  for (const [k, v] of Object.entries(b.transferChecks || {})) if (!tc[k] || (v.u || 0) > (tc[k].u || 0)) tc[k] = v;
  out.transferChecks = tc;
  const acts = mergeList(a.activity, b.activity).sort((x, y) => (y.at || 0) - (x.at || 0)).slice(0, 400);
  out.activity = acts;
  out.trackedFrom = [a.trackedFrom, b.trackedFrom].filter(Boolean).sort()[0] || null;
  out.schema = Math.max(a.schema || 1, b.schema || 1);
  out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
  return out;
}

// ---------- validation ----------
export function validateBill(b, today) {
  const errs = [];
  if (!b.name || !b.name.trim()) errs.push('Give the bill a name.');
  if (b.status !== 'pending') {
    if (!FREQS.includes(b.freq)) errs.push('Choose how often it comes.');
    if (!isISO(b.refDate)) errs.push('Add one due date (past or upcoming).');
  }
  for (const a of b.amounts || []) if (typeof a.amount === 'number' && (a.amount < 0 || a.amount > 10000000)) errs.push('Check the amount.');
  if (b.review && b.review.applicable && isISO(b.review.last) && b.review.last > today) errs.push("Last reviewed can't be in the future.");
  if (isISO(b.endDate) && isISO(b.refDate) && b.endDate < b.refDate) errs.push('End date is before the due date.');
  if (b.amountMode === 'percentPay' && !(b.percent > 0 && b.percent < 100)) errs.push('Set the % of pay.');
  return errs;
}

// ---------- alerts (used by the 7 am / 6 pm job) ----------
export function alertLine(i, today) {
  const wk = isWeekend(i.due) && i.bill.payMethod !== 'manual' ? ' (may come out ' + fmtDate(nextWeekday(i.due)) + ')' : '';
  const est = isEstimate(i.bill) ? '≈' : '';
  const mine = i.bill.payMethod === 'manual' ? ' — pay yourself' : '';
  return i.bill.name + ' ' + est + money(i.amount) + wk + mine;
}
export function buildAlerts(doc, now = new Date()) {
  const tz = (doc.settings && doc.settings.timezone) || 'Australia/Sydney';
  const today = todayISO(now, tz);
  const hour = hourIn(now, tz);
  const s = doc.settings || {};
  const r = s.reminders || {};
  const out = { morning: [], evening: [], today, hour };
  const digestDays = r.digestDays ?? 3;
  const lumpDays = r.lumpDays || [14];
  const reviewDays = r.reviewDays ?? 45;
  const active = (b) => b.status === 'active' && b.remind !== false;

  // Morning digest: anything due today .. +digestDays not yet paid.
  const soon = schedule(doc, today, addDays(today, digestDays), today, active).filter((i) => i.state === 'due');
  if (soon.length) {
    const byDay = new Map();
    for (const i of soon) { const k = i.due; if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(i); }
    const lines = [...byDay.entries()].map(([d, list]) => {
      const n = daysBetween(today, d);
      const label = n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : fmtDate(d);
      return label + ': ' + list.map((i) => alertLine(i, today)).join(' · ');
    });
    out.morning.push({ title: soon.length + (soon.length === 1 ? ' bill' : ' bills') + ' in the next ' + digestDays + ' days — ' + money(sumAmounts(soon)), message: lines.join('\n'), tags: ['calendar'], priority: 3 });
  }
  // Big one-off bills N days out.
  for (const n of lumpDays) {
    if (n <= digestDays) continue;
    const d = addDays(today, n);
    for (const i of schedule(doc, d, d, today, (b) => active(b) && LUMP.has(b.freq))) {
      if (i.state !== 'due') continue;
      const rv = reviewInfo(i.bill, today);
      const extra = rv.status !== 'na' && !reviewCurrent(i.bill, today) ? ' Review due — compare quotes before it renews.' : '';
      out.morning.push({ title: 'Big bill in ' + n + ' days', message: i.bill.name + ' ' + money(i.amount) + ' · due ' + fmtDate(i.due) + '.' + extra, tags: ['moneybag'], priority: 4 });
    }
  }
  // Pay-yourself bills that are overdue: every morning until ticked.
  const overdue = schedule(doc, addDays(today, -60), addDays(today, -1), today, (b) => active(b) && b.payMethod === 'manual').filter((i) => i.state === 'overdue');
  for (const i of overdue) out.morning.push({ title: 'Not paid yet', message: i.bill.name + ' ' + money(i.amount) + ' was due ' + fmtDate(i.due) + '. Tick it in Bills once paid.', tags: ['warning'], priority: 4 });
  // Transfers that should happen today.
  const tr = transfers(doc, today, today, today);
  for (const t of tr) out.morning.push({ title: 'Savings → personal today: ' + money(t.total), message: 'For ' + t.items.map((i) => i.bill.name + ' ' + (isEstimate(i.bill) ? '≈' : '') + money(i.amount)).join(' · ') + ' due ' + fmtDate(addDays(t.date, 1)) + '. Tick it in Bills when you see it go through.', tags: ['arrows_counterclockwise'], priority: 3 });
  // Reviews, once a week on Mondays.
  if (dow(today) === 1) {
    const rv = [];
    for (const b of liveBills(doc)) {
      if (b.status !== 'active') continue;
      const info = reviewInfo(b, today);
      if (!['soon', 'overdue', 'never', 'future'].includes(info.status)) continue;
      const nd = nextDue(b, today);
      const renew = nd && (b.freq === 'Annual' || b.freq === 'Every 5 yrs') && daysBetween(today, nd) <= reviewDays ? ' (renews ' + fmtDate(nd) + ')' : '';
      rv.push(b.name + ' — ' + (info.status === 'soon' ? 'review by ' + fmtDate(info.next, { year: true }) : info.label.toLowerCase()) + renew);
    }
    if (rv.length) out.morning.push({ title: rv.length + ' bill review' + (rv.length > 1 ? 's' : '') + ' due', message: rv.join('\n'), tags: ['mag'], priority: 2 });
  }
  // Evening: transfer not ticked yet.
  for (const t of tr) if (!t.check) out.evening.push({ title: 'Transfer not ticked: ' + money(t.total), message: 'It should have moved from savings to personal today for ' + t.items.map((i) => i.bill.name).join(', ') + '. Move it by hand if it hasn\'t, then tick it in Bills.', tags: ['warning'], priority: 4 });
  // Sunday evening: the week ahead.
  if (dow(today) === 0 && r.weekly !== false) {
    const wk = schedule(doc, addDays(today, 1), addDays(today, 7), today, (b) => active(b) && inTotals(b));
    if (wk.length) {
      const top = wk.slice().sort((a, b) => (b.amount || 0) - (a.amount || 0)).slice(0, 2);
      out.evening.push({ title: 'This week: ' + wk.length + ' bills — ' + money(sumAmounts(wk)), message: 'Biggest: ' + top.map((i) => i.bill.name + ' ' + money(i.amount) + ' ' + fmtDate(i.due)).join(' · '), tags: ['spiral_calendar'], priority: 2 });
    }
  }
  return out;
}
