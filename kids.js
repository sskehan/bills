// Kids — costs for Alex & Emma shared with their other parent (1.45).
// Pure calculations only. Nothing in here writes to bills, payments or settings:
// it only READS the bills you've ticked as Shared, and keeps its own lists
// (kidShares, kidExpenses, kidPayments, kidsCfg).
import * as C from './core.js';

export const CATEGORIES = ['Medical', 'Pharmacy', 'School', 'Activities', 'Tutoring', 'Clothing', 'Other'];
export const METHODS = ['Bank transfer', 'Child support account', 'Direct deposit', 'Cash', 'Other'];

export function cfg(doc) {
  const c = (doc && doc.kidsCfg) || {};
  return {
    children: Array.isArray(c.children) && c.children.length ? c.children : ['Alex', 'Emma'],
    other: c.other || 'Heidi',
    me: c.me || 'Shaun',
    pct: typeof c.pct === 'number' ? c.pct : 50,
    opening: c.opening && C.isISO(c.opening.date) ? c.opening : { date: '2000-01-01', amount: 0 },
    closed: c.closed || {},
    sent: c.sent || {},
    setupDone: !!c.setupDone,
  };
}
const live = (list) => (list || []).filter((x) => !x.del);
export const shares = (doc) => live(doc.kidShares).filter((s) => s.on !== false);
export function shareFor(doc, billId) { return shares(doc).find((s) => s.billId === billId) || null; }
// "Taekwondo — Emma" stays as is; "Dr Le" becomes "Dr Le — Emma"
export function itemName(doc, e) {
  const lab = childLabel(doc, e.child);
  if (!lab) return e.desc;
  const d = String(e.desc || '').toLowerCase();
  const names = e.child === 'Both' ? cfg(doc).children : [e.child];
  return names.every((n) => d.includes(String(n).toLowerCase())) ? e.desc : e.desc + ' — ' + lab;
}
export function childLabel(doc, child) {
  const k = cfg(doc).children;
  return child === 'Both' ? k.join(' & ') : child || '';
}

// What one charge does to the balance. + = the other parent owes me more.
export function effect(amount, payer, otherPct) {
  const p = typeof otherPct === 'number' ? otherPct : 50;
  // not rounded per item — totals are rounded once, the same way tab 6 does it
  return payer === 'other' ? -(amount * (100 - p) / 100) : amount * p / 100;
}

// Every shared-bill charge, expense and payment between from and to (inclusive),
// never later than today (like tab 6: future items count once their date arrives).
export function entries(doc, from, to, today) {
  const end = to < today ? to : today;
  const out = [];
  if (end < from) return out;
  for (const s of shares(doc)) {
    const b = (doc.bills || []).find((x) => x.id === s.billId && !x.del);
    if (!b) continue;
    const st = C.isISO(s.from) && s.from > from ? s.from : from;
    // the share's own "counted from" date decides where Kids starts, not the bill's Started date
    const bb = C.isISO(b.startDate) ? { ...b, startDate: null } : b;
    for (const d of C.occurrences(bb, st, end)) {
      const p = C.paymentFor(doc, b.id, d);
      if (p && p.status === 'missed') continue; // the debit didn't come out
      const amt = p && p.status === 'paid' && typeof p.amount === 'number' ? p.amount : C.amountOn(b, d, doc);
      if (typeof amt !== 'number') continue;
      out.push({ kind: 'bill', id: b.id + '@' + d, billId: b.id, date: d, child: s.child, desc: b.name, amount: amt, payer: s.payer || 'me', otherPct: s.otherPct, effect: effect(amt, s.payer || 'me', s.otherPct) });
    }
  }
  for (const e of live(doc.kidExpenses)) {
    if (!C.isISO(e.date) || e.date < from || e.date > end || typeof e.amount !== 'number') continue;
    out.push({ kind: 'expense', id: e.id, date: e.date, child: e.child, desc: e.desc, category: e.category, notes: e.notes, amount: e.amount, payer: e.payer, otherPct: e.otherPct, effect: effect(e.amount, e.payer, e.otherPct) });
  }
  for (const p of live(doc.kidPayments)) {
    if (!C.isISO(p.date) || p.date < from || p.date > end || typeof p.amount !== 'number') continue;
    out.push({ kind: 'payment', id: p.id, date: p.date, amount: p.amount, direction: p.direction, method: p.method, forMonth: p.forMonth, notes: p.notes, effect: p.direction === 'out' ? C.round2(p.amount) : -C.round2(p.amount) });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.kind === 'payment') - (b.kind === 'payment') || String(a.desc || '').localeCompare(String(b.desc || ''))));
  return out;
}

