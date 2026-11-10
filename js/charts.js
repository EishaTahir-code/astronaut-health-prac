// Hand-built SVG charts: thin lines, a shaded "your normal range" band,
// flagged points in status colours, crosshair tooltip and a table view.
import { esc, fmtDate } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const STATUS_COLOR = { warn: 'var(--warn)', bad: 'var(--bad)' };
const STATUS_WORD = { ok: 'In range', warn: 'Recheck', bad: 'Act now' };

function niceTicks(min, max, count = 4) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count + 0.5) || 10 * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

// Smooth line that never overshoots the data (monotone cubic, Fritsch-Carlson).
function monotonePath(P) {
  const n = P.length;
  const f = (v) => v.toFixed(1);
  if (n < 3) return P.map((p, i) => `${i ? 'L' : 'M'}${f(p[0])} ${f(p[1])}`).join('');
  const dx = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = P[i + 1][0] - P[i][0]; m[i] = dx[i] ? (P[i + 1][1] - P[i][1]) / dx[i] : 0; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], q = a * a + b * b;
    if (q > 9) { const k = 3 / Math.sqrt(q); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${f(P[0][0])} ${f(P[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${f(P[i][0] + h)} ${f(P[i][1] + t[i] * h)} ${f(P[i + 1][0] - h)} ${f(P[i + 1][1] - t[i + 1] * h)} ${f(P[i + 1][0])} ${f(P[i + 1][1])}`;
  }
  return d;
}

let gradId = 0;

// Small trend line for stat tiles: de-emphasised line, latest point in the accent.
export function sparkline(values, { w = 132, h = 36, color = 'var(--faint)', accent = 'var(--series-1)' } = {}) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return '';
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const P = v.map((y, i) => [3 + (i / (v.length - 1)) * (w - 8), h - 4 - ((y - lo) / span) * (h - 8)]);
  const last = P.at(-1);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${monotonePath(P)}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5" fill="${accent}" stroke="var(--night)" stroke-width="2"/></svg>`;
}

function svg(tag, attrs = {}) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  return n;
}

// series: [{ key, name, color, points: [{ x: Date, y: number, level }] }]
export function lineChart(container, { series, band = null, unit = '', decimals = 0, height = 220, label, smooth = false, area = false, bandLabel = null }) {
  // Draw at the container's real width so text stays at its true size.
  const W = Math.max(300, Math.round(container.getBoundingClientRect().width) || 640), H = height, m = { l: 44, r: 52, t: 14, b: 28 };
  const all = series.flatMap((s) => s.points);
  if (!all.length) { container.innerHTML = '<p class="muted">No data in this range yet.</p>'; return; }
  const xs = [...new Set(all.map((p) => +p.x))].sort((a, b) => a - b);
  const x0 = xs[0], x1 = xs.at(-1) === x0 ? x0 + 86400000 : xs.at(-1);
  let yMin = Math.min(...all.map((p) => p.y)), yMax = Math.max(...all.map((p) => p.y));
  if (band) { yMin = Math.min(yMin, band.lo); yMax = Math.max(yMax, band.hi); }
  const pad = (yMax - yMin) * 0.08 || 1;
  const ticks = niceTicks(yMin - pad, yMax + pad);
  const Y0 = ticks[0], Y1 = ticks.at(-1);
  const X = (t) => m.l + ((t - x0) / (x1 - x0)) * (W - m.l - m.r);
  const Y = (v) => H - m.b - ((v - Y0) / (Y1 - Y0)) * (H - m.t - m.b);
  const fmt = (v) => Number(v).toFixed(decimals);

  container.innerHTML = '';
  container.classList.add('chart-wrap');
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label || series.map((s) => s.name).join(', ') });
  const gAxis = svg('g', { class: 'axis' });
  for (const t of ticks) {
    gAxis.append(svg('line', { class: 'gridline', x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t) }));
    const tx = svg('text', { x: m.l - 8, y: Y(t) + 4, 'text-anchor': 'end' });
    tx.textContent = t.toLocaleString('en-GB');
    gAxis.append(tx);
  }
  const nX = Math.min(W < 480 ? 3 : 5, xs.length);
  for (let i = 0; i < nX; i++) {
    const t = xs[Math.round((i * (xs.length - 1)) / Math.max(1, nX - 1))];
    const tx = svg('text', { x: X(t), y: H - 8, 'text-anchor': i === 0 ? 'start' : i === nX - 1 ? 'end' : 'middle' });
    tx.textContent = fmtDate(t);
    gAxis.append(tx);
  }
  root.append(gAxis);

  if (band) {
    root.append(svg('rect', { class: 'band', x: m.l, width: W - m.l - m.r, y: Y(band.hi), height: Math.max(1, Y(band.lo) - Y(band.hi)), rx: 4 }));
    if (bandLabel) {
      const bl = svg('text', { x: m.l + 8, y: Y(band.hi) + 14, fill: 'var(--muted)', 'font-size': 11, 'font-family': 'var(--sans)' });
      bl.textContent = bandLabel;
      root.append(bl);
    }
  }

  for (const s of series) {
    const pts = s.points.filter((p) => p.y != null);
    if (!pts.length) continue;
    const P = pts.map((p) => [X(+p.x), Y(p.y)]);
    const d = smooth ? monotonePath(P) : P.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
    if (area && series.length === 1) {
      const id = `area-${++gradId}`;
      const defs = svg('defs');
      const g = svg('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
      g.append(svg('stop', { offset: '0%', 'stop-color': s.color, 'stop-opacity': 0.22 }), svg('stop', { offset: '100%', 'stop-color': s.color, 'stop-opacity': 0 }));
      defs.append(g);
      root.append(defs, svg('path', { d: `${d}L${P.at(-1)[0].toFixed(1)} ${H - m.b}L${P[0][0].toFixed(1)} ${H - m.b}Z`, fill: `url(#${id})` }));
    }
    root.append(svg('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    for (const p of pts) {
      if (p.level === 'warn' || p.level === 'bad') {
        root.append(svg('circle', { cx: X(+p.x), cy: Y(p.y), r: 5, fill: STATUS_COLOR[p.level], stroke: 'var(--night)', 'stroke-width': 2 }));
      }
    }
    const lastP = pts.at(-1);
    root.append(svg('circle', { cx: X(+lastP.x), cy: Y(lastP.y), r: 4, fill: s.color, stroke: 'var(--night)', 'stroke-width': 2 }));
    const lbl = svg('text', { x: X(+lastP.x) + 8, y: Y(lastP.y) + 4, fill: 'var(--star)', 'font-size': 12, 'font-family': 'var(--sans)', 'font-weight': 600 });
    lbl.textContent = fmt(lastP.y);
    root.append(lbl);
  }

  // Hover / keyboard layer
  const cross = svg('line', { class: 'crosshair', y1: m.t, y2: H - m.b, visibility: 'hidden' });
  root.append(cross);
  const hit = svg('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent', tabindex: 0, role: 'presentation' });
  root.append(hit);
  container.append(root);
  const tip = document.createElement('div');
  tip.className = 'tooltip'; tip.hidden = true;
  container.append(tip);

  let idx = xs.length - 1;
  function show(i) {
    idx = Math.max(0, Math.min(xs.length - 1, i));
    const t = xs[idx];
    cross.setAttribute('x1', X(t)); cross.setAttribute('x2', X(t)); cross.setAttribute('visibility', 'visible');
    tip.replaceChildren();
    const dt = document.createElement('div'); dt.className = 't-date'; dt.textContent = fmtDate(t, { weekday: 'short', day: 'numeric', month: 'short' });
    tip.append(dt);
    for (const s of series) {
      const p = s.points.find((q) => +q.x === t);
      if (!p) continue;
      const row = document.createElement('div'); row.className = 't-row';
      const key = document.createElement('span'); key.className = 't-key'; key.style.background = s.color;
      const v = document.createElement('strong'); v.textContent = `${fmt(p.y)} ${unit}`.trim();
      const n = document.createElement('span'); n.className = 'muted'; n.textContent = s.name + (p.level && p.level !== 'ok' ? `, ${STATUS_WORD[p.level].toLowerCase()}` : '');
      row.append(key, v, n);
      tip.append(row);
    }
    const rect = root.getBoundingClientRect();
    const scale = rect.width / W;
    tip.style.left = `${Math.min(Math.max(X(t) * scale, 80), rect.width - 80)}px`;
    tip.style.top = `${m.t * scale + 8}px`;
    tip.hidden = false;
  }
  function hide() { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; }
  hit.addEventListener('pointermove', (e) => {
    const rect = root.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0, bd = Infinity;
    xs.forEach((t, i) => { const dd = Math.abs(X(t) - px); if (dd < bd) { bd = dd; best = i; } });
    show(best);
  });
  hit.addEventListener('pointerleave', hide);
  hit.addEventListener('focus', () => show(idx));
  hit.addEventListener('blur', hide);
  hit.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(idx - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); show(idx + 1); }
  });
}

