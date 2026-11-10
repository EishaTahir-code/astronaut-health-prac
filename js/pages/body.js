import { icon } from '../icons.js';
import { esc, statusChip, LEVEL_WORD, fmtDate } from '../ui.js';
import { REGIONS, byId, worst, HAZARDS } from '../health.js';
import { latestStatuses, latestReaction, checkins } from '../data.js';
import { mission } from '../missions.js';

const LIMBS = [
  'M80 132 L60 212 L50 280', 'M160 132 L180 212 L190 280',
  'M106 266 L100 380 L98 486', 'M134 266 L140 380 L142 486',
];
const TORSO = 'M78 122 Q120 108 162 122 L170 156 Q166 214 156 262 Q120 284 84 262 Q74 214 70 156 Z';

function figure() {
  const limbOutline = LIMBS.map((d) => `<path d="${d}" stroke="#3a4c70" stroke-width="31" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`).join('');
  const limbFill = LIMBS.map((d) => `<path d="${d}" stroke="#0c1527" stroke-width="28" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`).join('');
  return `
    <g aria-hidden="true">
      ${limbOutline}
      <path d="M120 92 V124" stroke="#3a4c70" stroke-width="25" stroke-linecap="round"/>
      <path d="${TORSO}" fill="#0c1527" stroke="#3a4c70" stroke-width="1.5"/>
      <ellipse cx="120" cy="56" rx="29" ry="35" fill="#0c1527" stroke="#3a4c70" stroke-width="1.5"/>
      ${limbFill}
      <path d="M120 92 V126" stroke="#0c1527" stroke-width="22" stroke-linecap="round"/>
      <path d="${TORSO}" fill="#0c1527"/>
      <path class="bone" d="M120 128 V258"/>
      <path class="bone" d="M96 150 Q120 160 144 150 M94 170 Q120 182 146 170 M96 190 Q120 202 144 190"/>
      <path class="bone" d="M96 252 Q120 270 144 252"/>
      <path class="bone" d="M103 278 L100 378 M137 278 L140 378"/>
    </g>`;
}

