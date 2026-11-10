import { icon } from '../icons.js';
import { esc, fmtDate, mean, dayKey, addDays, statusChip } from '../ui.js';
import { lineChart, scatterChart, dataTable, sparkline } from '../charts.js';
import { checkins, games } from '../data.js';
import { byId, evaluateReaction } from '../health.js';
import { hasSample } from '../sample.js';

const RANGES = [7, 14, 30];

// better: 'lower' | 'higher' | 'near' (closer to your usual is better)
const METRICS = [
  { id: 'reaction', name: 'Reaction time', unit: 'ms', d: 0, better: 'lower', words: ['faster', 'slower'] },
  { id: 'sleep', name: 'Sleep', unit: 'h', unitLong: 'hours', d: 1, better: 'higher', words: ['less', 'more'] },
  { id: 'bp', name: 'Blood pressure', unit: 'mmHg', d: 0, better: 'lower', words: ['lower', 'higher'] },
  { id: 'hr', name: 'Resting heart rate', short: 'Heart rate', unit: 'bpm', d: 0, better: 'near', words: ['lower', 'higher'] },
  { id: 'mood', name: 'Mood', unit: '/5', unitLong: 'points', d: 1, better: 'higher', words: ['lower', 'higher'] },
  { id: 'glucose', name: 'Blood sugar', unit: 'mg/dL', d: 0, better: 'near', words: ['lower', 'higher'] },
  { id: 'temp', name: 'Temperature', unit: '°C', d: 1, better: 'near', words: ['lower', 'higher'] },
  { id: 'exercise', name: 'Exercise', unit: 'min', unitLong: 'minutes', d: 0, better: 'higher', words: ['less', 'more'] },
];