// Scatter: each point { x, y, label }.
export function scatterChart(container, { points, xName, yName, xUnit, yUnit, label, color = 'var(--series-1)' }) {
  const W = Math.max(300, Math.round(container.getBoundingClientRect().width) || 640), H = 260, m = { l: 48, r: 20, t: 34, b: 40 };
  if (points.length < 3) { container.innerHTML = '<p class="muted">Not enough days with both readings yet.</p>'; return; }
  const xt = niceTicks(Math.min(...points.map((p) => p.x)) - 0.25, Math.max(...points.map((p) => p.x)) + 0.25);
  const yt = niceTicks(Math.min(...points.map((p) => p.y)) - 5, Math.max(...points.map((p) => p.y)) + 5);
  const X = (v) => m.l + ((v - xt[0]) / (xt.at(-1) - xt[0])) * (W - m.l - m.r);
  const Y = (v) => H - m.b - ((v - yt[0]) / (yt.at(-1) - yt[0])) * (H - m.t - m.b);
  container.innerHTML = '';
  container.classList.add('chart-wrap');
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label });
  const g = svg('g', { class: 'axis' });
  yt.forEach((t) => { g.append(svg('line', { class: 'gridline', x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t) })); const tx = svg('text', { x: m.l - 8, y: Y(t) + 4, 'text-anchor': 'end' }); tx.textContent = t; g.append(tx); });
  xt.forEach((t) => { const tx = svg('text', { x: X(t), y: H - 22, 'text-anchor': 'middle' }); tx.textContent = t; g.append(tx); });
  const xl = svg('text', { x: (m.l + W - m.r) / 2, y: H - 4, 'text-anchor': 'middle' }); xl.textContent = `${xName} (${xUnit})`; g.append(xl);
  const yl = svg('text', { x: m.l - 8, y: 14, 'text-anchor': 'start' }); yl.textContent = `${yName} (${yUnit})`; g.append(yl);
  root.append(g);
  // least-squares trend line
  const n = points.length, mx = points.reduce((s, p) => s + p.x, 0) / n, my = points.reduce((s, p) => s + p.y, 0) / n;
  const slope = points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / (points.reduce((s, p) => s + (p.x - mx) ** 2, 0) || 1);
  const xa = xt[0], xb = xt.at(-1);
  root.append(svg('line', { x1: X(xa), y1: Y(my + slope * (xa - mx)), x2: X(xb), y2: Y(my + slope * (xb - mx)), stroke: 'var(--muted)', 'stroke-width': 1, 'stroke-dasharray': '0', opacity: 0.6 }));
  const tip = document.createElement('div'); tip.className = 'tooltip'; tip.hidden = true;
  for (const p of points) {
    const grp = svg('g', { tabindex: 0, role: 'img', 'aria-label': `${p.label}: ${p.x} ${xUnit}, ${p.y} ${yUnit}` });
    grp.append(svg('circle', { cx: X(p.x), cy: Y(p.y), r: 12, fill: 'transparent' }));
    grp.append(svg('circle', { cx: X(p.x), cy: Y(p.y), r: 5, fill: color, stroke: 'var(--night)', 'stroke-width': 2 }));
    const showTip = () => {
      tip.replaceChildren();
      const d = document.createElement('div'); d.className = 't-date'; d.textContent = p.label;
      const r1 = document.createElement('div'); r1.className = 't-row'; r1.innerHTML = `<strong></strong><span class="muted"></span>`;
      r1.querySelector('strong').textContent = `${p.y} ${yUnit}`; r1.querySelector('span').textContent = yName;
      const r2 = document.createElement('div'); r2.className = 't-row'; r2.innerHTML = `<strong></strong><span class="muted"></span>`;
      r2.querySelector('strong').textContent = `${p.x} ${xUnit}`; r2.querySelector('span').textContent = xName;
      tip.append(d, r1, r2);
      const rect = root.getBoundingClientRect(); const sc = rect.width / W;
      tip.style.left = `${Math.min(Math.max(X(p.x) * sc, 80), rect.width - 80)}px`; tip.style.top = `${Y(p.y) * sc}px`; tip.hidden = false;
    };
    grp.addEventListener('pointerenter', showTip); grp.addEventListener('focus', showTip);
    grp.addEventListener('pointerleave', () => { tip.hidden = true; }); grp.addEventListener('blur', () => { tip.hidden = true; });
    root.append(grp);
  }
  container.append(root, tip);
}

export function dataTable(rows, columns) {
  return `<details class="table-toggle"><summary class="muted">Show as a table</summary><div class="table-scroll"><table class="data-table"><thead><tr>${columns.map((c) => `<th scope="col">${esc(c.name)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${columns.map((c) => `<td>${esc(c.get(r))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}