export async function render(main, { rest }) {
  const latest = await latestStatuses();
  const reaction = await latestReaction();
  const last = (await checkins()).at(-1);
  const symptoms = last?.symptoms || [];
  const m = mission();

  const regionStatus = {};
  for (const r of REGIONS) {
    const levels = r.indicators.map((id) => latest[id]?.level).filter(Boolean);
    if (r.reaction && reaction) levels.push(reaction.status.level);
    if (r.id === 'eyes' && symptoms.includes('vision')) levels.push('bad');
    if (r.id === 'heart' && symptoms.some((s) => ['chest', 'faint', 'breath'].includes(s))) levels.push('bad');
    if (r.id === 'brain' && symptoms.some((s) => ['headache', 'confusion'].includes(s))) levels.push('bad');
    regionStatus[r.id] = levels.length ? worst(levels) : 'none';
  }
  const rank = { bad: 3, warn: 2, ok: 1, none: 0 };
  let selected = REGIONS.find((r) => r.id === rest?.[0])?.id
    || [...REGIONS].sort((a, b) => rank[regionStatus[b.id]] - rank[regionStatus[a.id]])[0].id;

  main.innerHTML = `
    <div class="page">
      <div class="page-head">
        <h1>Body status</h1>
        <p>Tap a part of the body to see what it does, how it is doing from your latest readings, and what spaceflight does to it.</p>
      </div>
      <div class="body-layout">
        <div class="body-figure">
          <svg viewBox="0 0 240 520" role="group" aria-label="Body figure with selectable regions">
            ${figure()}
            ${REGIONS.map((r) => `
              <g class="hotspot ${regionStatus[r.id]}" data-region="${r.id}" role="button" tabindex="0" aria-pressed="false" aria-label="${esc(r.name)}: ${LEVEL_WORD[regionStatus[r.id]]}">
                <circle class="hit" cx="${r.x}" cy="${r.y}" r="20"/>
                <circle class="ring" cx="${r.x}" cy="${r.y}" r="12"/>
                <circle class="core" cx="${r.x}" cy="${r.y}" r="4.5"/>
              </g>`).join('')}
          </svg>
          <div class="region-list" role="group" aria-label="Body regions">
            ${REGIONS.map((r) => `<button type="button" data-region="${r.id}" aria-pressed="false"><span class="dot" style="background:var(--${{ ok: 'ok', warn: 'warn', bad: 'bad', none: 'info' }[regionStatus[r.id]]})"></span>${esc(r.name)}</button>`).join('')}
          </div>
        </div>
        <section class="region-detail" id="detail" aria-live="polite"></section>
      </div>
    </div>`;

  const detail = main.querySelector('#detail');
  function select(id, focusHeading = false) {
    selected = id;
    main.querySelectorAll('[data-region]').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.region === id)));
    const r = REGIONS.find((x) => x.id === id);
    const level = regionStatus[id];
    const readings = r.indicators.map((iid) => {
      const ind = byId[iid], l = latest[iid];
      if (!l) return `<div class="reading-row"><span class="status-bar none"></span><div class="what"><strong>${esc(ind.short)}</strong><span class="muted small">No reading yet</span></div><a href="#/check-in">Check in</a></div>`;
      const vals = Object.fromEntries(ind.fields.map((f) => [f.key, l.values[f.key]]));
      return `<div class="reading-row"><span class="status-bar ${l.level}"></span><div class="what"><strong>${esc(ind.short)}: ${esc(ind.format(vals))} ${esc(ind.unitShort || ind.unit)}</strong><span class="muted small">${esc(l.reason)} ${l.today ? 'Today.' : `On ${fmtDate(l.at)}.`}</span></div>${statusChip(l.level)}</div>`;
    });
    if (r.reaction && reaction) readings.push(`<div class="reading-row"><span class="status-bar ${reaction.status.level}"></span><div class="what"><strong>Reaction time: ${reaction.result.medianMs} ms</strong><span class="muted small">${esc(reaction.status.reason)}</span></div>${statusChip(reaction.status.level)}</div>`);
    const gravityNote = ['bones', 'muscles', 'heart', 'eyes'].includes(r.id) ? `<p class="muted small">${esc(m.name)}: ${esc(m.gravityNote)}</p>` : '';
    detail.innerHTML = `
      <div class="stack" style="gap:20px">
        <div class="spread"><h2 tabindex="-1">${esc(r.name)}</h2>${statusChip(level, level === 'none' ? 'Not tracked daily' : undefined)}</div>
        <div class="facts-list">
          <div><h3>What it does</h3><p>${esc(r.does)}</p></div>
          <div><h3>Your status</h3>${readings.length ? `<div class="panel tight">${readings.join('')}</div>` : `<p>${esc(r.notTracked || 'Not part of the daily check-in.')}</p>`}</div>
          <div><h3>What spaceflight does</h3><p>${esc(r.space)}</p>${gravityNote}</div>
          <div><h3>What helps</h3><ul class="prose" style="padding-left:20px;list-style:disc">${r.helps.map((h) => `<li>${esc(h)}</li>`).join('')}</ul></div>
          <div><h3>Spaceflight hazards involved</h3><div class="hazard-tags">${r.hazards.map((h) => `<span>${HAZARDS[h].name}</span>`).join('')}</div></div>
        </div>
        <div class="btn-row"><a class="btn ghost" href="#/trends">${icon('trends')}See trends</a><a class="btn ghost" href="#/learn">${icon('learn')}Learn more</a></div>
      </div>`;
    if (focusHeading) detail.querySelector('h2').focus({ preventScroll: false });
    history.replaceState(null, '', `#/body/${id}`);
  }
  main.querySelectorAll('[data-region]').forEach((el) => {
    el.addEventListener('click', () => select(el.dataset.region, window.innerWidth < 900));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(el.dataset.region, true); } });
  });
  select(selected);
}