function pct(arr, p) {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

// Personal usual range from older readings (everything before the last 7).
function baselineBand(values) {
  const older = values.slice(0, Math.max(0, values.length - 7));
  const use = older.length >= 7 ? older : values;
  if (use.length < 5) return null;
  return { lo: pct(use, 0.1), hi: pct(use, 0.9), mid: pct(use, 0.5) };
}

const fx = (v, d) => Number(v).toFixed(d);

// Build one metric's data: points in range, all values, band, latest, change.
function buildMetric(m, all, signal, since) {
  let points = [], allVals = [], latestLevel = null, latest = null, second = null;
  if (m.id === 'reaction') {
    allVals = signal.map((g) => g.medianMs);
    points = signal.filter((g) => g.date > since).map((g) => ({ x: new Date(g.date), y: g.medianMs, level: evaluateReaction(g, signal.filter((x) => x.at < g.at)).level }));
    if (signal.length) latestLevel = evaluateReaction(signal.at(-1), signal.slice(0, -1)).level;
  } else if (m.id === 'bp') {
    const rows = all.filter((c) => c.values?.sys != null);
    allVals = rows.map((c) => c.values.sys);
    const inRange = rows.filter((c) => c.date > since);
    points = inRange.map((c) => ({ x: new Date(c.date), y: c.values.sys, level: c.statuses?.bp?.level }));
    second = inRange.map((c) => ({ x: new Date(c.date), y: c.values.dia }));
    latestLevel = rows.at(-1)?.statuses?.bp?.level || null;
    if (rows.length) latest = `${rows.at(-1).values.sys}/${rows.at(-1).values.dia}`;
  } else {
    const rows = all.filter((c) => c.values?.[m.id] != null);
    allVals = rows.map((c) => c.values[m.id]);
    points = rows.filter((c) => c.date > since).map((c) => ({ x: new Date(c.date), y: c.values[m.id], level: c.statuses?.[m.id]?.level }));
    latestLevel = rows.at(-1)?.statuses?.[m.id]?.level || null;
  }
  if (!allVals.length) return null;
  if (latest == null) latest = fx(allVals.at(-1), m.d);
  const band = baselineBand(allVals);
  const recent = mean(allVals.slice(-3));
  const diff = band ? recent - band.mid : 0;
  const tol = band ? Math.max((band.hi - band.lo) / 2, m.d ? 0.15 : 1.5) : Infinity;
  const steady = !band || Math.abs(diff) < tol * 0.5;
  let tone = 'steady';
  if (!steady) {
    const worse = m.better === 'lower' ? diff > 0 : m.better === 'higher' ? diff < 0 : Math.abs(diff) > tol;
    tone = worse ? 'worse' : 'better';
  }
  const word = diff > 0 ? m.words[1] : m.words[0];
  const deltaText = !band ? 'Building your usual' : steady ? 'In line with your usual' : `${fx(Math.abs(diff), m.d)} ${m.unitLong || m.unit} ${word} than usual`;
  return { m, points, second, allVals, band, recent, diff, tone, deltaText, latest, latestLevel, spark: allVals.slice(-30) };
}

function headline(x) {
  const { m, band, recent, diff, tone } = x;
  const u = m.unitLong || m.unit;
  if (!band) return `${m.name}: building your usual range. Keep logging.`;
  if (m.id === 'bp') return tone === 'steady' ? 'Blood pressure is steady and in line with your usual.' : `Blood pressure has ${diff > 0 ? 'crept up' : 'come down'}: systolic ${fx(recent, 0)} lately, against your usual ${fx(band.mid, 0)}.`;
  if (tone === 'steady') return `${m.name} is steady at about ${fx(recent, m.d)} ${u}, in line with your usual.`;
  return `${m.name} over the last 3 readings averaged ${fx(recent, m.d)} ${u}, ${fx(Math.abs(diff), m.d)} ${u} ${diff > 0 ? m.words[1] : m.words[0]} than your usual ${fx(band.mid, m.d)}.`;
}

export async function render(main, { query }) {
  const range = Number(query.get('days')) || 30;
  const all = await checkins();
  const signal = await games('signal');
  const sample = await hasSample();
  const since = dayKey(addDays(new Date(), -range));
  const metrics = METRICS.map((m) => buildMetric(m, all, signal, since)).filter(Boolean);

  if (!metrics.length) {
    main.innerHTML = `<div class="page"><div class="page-head"><h1>Trends</h1></div><div class="empty"><h2>No readings yet</h2><p class="muted">Do your first check-in and your trends will start here.</p><a class="btn" href="#/check-in">${icon('checkin')}Start check-in</a></div></div>`;
    return;
  }

  // What changed: the readings that moved the wrong way, biggest first.
  const worse = metrics.filter((x) => x.tone === 'worse').sort((a, b) => Math.abs(b.diff) / ((b.band.hi - b.band.lo) || 1) - Math.abs(a.diff) / ((a.band.hi - a.band.lo) || 1));
  const phrase = { reaction: 'reactions are slower', sleep: 'sleep is shorter', bp: 'blood pressure is up', hr: 'resting heart rate has shifted', mood: 'mood is lower', glucose: 'blood sugar has shifted', temp: 'temperature has shifted', exercise: 'exercise is down' };
  const list = (a) => (a.length === 1 ? a[0] : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
  const summary = worse.length ? `Compared with your usual, ${list(worse.slice(0, 3).map((x) => phrase[x.m.id]))}.` : 'Everything is in line with your usual.';
  const selectedId = metrics.find((x) => x.m.id === query.get('m'))?.m.id || worse[0]?.m.id || metrics[0].m.id;

  main.innerHTML = `
    <div class="page trends">
      <div class="page-head">
        <h1>Trends</h1>
        <p class="trend-summary ${worse.length ? 'warn' : 'ok'}">${worse.length ? icon('warn') : icon('ok')}<span>${esc(summary)}</span></p>
      </div>
      <div class="filters" role="group" aria-label="Date range">
        <span class="muted">Show the last</span>
        <div class="seg">${RANGES.map((r) => `<button type="button" data-days="${r}" aria-pressed="${r === range}">${r} days</button>`).join('')}</div>
      </div>
      <div class="tile-grid" role="group" aria-label="Choose a reading">
        ${metrics.map((x) => `
          <button type="button" class="tile" data-metric="${x.m.id}" aria-pressed="${x.m.id === selectedId}">
            <span class="tile-top"><span class="tile-name">${esc(x.m.short || x.m.name)}</span>${x.latestLevel ? `<span class="tile-status ${x.latestLevel}" title="${{ ok: 'In range', warn: 'Recheck', bad: 'Act now' }[x.latestLevel]}">${icon(x.latestLevel)}<span class="visually-hidden">${{ ok: 'In range', warn: 'Recheck', bad: 'Act now' }[x.latestLevel]}</span></span>` : ''}</span>
            <span class="tile-value">${esc(x.latest)}<small>${esc(x.m.unit)}</small></span>
            <span class="tile-delta ${x.tone}">${x.tone === 'steady' ? '' : x.diff > 0 ? '↑ ' : '↓ '}${esc(x.deltaText)}</span>
            ${sparkline(x.spark, { accent: x.tone === 'worse' ? 'var(--warn)' : 'var(--series-1)' })}
          </button>`).join('')}
      </div>
      <section class="chart-card feature" id="detail" aria-live="polite"></section>
      <section class="chart-card" id="connections"></section>
      ${sample ? `<p class="disclaimer" style="margin-top:20px">Includes sample data for a fictional crew member, so the charts are full on first open. You can remove it in <a href="#/settings">Settings</a>.</p>` : ''}
    </div>`;

  main.querySelectorAll('[data-days]').forEach((b) => b.addEventListener('click', () => { location.hash = `#/trends?days=${b.dataset.days}&m=${selectedNow}`; }));

  let selectedNow = selectedId;
  const detail = main.querySelector('#detail');
  function showDetail(id) {
    selectedNow = id;
    main.querySelectorAll('[data-metric]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.metric === id)));
    const x = metrics.find((q) => q.m.id === id);
    const ind = byId[id];
    const legend = id === 'bp'
      ? `<div class="legend"><span class="key"><span class="line-key" style="background:var(--series-1)"></span>Top number (systolic)</span><span class="key"><span class="line-key" style="background:var(--series-2)"></span>Bottom number (diastolic)</span><span class="key"><span class="band-key"></span>Your usual systolic range</span><span class="key"><span class="flag-key" style="border-color:var(--warn)"></span>Needed a recheck or action</span></div>`
      : `<div class="legend">${x.band ? '<span class="key"><span class="band-key"></span>Your usual range</span>' : ''}<span class="key"><span class="flag-key" style="border-color:var(--warn)"></span>Needed a recheck or action</span></div>`;
    const why = id === 'reaction' ? 'Reaction time is the best early sign of fatigue. Short nights are the most common cause of a slowdown.' : ind?.why || '';
    detail.innerHTML = `
      <div class="spread" style="align-items:flex-start">
        <div class="stack" style="gap:6px;max-width:62ch"><h2 class="headline">${esc(headline(x))}</h2><p class="sub">${esc(why)}</p></div>
        ${x.latestLevel ? statusChip(x.latestLevel) : ''}
      </div>
      ${legend}
      <div class="chart" id="chart-main"></div>
      <div class="spread">${dataTable([...x.points].reverse(), [{ name: 'Date', get: (r) => fmtDate(r.x) }, { name: `${x.m.name} (${x.m.unit})`, get: (r) => r.y }, { name: 'Status', get: (r) => ({ ok: 'In range', warn: 'Recheck', bad: 'Act now' }[r.level] || '') }])}
        <a class="small" href="${id === 'reaction' ? '#/games/signal' : `#/learn/reading/${id}`}">${id === 'reaction' ? 'Take the reaction test' : `About ${esc(x.m.name.toLowerCase())}`}</a></div>`;
    const series = [{ key: id, name: x.m.name, color: 'var(--series-1)', points: x.points }];
    if (x.second) series.push({ key: 'dia', name: 'Diastolic', color: 'var(--series-2)', points: x.second });
    lineChart(detail.querySelector('#chart-main'), { series, band: x.band, unit: x.m.unit, decimals: x.m.d, height: 280, smooth: true, area: !x.second, label: `${x.m.name} over the last ${range} days` });
    history.replaceState(null, '', `#/trends?days=${range}&m=${id}`);
  }
  main.querySelectorAll('[data-metric]').forEach((b) => b.addEventListener('click', () => { showDetail(b.dataset.metric); if (window.innerWidth < 760) detail.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  showDetail(selectedId);

  // Connections: sleep against reaction time
  const conn = main.querySelector('#connections');
  const sleepByDate = new Map(all.filter((c) => c.values?.sleep != null).map((c) => [c.date, c.values.sleep]));
  const pairs = signal.filter((g) => sleepByDate.has(g.date)).map((g) => ({ x: sleepByDate.get(g.date), y: g.medianMs, label: fmtDate(g.date) }));
  if (pairs.length >= 5) {
    const shortN = pairs.filter((p) => p.x < 6.5), longN = pairs.filter((p) => p.x >= 7);
    const diff = shortN.length && longN.length ? Math.round(mean(shortN.map((p) => p.y)) - mean(longN.map((p) => p.y))) : null;
    conn.innerHTML = `<h2 class="headline">${esc(diff != null && diff > 5 ? `After nights under 6.5 hours, your reactions are ${diff} ms slower on average.` : 'Sleep and reaction time: no clear link yet.')}</h2>
      <p class="sub">Each dot is one day: hours slept that night against that morning’s reaction time. The line shows the overall trend.</p><div class="chart" id="chart-conn"></div>`;
    scatterChart(conn.querySelector('#chart-conn'), { points: pairs, xName: 'Sleep', yName: 'Reaction time', xUnit: 'h', yUnit: 'ms', label: 'Sleep against reaction time' });
  } else conn.remove();

  let t = 0;
  const onResize = () => { clearTimeout(t); t = setTimeout(() => { showDetail(selectedNow); const c = main.querySelector('#chart-conn'); if (c && pairs.length >= 5) scatterChart(c, { points: pairs, xName: 'Sleep', yName: 'Reaction time', xUnit: 'h', yUnit: 'ms', label: 'Sleep against reaction time' }); }, 200); };
  window.addEventListener('resize', onResize);
  return () => window.removeEventListener('resize', onResize);
}