// Balance at the end of a date (+ = the other parent owes me).
export function balanceAt(doc, iso, today) {
  const c = cfg(doc);
  const list = entries(doc, c.opening.date, iso, today);
  return C.round2((c.opening.amount || 0) + list.reduce((a, e) => a + e.effect, 0));
}

export function monthRange(ym) { const s = ym + '-01'; return { from: s, to: C.addDays(C.addMonths(s, 1), -1) }; }

// One month, as the statement shows it.
export function month(doc, ym, today) {
  const { from, to } = monthRange(ym);
  const list = entries(doc, from, to, today);
  const items = list.filter((e) => e.kind !== 'payment');
  const pays = list.filter((e) => e.kind === 'payment');
  const total = C.round2(items.reduce((a, e) => a + e.amount, 0));
  const paidMe = C.round2(items.filter((e) => e.payer !== 'other').reduce((a, e) => a + e.amount, 0));
  const paidOther = C.round2(total - paidMe);
  const otherOwes = C.round2(items.filter((e) => e.payer !== 'other').reduce((a, e) => a + e.effect, 0));
  const iOwe = C.round2(-items.filter((e) => e.payer === 'other').reduce((a, e) => a + e.effect, 0));
  const net = C.round2(otherOwes - iOwe);
  const received = C.round2(pays.filter((p) => p.direction !== 'out').reduce((a, p) => a + p.amount, 0));
  const paidOut = C.round2(pays.filter((p) => p.direction === 'out').reduce((a, p) => a + p.amount, 0));
  const asAt = to < today ? to : today;
  return { ym, from, to, asAt, items, pays, total, paidMe, paidOther, otherOwes, iOwe, net, received, paidOut, balance: balanceAt(doc, asAt, today), partial: to > today };
}

// Twelve months of a year plus the year's totals.
export function year(doc, y, today) {
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const ym = y + '-' + String(m).padStart(2, '0');
    if (ym + '-01' > today) { months.push({ ym, future: true, total: 0, paidMe: 0, paidOther: 0 }); continue; }
    months.push(month(doc, ym, today));
  }
  const sum = (k) => C.round2(months.reduce((a, m) => a + (m[k] || 0), 0));
  const start = y + '-01-01', end = y + '-12-31';
  const all = entries(doc, start, end, today);
  const pays = all.filter((e) => e.kind === 'payment');
  return {
    y, months, total: sum('total'), paidMe: sum('paidMe'), paidOther: sum('paidOther'), otherOwes: sum('otherOwes'), iOwe: sum('iOwe'),
    received: sum('received'), paidOut: sum('paidOut'), pays,
    broughtForward: balanceAt(doc, C.addDays(start, -1), today),
    closing: balanceAt(doc, end < today ? end : today, today),
  };
}

