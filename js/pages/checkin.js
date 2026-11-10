import { icon } from '../icons.js';
import { esc, statusChip, toast, dayKey, fmtDate } from '../ui.js';
import * as store from '../store.js';
import { INDICATORS, SYMPTOMS, evaluateCheckin, pick, actionsFor, summarise, byId, HAZARDS } from '../health.js';
import { checkins } from '../data.js';
import { mission, missionDay } from '../missions.js';
import { queueReport } from '../outbox.js';

export async function render(main) {
  const history = (await checkins()).slice(-14);
  const last = history.at(-1);
  const state = { step: 0, values: {}, symptoms: [], skipped: new Set(), saved: null };
  const steps = [...INDICATORS.map((i) => ({ type: 'reading', ind: i })), { type: 'symptoms' }, { type: 'results' }];

  main.innerHTML = `
    <div class="page">
      <div class="page-head">
        <p class="muted">Day ${missionDay()}, ${esc(mission().inSentence)}</p>
        <h1>Morning check-in</h1>
        <p>Seven quick readings, then a symptom check. Each one shows its status as soon as you enter it. About 2 minutes.</p>
      </div>
      <div class="progress" aria-hidden="true">${steps.map(() => '<span></span>').join('')}</div>
      <section id="step" aria-live="polite"></section>
    </div>`;
  const box = main.querySelector('#step');
  const bars = [...main.querySelectorAll('.progress span')];

  function paintProgress() {
    bars.forEach((b, i) => { b.className = i < state.step ? 'done' : i === state.step ? 'current' : ''; });
  }

  function show() {
    paintProgress();
    const s = steps[state.step];
    if (s.type === 'reading') renderReading(s.ind);
    else if (s.type === 'symptoms') renderSymptoms();
    else renderResults();
    const h = box.querySelector('h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    const top = box.getBoundingClientRect().top + window.scrollY - 90;
    if (window.scrollY > top) window.scrollTo(0, Math.max(0, top));
  }

  function go(delta) { state.step = Math.max(0, Math.min(steps.length - 1, state.step + delta)); show(); }

  function renderReading(ind) {
    const n = INDICATORS.indexOf(ind) + 1;
    const prev = last ? pick(last.values, ind) : null;
    const fieldsHtml = ind.id === 'mood'
      ? `<div class="mood-scale" role="group" aria-label="${esc(ind.fields[0].label)}">${ind.moodWords.map((w, i) => `<button type="button" data-mood="${i + 1}" aria-pressed="${state.values.mood === i + 1}"><strong>${i + 1}</strong><span>${w}</span></button>`).join('')}</div>`
      : `<div class="${ind.fields.length > 1 ? 'fields-2' : 'stack'}">${ind.fields.map((f) => `
          <label class="field">${esc(f.label)}
            <span class="input-unit"><input class="input big" type="number" inputmode="decimal" name="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" placeholder="${f.placeholder || ''}" value="${state.values[f.key] ?? ''}" autocomplete="off"><span class="unit">${esc(ind.unitShort || ind.unit)}</span></span>
          </label>`).join('')}</div>`;
    box.innerHTML = `
      <div class="step">
        <div class="stack">
          <p class="muted">${n} of ${INDICATORS.length}${ind.optional ? ', optional' : ''}</p>
          <h2>${esc(ind.name)}</h2>
          ${prev ? `<p class="faint small">Last time: ${esc(ind.format(prev))} ${esc(ind.unitShort || ind.unit)}, ${fmtDate(last.at)}</p>` : ''}
        </div>
        <details class="howto" ${history.length < 3 || ind.optional ? 'open' : ''}>
          <summary>How to measure</summary>
          <ol>${ind.howTo.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
          <p class="space-note"><strong>In space:</strong> ${esc(ind.space)}</p>
          <div class="hazard-tags" style="margin-top:10px">${ind.hazards.map((h) => `<span>${HAZARDS[h].name}</span>`).join('')}</div>
        </details>
        <form class="stack" novalidate>${fieldsHtml}
          <div id="instant"></div>
          <div class="step-nav">
            <button type="button" class="btn ghost" data-back ${state.step === 0 ? 'disabled' : ''}>${icon('arrowLeft')}Back</button>
            <div class="btn-row">
              <button type="button" class="btn ghost" data-skip>Skip</button>
              <button type="submit" class="btn" data-next>Next${icon('arrowRight')}</button>
            </div>
          </div>
        </form>
      </div>`;
    const form = box.querySelector('form');
    const instant = box.querySelector('#instant');
    const next = box.querySelector('[data-next]');

    function update() {
      const v = pick(state.values, ind);
      const valid = v && ind.fields.every((f) => v[f.key] >= f.min && v[f.key] <= f.max);
      next.disabled = !valid;
      if (!v) { instant.innerHTML = ''; return; }
      if (!valid) { instant.innerHTML = `<div class="instant">${icon('info')}<span>That number looks outside what the device can read. Check it and try again.</span></div>`; return; }
      const st = ind.evaluate(v, history, state.symptoms);
      instant.innerHTML = `<div class="instant">${statusChip(st.level)}<span>${esc(st.reason)}</span></div>`;
    }

    form.addEventListener('input', (e) => {
      const t = e.target;
      if (t.name) state.values[t.name] = t.value === '' ? undefined : Number(t.value);
      state.skipped.delete(ind.id);
      update();
    });
    box.querySelectorAll('[data-mood]').forEach((b) => b.addEventListener('click', () => {
      state.values.mood = Number(b.dataset.mood);
      box.querySelectorAll('[data-mood]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      state.skipped.delete(ind.id);
      update();
    }));
    form.addEventListener('submit', (e) => { e.preventDefault(); if (!next.disabled) go(1); });
    box.querySelector('[data-back]').addEventListener('click', () => go(-1));
    box.querySelector('[data-skip]').addEventListener('click', () => {
      ind.fields.forEach((f) => { delete state.values[f.key]; });
      state.skipped.add(ind.id);
      go(1);
    });
    update();
    const firstInput = box.querySelector('input');
    if (firstInput && !('ontouchstart' in window)) setTimeout(() => firstInput.focus(), 50);
  }

  function renderSymptoms() {
    box.innerHTML = `
      <div class="step">
        <div class="stack">
          <p class="muted">Last step</p>
          <h2>Any of these right now?</h2>
          <p class="muted">These can be signs of something serious. If you tick one, Horizon will ask you to contact the flight surgeon straight away.</p>
        </div>
        <form class="stack">
          <div class="panel tight stack">${SYMPTOMS.map((s) => `
            <label class="row" style="min-height:44px"><input type="checkbox" name="sym" value="${s.id}" ${state.symptoms.includes(s.id) ? 'checked' : ''} style="width:22px;height:22px">${esc(s.label)}</label>`).join('')}
          </div>
          <div class="step-nav">
            <button type="button" class="btn ghost" data-back>${icon('arrowLeft')}Back</button>
            <button type="submit" class="btn">${state.symptoms.length ? 'See my results' : 'None of these, see results'}${icon('arrowRight')}</button>
          </div>
        </form>
      </div>`;
    const form = box.querySelector('form');
    const submit = form.querySelector('[type=submit]');
    form.addEventListener('change', () => {
      state.symptoms = [...form.querySelectorAll('input:checked')].map((i) => i.value);
      submit.innerHTML = `${state.symptoms.length ? 'See my results' : 'None of these, see results'}${icon('arrowRight')}`;
    });
    form.addEventListener('submit', async (e) => { e.preventDefault(); await save(); go(1); });
    box.querySelector('[data-back]').addEventListener('click', () => go(-1));
  }

  async function save() {
    const { statuses, overall } = evaluateCheckin(state.values, history, state.symptoms);
    const values = {};
    for (const ind of INDICATORS) { const v = pick(state.values, ind); if (v) Object.assign(values, v); }
    const now = new Date();
    const rec = { id: store.uid(), at: now.toISOString(), date: dayKey(now), values, statuses, overall, symptoms: state.symptoms, sample: false };
    if (Object.keys(statuses).length || state.symptoms.length) await store.put('checkins', rec);
    state.saved = rec;
  }

  function renderResults() {
    const rec = state.saved;
    if (!rec) { go(-1); return; }
    const sum = summarise(rec.statuses, rec.symptoms);
    const rows = INDICATORS.filter((i) => rec.statuses[i.id]).map((i) => {
      const s = rec.statuses[i.id];
      const v = pick(rec.values, i);
      return `<div class="reading-row"><span class="status-bar ${s.level}"></span><div class="what"><strong>${esc(i.name)}</strong><span class="muted small">${esc(s.reason)}</span></div><div class="stack" style="justify-items:end;gap:4px"><span class="value">${esc(i.format(v))}<small>${esc(i.unitShort || i.unit)}</small></span>${statusChip(s.level)}</div></div>`;
    }).join('');
    const cards = INDICATORS.filter((i) => rec.statuses[i.id] && rec.statuses[i.id].level !== 'ok').map((i) => {
      const s = rec.statuses[i.id];
      return `<article class="action-card ${s.level}"><div class="spread"><h3>${esc(i.name)}: ${esc(s.reason.replace(/\.$/, '').toLowerCase())}</h3>${statusChip(s.level)}</div><ol>${actionsFor(i, s).map((a) => `<li>${esc(a)}</li>`).join('')}</ol><p class="why">${esc(i.why)}</p></article>`;
    }).join('');
    const symptomCard = rec.symptoms.length ? `<article class="action-card bad"><div class="spread"><h3>Contact the flight surgeon now</h3>${statusChip('bad')}</div><p>You reported: ${rec.symptoms.map((id) => esc(SYMPTOMS.find((s) => s.id === id).label.toLowerCase())).join(', ')}.</p><ol><li>Stop what you are doing and secure yourself.</li><li>Tell a crewmate.</li><li>Call the flight surgeon on the private medical channel, or send the report below.</li></ol></article>` : '';
    const skipped = [...state.skipped].map((id) => byId[id].short.toLowerCase());
    const canReport = rec.overall === 'bad' || rec.overall === 'warn';
    box.innerHTML = `
      <div class="step">
        <div class="big-status">
          <div class="glyph ${sum.level}">${icon(sum.level === 'none' ? 'none' : sum.level)}</div>
          <div class="stack" style="gap:6px"><h2 style="font-family:var(--sans);font-size:1.5rem;font-weight:600">${esc(sum.text)}</h2>
            <p class="muted">Saved on this device${skipped.length ? `. Skipped: ${esc(skipped.join(', '))}` : ''}.</p></div>
        </div>
        ${symptomCard}
        ${cards ? `<div class="stack"><h3 style="font-size:1.1rem">What to do</h3>${cards}</div>` : ''}
        ${rows ? `<div class="panel">${rows}</div>` : '<p class="muted">No readings entered.</p>'}
        <div class="panel tight stack">
          <h3>${canReport ? 'Tell the flight surgeon' : 'Share with the flight surgeon'}</h3>
          <p class="muted">Sends today’s readings and your last 7 days of trends. It travels with the ${esc(mission().inSentence)} signal delay of ${esc(mission().delayText)}. Nothing is shared unless you press send.</p>
          <div class="btn-row"><button class="btn ${canReport ? '' : 'ghost'}" data-report>${icon('send')}Send report</button></div>
        </div>
        <div class="btn-row">
          <a class="btn ghost" href="#/games/signal">${icon('games')}Take the reaction test</a>
          <a class="btn ghost" href="#/today">Back to Today</a>
        </div>
        <p class="disclaimer">Horizon gives general guidance, not a diagnosis. Ranges are approximate. Always follow your flight surgeon’s advice.</p>
      </div>`;
    box.querySelector('[data-report]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      const all = await checkins();
      const last7 = all.slice(-7).map((c) => ({ date: c.date, values: c.values, overall: c.overall }));
      await queueReport({ level: rec.overall === 'none' ? 'green' : { ok: 'green', warn: 'amber', bad: 'red' }[rec.overall], summary: sum.text, snapshot: { checkin: rec, last7 } });
      btn.innerHTML = `${icon('check')}Report in your outbox`;
      toast(navigator.onLine ? 'Report queued. It will send now and arrive after the signal delay.' : 'Report saved in your outbox. It will send when you are back online.', 'send');
    });
  }

  show();
}
