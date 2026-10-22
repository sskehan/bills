// Small screen helpers: safe text, icons, toast, bottom sheets.

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// Tagged template that escapes every ${} unless it's wrapped with raw().
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);
export function h(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) {
      const v = vals[i];
      if (v instanceof Raw) out += v.s;
      else if (Array.isArray(v)) out += v.map((x) => (x instanceof Raw ? x.s : esc(x))).join('');
      else if (v === false || v === null || v === undefined) out += '';
      else out += esc(v);
    }
  });
  return new Raw(out);
}

const P = {
  back: '<path d="M15 6l-6 6 6 6"/>',
  next: '<path d="M9 6l6 6-6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  list: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  chart: '<path d="M5 20V12M10 20V6M15 20v-9M20 20V9"/>',
  swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  warn: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.5-8 6 6 0 0 1 11.5 1.5A3.5 3.5 0 0 1 17.5 18z"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  home: '<path d="M4 11l8-7 8 7v9H4z"/>',
};
export function icon(name, size = 22, sw = 2) {
  return raw(`<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`);
}

let toastTimer;
// actionHtml (optional): an already-escaped button shown after the message.
export function toast(msg, ms = 2600, actionHtml = '') {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg; if (actionHtml) { el.insertAdjacentHTML('beforeend', actionHtml); el.style.display = 'flex'; el.style.alignItems = 'center'; } else el.style.display = ''; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// Bottom sheet. content is HTML (already escaped). Returns the sheet element.
export function openSheet(content, onClose) {
  closeSheet();
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${content}</div>`;
  bg.addEventListener('click', (e) => { if (e.target === bg) { closeSheet(); onClose && onClose(); } });
  document.body.appendChild(bg);
  const first = bg.querySelector('input, select, textarea, button');
  if (first) setTimeout(() => first.focus(), 30);
  return bg.firstElementChild;
}
export function closeSheet() { document.querySelectorAll('.sheet-bg').forEach((x) => x.remove()); }

export function confirmSheet(title, body, okLabel = 'OK', danger = false) {
  return new Promise((resolve) => {
    const s = openSheet(`<h2>${esc(title)}</h2><div class="small" style="line-height:1.5">${body}</div>
      <div class="grid2"><button class="btn ghost" data-r="0">Cancel</button><button class="btn ${danger ? 'danger' : ''}" data-r="1">${esc(okLabel)}</button></div>`, () => resolve(false));
    s.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => { closeSheet(); resolve(b.dataset.r === '1'); }));
  });
}

export function download(name, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
export function pickFile(accept = '.json,application/json') {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept;
    i.onchange = () => { const f = i.files && i.files[0]; if (!f) return resolve(null); const r = new FileReader(); r.onload = () => resolve({ name: f.name, text: r.result }); r.readAsText(f); };
    i.click();
  });
}
export async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast('Copied'); }
  catch { toast('Could not copy — press and hold to copy instead'); }
}