// Shared bills still to come (for the Kids home screen).
export function upcoming(doc, today, days = 21) {
  const out = [];
  for (const s of shares(doc)) {
    const b = (doc.bills || []).find((x) => x.id === s.billId && !x.del);
    if (!b) continue;
    const st = C.isISO(s.from) && s.from > C.addDays(today, 1) ? s.from : C.addDays(today, 1);
    for (const d of C.occurrences(b, st, C.addDays(today, days))) {
      const a = C.amountOn(b, d, doc);
      if (typeof a !== 'number') continue;
      out.push({ bill: b, date: d, child: s.child, amount: a, payer: s.payer || 'me', theirPart: Math.abs(effect(a, s.payer || 'me', s.otherPct)) });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

// A closed year can't be changed (its statement was final).
export function locked(doc, iso) { return !!(iso && cfg(doc).closed[iso.slice(0, 4)]); }

// ---------- "count shared bills at my share" (per phone, off by default) ----------
// The fraction of a bill's amount that is yours, if it's shared on that date. 1 = not shared.
export function myFraction(doc, bill, iso) {
  const s = shareFor(doc, bill.id);
  if (!s || (C.isISO(s.from) && iso < s.from)) return 1;
  const p = typeof s.otherPct === 'number' ? s.otherPct : 50;
  return (100 - p) / 100;
}

// ---------- statement as text (for messages) ----------
export function statementText(doc, m) {
  const c = cfg(doc);
  const lines = [];
  const mName = C.monthName(Number(m.ym.slice(5, 7)) - 1) + ' ' + m.ym.slice(0, 4);
  lines.push("Kids' expenses — " + mName + (m.partial ? ' (to ' + C.fmtDate(m.asAt, { dow: false }) + ')' : ''));
  lines.push(c.children.join(' & ') + ' · ' + (m.items[0] && m.items[0].otherPct && m.items[0].otherPct !== 50 ? 'shared' : '50/50'));
  lines.push('');
  for (const e of m.items) lines.push(C.fmtDate(e.date, { dow: false }) + ' · ' + itemName(doc, e) + ' · ' + C.money(e.amount) + ' · paid by ' + (e.payer === 'other' ? c.other : c.me));
  if (!m.items.length) lines.push('No expenses this month.');
  lines.push('');
  lines.push('Total: ' + C.money(m.total));
  lines.push(c.other + "'s share of what " + c.me + ' paid: ' + C.money(m.otherOwes));
  lines.push(c.me + "'s share of what " + c.other + ' paid: ' + C.money(m.iOwe));
  lines.push(m.net >= 0 ? 'This month: ' + c.other + ' owes ' + c.me + ' ' + C.money(m.net) : 'This month: ' + c.me + ' owes ' + c.other + ' ' + C.money(-m.net));
  if (m.received) lines.push('Paid by ' + c.other + ' this month: ' + C.money(m.received));
  if (m.paidOut) lines.push('Paid by ' + c.me + ' this month: ' + C.money(m.paidOut));
  lines.push(balanceLine(doc, m.balance, m.asAt));
  return lines.join('\n');
}
export function balanceLine(doc, bal, iso) {
  const c = cfg(doc);
  const when = 'Balance at ' + C.fmtDate(iso, { dow: false, year: true }) + ': ';
  if (Math.abs(bal) < 0.005) return when + 'all square';
  return when + (bal > 0 ? c.other + ' owes ' + c.me + ' ' + C.money(bal) : c.me + ' owes ' + c.other + ' ' + C.money(-bal));
}

// ---------- one-time import of tab 6 history ----------
// rows already imported (by key) are skipped, so running it twice changes nothing.
export function planImport(doc, file, today) {
  if (!file || file.kind !== 'bills-kids-import') throw new Error('This is not a Kids import file.');
  const have = new Set([...(doc.kidExpenses || []), ...(doc.kidPayments || [])].map((x) => x.id));
  const exps = [], pays = [], skipped = [];
  for (const r of file.expenses || []) {
    const id = 'kx_' + r.key;
    if (have.has(id)) { skipped.push({ r, why: 'already imported' }); continue; }
    if (r.bill) {
      const s = shares(doc).find((sh) => { const b = (doc.bills || []).find((x) => x.id === sh.billId && !x.del); return b && matches(b.name, r.bill); });
      if (s && C.isISO(s.from) && r.date >= s.from) { skipped.push({ r, why: 'covered by the shared bill' }); continue; }
    }
    exps.push({ id, date: r.date, child: r.child, desc: r.desc, amount: r.amount, payer: r.payer, otherPct: typeof r.otherPct === 'number' ? r.otherPct : 50, category: r.category || '', notes: r.notes || '', src: 'tab6', ...(r.bill ? { billHint: r.bill } : {}) });
  }
  for (const r of file.payments || []) {
    const id = 'kp_' + r.key;
    if (have.has(id)) { skipped.push({ r, why: 'already imported' }); continue; }
    pays.push({ id, date: r.date, amount: r.amount, direction: r.direction || 'in', method: r.method || '', forMonth: r.forMonth || '', notes: r.notes || '', src: 'tab6' });
  }
  return { exps, pays, skipped };
}
// Bill names are matched on every keyword (case and dashes ignored).
export function matches(name, keywords) {
  const n = String(name || '').toLowerCase();
  return (Array.isArray(keywords) ? keywords : [keywords]).every((k) => n.includes(String(k).toLowerCase()));
}
export function suggestShares(doc, file) {
  const out = [];
  for (const s of (file && file.shares) || []) {
    const cands = C.liveBills(doc).filter((b) => b.status !== 'stopped' && matches(b.name, s.match));
    out.push({ ...s, bill: cands.length === 1 ? cands[0] : null, candidates: cands, already: cands.length === 1 && !!shareFor(doc, cands[0].id) });
  }
  return out;
}
