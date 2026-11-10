import { icon } from '../icons.js';
import { esc, fmtDate, mean, dayKey, addDays } from '../ui.js';
import { lineChart, scatterChart, dataTable } from '../charts.js';
import { checkins, games } from '../data.js';
import { byId, evaluateReaction } from '../health.js';
import { hasSample } from '../sample.js';

const RANGES = [7, 14, 30];

function pct(arr, p) {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

// Personal normal range from older data (everything before the last 7 days).
function baselineBand(values) {
  const older = values.slice(0, Math.max(0, values.length - 7));
  const use = older.length >= 7 ? older : values;
  if (use.length < 5) return null;
  return { lo: pct(use, 0.1), hi: pct(use, 0.9), mid: pct(use, 0.5) };
}

function round(v, d) { return Number(v).toFixed(d); }

function changeSentence({ label, unit, recent, usual, d = 0, lowerWord = 'lower', higherWord = 'higher', n }) {
  if (!Number.isFinite(recent) || !Number.isFinite(usual)) return `${label}: not enough readings yet.`;
  const diff = recent - usual;
  if (Math.abs(diff) < (d ? 10 ** -d * 2 : 2)) return `${label} is steady at about ${round(recent, d)} ${unit}, in line with your usual.`;
  const gap = `${round(Math.abs(diff), d)} ${unit} ${diff > 0 ? higherWord : lowerWord} than your usual ${round(usual, d)}`;
  if (n === 1) return `${label} was ${round(recent, d)} ${unit} last time, ${gap}.`;
  return `${label} over the last ${n} days averaged ${round(recent, d)} ${unit}, ${gap}.`;
}

export async function render(main, { query }) {
  const range = Number(query.get('days')) || 30;
  const all = await checkins();
  const signal = await games('signal');
  const sample = await hasSample();
  const since = dayKey(addDays(new Date(), -range));
  const list = all.filter((c) => c.date > since);
  const sig = signal.filter((g) => g.date > since);

  main.innerHTML = `
    <div class="page">
      <div class="page-head">
        <h1>Trends</h1>
        <p>Each chart compares your readings with your own usual range, shaded in blue. Coloured dots mark readings that needed a recheck or action.</p>
      </div>
      ${sample ? `<p class="disclaimer" style="margin:-12px 0 20px">Includes sample data for a fictional crew member, so the charts are full on first open. You can remove it in <a href="#/settings">Settings</a>.</p>` : ''}
      <div class="filters" role="group" aria-label="Date range">
        <span class="muted">Show the last</span>
        <div class="seg">${RANGES.map((r) => `<button type="button" data-days="${r}" aria-pressed="${r === range}">${r} days</button>`).join('')}</div>
      </div>
      <div class="trend-grid" id="charts"></div>
    </div>`;
  main.querySelectorAll('[data-days]').forEach((b) => b.addEventListener('click', () => { location.hash = `#/trends?days=${b.dataset.days}`; }));

  const host = main.querySelector('#charts');
  if (!list.length && !sig.length) {
    host.innerHTML = `<div class="empty"><h2>No readings yet</h2><p class="muted">Do your first check-in and your trends will start here.</p><a class="btn" href="#/check-in">${icon('checkin')}Start check-in</a></div>`;
    return;
  }

  const cards = [];
  const addCard = (id, headline, sub, legend, draw, table) => {
    const card = document.createElement('article');
    card.className = 'chart-card';
    card.innerHTML = `<h2 class="headline">${esc(headline)}</h2><p class="sub">${esc(sub)}</p>${legend || ''}<div class="chart" id="c-${id}"></div>${table || ''}`;
    host.append(card);
    cards.push(() => draw(card.querySelector(`#c-${id}`)));
  };
  const bandLegend = (extra = '') => `<div class="legend"><span class="key"><span class="band-key"></span>Your usual range</span><span class="key"><span class="flag-key" style="border-color:var(--warn)"></span>Recheck</span><span class="key"><span class="flag-key" style="border-color:var(--bad)"></span>Act now</span>${extra}</div>`;

  // Reaction time
  if (sig.length) {
    const pts = sig.map((g, i) => {
      const st = evaluateReaction(g, signal.filter((x) => x.at < g.at));
      return { x: new Date(g.date), y: g.medianMs, level: st.level };
    });
    const band = baselineBand(signal.map((g) => g.medianMs));
    const recent = mean(sig.slice(-3).map((g) => g.medianMs));
    const head = band ? changeSentence({ label: 'Reaction time', unit: 'ms', recent, usual: band.mid, lowerWord: 'faster', higherWord: 'slower', n: Math.min(3, sig.length) }) : 'Reaction time: building your personal baseline.';
    addCard('reaction', head, 'Signal lock median reaction time, milliseconds. Lower is faster.', bandLegend(),
      (el) => lineChart(el, { series: [{ key: 'rt', name: 'Reaction time', color: 'var(--series-1)', points: pts }], band, unit: 'ms', label: 'Reaction time over time' }),
      dataTable(sig.slice().reverse(), [{ name: 'Date', get: (r) => fmtDate(r.date) }, { name: 'Median (ms)', get: (r) => r.medianMs }, { name: 'Lapses', get: (r) => r.lapses }]));
  }

  const single = (id, key, label, unit, d = 0, opts = {}) => {
    const ind = byId[id];
    const rows = list.filter((c) => c.values?.[key] != null);
    if (!rows.length) return;
    const allVals = all.filter((c) => c.values?.[key] != null).map((c) => c.values[key]);
    const band = baselineBand(allVals);
    const recentRows = rows.slice(-3);
    const recent = mean(recentRows.map((c) => c.values[key]));
    const head = band ? changeSentence({ label, unit, recent, usual: band.mid, d, n: recentRows.length, ...opts }) : `${label}: building your usual range.`;
    addCard(id, head, `${ind.name}, ${ind.unit}.`, bandLegend(),
      (el) => lineChart(el, { series: [{ key, name: label, color: 'var(--series-1)', points: rows.map((c) => ({ x: new Date(c.date), y: c.values[key], level: c.statuses?.[id]?.level })) }], band, unit: ind.unitShort || ind.unit, decimals: d, label: `${label} over time` }),
      dataTable(rows.slice().reverse(), [{ name: 'Date', get: (r) => fmtDate(r.date) }, { name: `${label} (${ind.unitShort || ind.unit})`, get: (r) => r.values[key] }, { name: 'Status', get: (r) => ({ ok: 'In range', warn: 'Recheck', bad: 'Act now' }[r.statuses?.[id]?.level] || '') }]));
  };

  single('sleep', 'sleep', 'Sleep', 'hours', 1, { lowerWord: 'less', higherWord: 'more' });

  // Blood pressure: two series
  const bpRows = list.filter((c) => c.values?.sys != null);
  if (bpRows.length) {
    const sysAll = all.filter((c) => c.values?.sys != null);
    const band = baselineBand(sysAll.map((c) => c.values.sys));
    const rs = mean(bpRows.slice(-3).map((c) => c.values.sys)), rd = mean(bpRows.slice(-3).map((c) => c.values.dia));
    const us = band?.mid, ud = pct(sysAll.slice(0, -7).map((c) => c.values.dia), 0.5);
    const head = band && Math.abs(rs - us) >= 3 ? `Blood pressure has ${rs > us ? 'crept up' : 'come down'}: ${Math.round(rs)}/${Math.round(rd)} on average lately, against your usual ${Math.round(us)}/${Math.round(ud)}.` : `Blood pressure is steady at about ${Math.round(rs)}/${Math.round(rd)} mmHg.`;
    const legend = `<div class="legend"><span class="key"><span class="line-key" style="background:var(--series-1)"></span>Top number (systolic)</span><span class="key"><span class="line-key" style="background:var(--series-2)"></span>Bottom number (diastolic)</span><span class="key"><span class="band-key"></span>Your usual systolic range</span><span class="key"><span class="flag-key" style="border-color:var(--warn)"></span>Recheck</span></div>`;
    addCard('bp', head, 'Blood pressure, mmHg.', legend,
      (el) => lineChart(el, { series: [
        { key: 'sys', name: 'Systolic', color: 'var(--series-1)', points: bpRows.map((c) => ({ x: new Date(c.date), y: c.values.sys, level: c.statuses?.bp?.level })) },
        { key: 'dia', name: 'Diastolic', color: 'var(--series-2)', points: bpRows.map((c) => ({ x: new Date(c.date), y: c.values.dia })) },
      ], band, unit: 'mmHg', label: 'Blood pressure over time' }),
      dataTable(bpRows.slice().reverse(), [{ name: 'Date', get: (r) => fmtDate(r.date) }, { name: 'Systolic', get: (r) => r.values.sys }, { name: 'Diastolic', get: (r) => r.values.dia }]));
  }

  single('hr', 'hr', 'Resting heart rate', 'bpm');
  single('mood', 'mood', 'Mood', 'points', 1);
  single('glucose', 'glucose', 'Blood sugar', 'mg/dL');
  single('temp', 'temp', 'Temperature', '°C', 1);
  single('exercise', 'exercise', 'Exercise', 'minutes', 0, { lowerWord: 'less', higherWord: 'more' });

  // Sleep vs reaction time
  const sleepByDate = new Map(all.filter((c) => c.values?.sleep != null).map((c) => [c.date, c.values.sleep]));
  const pairs = signal.filter((g) => sleepByDate.has(g.date)).map((g) => ({ x: sleepByDate.get(g.date), y: g.medianMs, label: fmtDate(g.date) }));
  if (pairs.length >= 5) {
    const shortN = pairs.filter((p) => p.x < 6.5), longN = pairs.filter((p) => p.x >= 7);
    const diff = shortN.length && longN.length ? Math.round(mean(shortN.map((p) => p.y)) - mean(longN.map((p) => p.y))) : null;
    const head = diff != null && diff > 5 ? `After nights under 6.5 hours, your reactions are ${diff} ms slower on average.` : 'Sleep and reaction time: no clear link yet.';
    addCard('sleep-rt', head, 'Each dot is one day: hours slept that night against that morning’s reaction time. The line shows the overall trend.', '',
      (el) => scatterChart(el, { points: pairs, xName: 'Sleep', yName: 'Reaction time', xUnit: 'h', yUnit: 'ms', label: 'Sleep against reaction time' }),
      dataTable(pairs, [{ name: 'Date', get: (r) => r.label }, { name: 'Sleep (h)', get: (r) => r.x }, { name: 'Reaction (ms)', get: (r) => r.y }]));
  }

  cards.forEach((fn) => fn());
  const onResize = () => cards.forEach((fn) => fn());
  let t = 0;
  const debounced = () => { clearTimeout(t); t = setTimeout(onResize, 200); };
  window.addEventListener('resize', debounced);
  return () => window.removeEventListener('resize', debounced);
}
