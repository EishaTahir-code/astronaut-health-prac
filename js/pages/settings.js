import { icon } from '../icons.js';
import { esc, toast, fmtDuration } from '../ui.js';
import * as store from '../store.js';
import { settings, updateSettings, MISSIONS, ROLES, missionDay } from '../missions.js';
import { hasSample, loadSample, removeSample } from '../sample.js';

const CITIES = [
  { name: 'Lahore', tz: 'Asia/Karachi', lat: 31.55, lon: 74.34 },
  { name: 'Houston', tz: 'America/Chicago', lat: 29.76, lon: -95.37 },
  { name: 'London', tz: 'Europe/London', lat: 51.51, lon: -0.13 },
  { name: 'Nairobi', tz: 'Africa/Nairobi', lat: -1.29, lon: 36.82 },
  { name: 'Tokyo', tz: 'Asia/Tokyo', lat: 35.68, lon: 139.69 },
  { name: 'São Paulo', tz: 'America/Sao_Paulo', lat: -23.55, lon: -46.63 },
  { name: 'Cologne', tz: 'Europe/Berlin', lat: 50.94, lon: 6.96 },
  { name: 'Bengaluru', tz: 'Asia/Kolkata', lat: 12.97, lon: 77.59 },
];

export async function render(main) {
  const s = settings();
  const sample = await hasSample();
  const crew = await store.get('crew', null);
  let estimate = '';
  try { const e = await navigator.storage?.estimate?.(); if (e) estimate = `${(e.usage / 1048576).toFixed(1)} MB used on this device`; } catch { /* ignore */ }
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  main.innerHTML = `
    <div class="page">
      <div class="page-head"><h1>Settings</h1><p>Everything here is saved on this device.</p></div>

      <section class="section"><h2>Mission</h2><p class="lead">Changes gravity notes, the signal delay and the world on your home screen.</p>
        <div class="topic-list" role="radiogroup" aria-label="Mission">
          ${Object.values(MISSIONS).map((m) => `<label class="panel tight row" style="cursor:pointer;align-items:flex-start;flex-wrap:nowrap"><input type="radio" name="mission" value="${m.id}" ${s.mission === m.id ? 'checked' : ''} style="width:20px;height:20px;margin-top:4px"><span class="stack" style="gap:2px"><strong>${esc(m.name)}</strong><span class="muted small">${esc(m.gravity)}. Signal delay ${esc(m.delayText)}.</span></span></label>`).join('')}
        </div>
        <div class="grid-2" style="margin-top:16px">
          <label class="field">Mission day<input class="input" type="number" name="day" min="1" max="2000" value="${missionDay()}"></label>
          <label class="field">Family’s home city<select class="input" name="city">${CITIES.map((c) => `<option ${c.name === s.homeCity.name ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
          <label class="field">Your name<input class="input" name="name" maxlength="60" value="${esc(s.name)}"></label>
        </div>
      </section>

      <section class="section"><h2>View as</h2><p class="lead">For demos on one device. In real use, each person has their own device and role.</p>
        <div class="seg" role="group" aria-label="Role">${Object.values(ROLES).map((r) => `<button type="button" data-role="${r.id}" aria-pressed="${s.role === r.id}">${esc(r.name)}</button>`).join('')}</div>
      </section>

      <section class="section"><h2>Message delays</h2>
        <label class="row panel tight" style="cursor:pointer;flex-wrap:nowrap"><input type="checkbox" name="demo" ${s.demoDelays ? 'checked' : ''} style="width:20px;height:20px">
          <span>Shorten long delays for demos<br><span class="muted small">Mars messages wait ${fmtDuration(MISSIONS.mars.demoDelaySec)} instead of about ${fmtDuration(MISSIONS.mars.delaySec)}.</span></span></label>
      </section>

      <section class="section"><h2>Motion</h2>
        <div class="seg" role="group" aria-label="Motion"><button type="button" data-motion="auto" aria-pressed="${s.motion !== 'reduced'}">Follow device setting</button><button type="button" data-motion="reduced" aria-pressed="${s.motion === 'reduced'}">Reduce motion</button></div>
      </section>

      <section class="section"><h2>Install</h2>
        <p class="muted" style="max-width:62ch">${standalone ? 'Horizon is installed on this device.' : iOS ? 'On iPhone or iPad: tap the Share button, then “Add to Home Screen”.' : 'Install Horizon to open it like an app and use it with no connection.'}</p>
        ${!standalone && window.__installPrompt ? `<div class="btn-row" style="margin-top:10px"><button class="btn" data-install>${icon('download')}Install Horizon</button></div>` : ''}
      </section>

      <section class="section"><h2>Your data</h2>
        <p class="lead">${esc(estimate)}${estimate ? '. ' : ''}${sample ? 'Sample data for a fictional crew member is loaded.' : 'No sample data loaded.'}</p>
        <div class="btn-row">
          <button class="btn ghost" data-export>${icon('download')}Export my data</button>
          ${sample ? `<button class="btn ghost" data-sample-off>Remove sample data</button>` : `<button class="btn ghost" data-sample-on>Load sample data</button>`}
          <button class="btn danger" data-wipe>${icon('trash')}Delete everything on this device</button>
        </div>
        ${crew ? `<p class="muted small" style="margin-top:12px">Crew space: ${esc(crew.name)} (${esc(crew.role)}, ${esc(crew.status)}). <button class="btn small ghost" data-leave>Leave on this device</button></p>` : ''}
      </section>
      <p class="disclaimer">Horizon is a prototype for the NASA Space Apps Challenge. Not a medical device.</p>
    </div>`;

  main.querySelectorAll('[name=mission]').forEach((r) => r.addEventListener('change', async () => {
    await updateSettings({ mission: r.value });
    if (crew?.role === 'astronaut' && navigator.onLine) { try { await (await import('../supa.js')).updateMission(crew.id, r.value); await store.set('crew', { ...crew, mission: r.value }); } catch { /* local only */ } }
    toast(`Mission set to ${MISSIONS[r.value].name}.`, 'globe');
  }));
  main.querySelector('[name=day]').addEventListener('change', async (e) => {
    const d = Math.max(1, Number(e.target.value) || 1);
    const start = new Date(); start.setDate(start.getDate() - (d - 1));
    await updateSettings({ missionStart: start.toISOString().slice(0, 10) });
  });
  main.querySelector('[name=city]').addEventListener('change', async (e) => updateSettings({ homeCity: CITIES.find((c) => c.name === e.target.value) }));
  main.querySelector('[name=name]').addEventListener('change', async (e) => updateSettings({ name: e.target.value.trim() || s.name }));
  main.querySelector('[name=demo]').addEventListener('change', async (e) => updateSettings({ demoDelays: e.target.checked }));
  main.querySelectorAll('[data-role]').forEach((b) => b.addEventListener('click', async () => {
    await updateSettings({ role: b.dataset.role });
    main.querySelectorAll('[data-role]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    toast(`Now viewing as ${ROLES[b.dataset.role].name.toLowerCase()}.`, 'user');
  }));
  main.querySelectorAll('[data-motion]').forEach((b) => b.addEventListener('click', async () => {
    await updateSettings({ motion: b.dataset.motion });
    main.querySelectorAll('[data-motion]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  main.querySelector('[data-install]')?.addEventListener('click', async () => {
    const p = window.__installPrompt; if (!p) return;
    p.prompt(); await p.userChoice.catch(() => {}); window.__installPrompt = null; render(main);
  });
  main.querySelector('[data-export]').addEventListener('click', async () => {
    const data = await store.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `horizon-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  main.querySelector('[data-sample-off]')?.addEventListener('click', async () => { await removeSample(); toast('Sample data removed.', 'trash'); render(main); });
  main.querySelector('[data-sample-on]')?.addEventListener('click', async () => { await loadSample(); toast('Sample data loaded.', 'refresh'); render(main); });
  main.querySelector('[data-wipe]').addEventListener('click', async () => {
    if (!confirm('Delete every check-in, game result, message and setting on this device? This cannot be undone.')) return;
    await store.wipeAll();
    try { localStorage.removeItem('horizon-auth'); } catch { /* ignore */ }
    location.hash = '#/today'; location.reload();
  });
  main.querySelector('[data-leave]')?.addEventListener('click', async () => {
    if (!confirm('Leave this crew space on this device? Saved messages stay until you delete your data.')) return;
    await store.set('crew', null);
    try { await (await import('../supa.js')).signOut(); } catch { /* offline */ }
    render(main);
  });
}
