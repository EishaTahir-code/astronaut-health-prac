import { icon } from './icons.js';

// Escape text for safe use inside HTML template strings.
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function html(strings, ...vals) {
  return strings.reduce((out, s, i) => out + s + (i < vals.length ? vals[i] : ''), '');
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) node.append(c.nodeType ? c : document.createTextNode(c));
  return node;
}

export const LEVEL_WORD = { ok: 'In range', warn: 'Recheck', bad: 'Act now', none: 'No reading' };
export const LEVEL_ICON = { ok: 'ok', warn: 'warn', bad: 'bad', none: 'none' };

export function statusChip(level, word) {
  return `<span class="status ${level}">${icon(LEVEL_ICON[level] || 'none')}${esc(word || LEVEL_WORD[level])}</span>`;
}

export function toast(message, iconName = 'info', ms = 4200) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const t = el('div', { class: 'toast', html: `${icon(iconName)}<span></span>` });
  t.querySelector('span').textContent = message;
  box.append(t);
  setTimeout(() => t.remove(), ms);
}

// Dates ---------------------------------------------------------------
export function dayKey(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function fmtDate(d, opts = { day: 'numeric', month: 'short' }) { return new Date(d).toLocaleDateString('en-GB', opts); }
export function fmtTime(d) { return new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
export function fmtDateTime(d) { return `${fmtDate(d)}, ${fmtTime(d)}`; }
export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m < 60) return s ? `${m} min ${s} s` : `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}
export function plural(n, one, many = one + 's') { return `${n} ${n === 1 ? one : many}`; }

// Stats ---------------------------------------------------------------
export function mean(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN; }
export function median(a) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function sd(a) { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); }

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced';
}
