import { icon, DEBRIS_SVG, SATELLITE_SVG } from '../icons.js';
import { esc, statusChip, toast, dayKey, fmtDate, median, mean } from '../ui.js';
import * as store from '../store.js';
import { games, badges } from '../data.js';
import { evaluateReaction, REACTION_GUIDE } from '../health.js';
import { queueReport } from '../outbox.js';

const GAMES = {
  signal: { name: 'Signal lock', measures: 'Alertness and fatigue', time: '1 minute', blurb: 'Tap the moment the signal appears. Based on the vigilance test astronauts take on the space station.' },
  debris: { name: 'Debris dodge', measures: 'Impulse control', time: '45 seconds', blurb: 'Tap the space debris, but never the satellites. Tests how well you hold back a reflex.' },
  stars: { name: 'Star map', measures: 'Working memory', time: 'About 2 minutes', blurb: 'Watch the stars light up, then repeat the pattern. It gets longer each round.' },
};

export async function render(main, { rest }) {
  const id = rest?.[0];
  if (id === 'signal') return signal(main);
  if (id === 'debris') return debris(main);
  if (id === 'stars') return stars(main);
  return list(main);
}

async function list(main) {
  const all = await games();
  const last = (k) => all.filter((g) => g.game === k).at(-1);
  const summary = (k, g) => {
    if (!g) return 'Not played yet';
    if (k === 'signal') return `${g.medianMs} ms median, ${fmtDate(g.at)}`;
    if (k === 'debris') return `${Math.round(g.hitRate * 100)}% hits, ${g.falseTaps} wrong taps, ${fmtDate(g.at)}`;
    return `Remembered ${g.span} stars, ${fmtDate(g.at)}`;
  };
  main.innerHTML = `
    <div class="page">
      <div class="page-head">
        <h1>Reaction games</h1>
        <p>Short games that track alertness, impulse control and memory against your own usual scores. They show fatigue, not mood, so pair them with the mood question in your check-in.</p>
      </div>
      <div class="game-list">
        ${Object.entries(GAMES).map(([k, g]) => `
          <article class="game-card">
            <h3>${esc(g.name)}</h3>
            <p class="muted small">${esc(g.measures)}, ${esc(g.time)}</p>
            <p>${esc(g.blurb)}</p>
            <p class="faint small">Last: ${esc(summary(k, last(k)))}</p>
            <a class="btn ${k === 'signal' ? '' : 'ghost'}" href="#/games/${k}">${icon('play')}Play</a>
          </article>`).join('')}
      </div>
      <section class="section">
        <h2>Why these games</h2>
        <p class="muted" style="max-width:66ch">Signal lock follows the Psychomotor Vigilance Test, a reaction test used on the space station to spot fatigue. Debris dodge and Star map are inspired by tests in NASA’s Cognition battery for astronauts. Scores are compared only with your own past results, because phones and screens add small timing differences.</p>
      </section>
    </div>`;
}

function arenaPage(main, key, extra = '') {
  const g = GAMES[key];
  main.innerHTML = `
    <div class="page">
      <div class="page-head">
        <p><a href="#/games">${icon('arrowLeft').replace('<svg', '<svg style="width:16px;height:16px;display:inline;vertical-align:-3px"')} All games</a></p>
        <h1>${esc(g.name)}</h1>
        <p>${esc(g.blurb)}</p>
      </div>
      <div class="arena" id="arena" tabindex="0" aria-label="${esc(g.name)} play area"></div>
      <div id="after" class="section"></div>
      ${extra}
    </div>`;
  return { arena: main.querySelector('#arena'), after: main.querySelector('#after') };
}

async function saveResult(rec) {
  const before = (await badges()).filter((b) => b.earned).map((b) => b.id);
  await store.put('games', rec);
  const after = await badges();
  after.filter((b) => b.earned && !before.includes(b.id)).forEach((b) => toast(`Badge earned: ${b.name}`, 'medal', 5000));
}

// ---------------- Signal lock (vigilance) ----------------
async function signal(main) {
  const { arena, after } = arenaPage(main, 'signal');
  let timers = [], raf = 0, active = false, onset = 0, waiting = false, rts = [], falseStarts = 0, endAt = 0, cooldown = false;
  let duration = 60000;
  const clear = () => { timers.forEach(clearTimeout); timers = []; cancelAnimationFrame(raf); };

  function intro() {
    arena.innerHTML = `<div class="center"><div class="stack" style="justify-items:center;max-width:420px">
      <p>Keep your eyes on the centre. When the signal ring appears, tap anywhere in this area or press the space bar as fast as you can. Do not tap before it appears.</p>
      <div class="seg" role="group" aria-label="Test length"><button type="button" data-len="60000" aria-pressed="true">1 minute</button><button type="button" data-len="180000" aria-pressed="false">3 minutes (full test)</button></div>
      <button class="btn" data-start>${icon('play')}Start</button></div></div>`;
    arena.querySelectorAll('[data-len]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation(); duration = Number(b.dataset.len);
      arena.querySelectorAll('[data-len]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));
    arena.querySelector('[data-start]').addEventListener('click', (e) => { e.stopPropagation(); start(); });
  }

  function hud() {
    const left = Math.max(0, Math.ceil((endAt - performance.now()) / 1000));
    return `<div class="hud"><span>${rts.length} signals</span><span>${left} s left</span></div>`;
  }

  function start() {
    rts = []; falseStarts = 0; endAt = performance.now() + duration; active = true;
    after.innerHTML = '';
    arena.focus();
    next();
  }

  function next() {
    if (performance.now() >= endAt) return finish();
    waiting = true; onset = 0; cooldown = false;
    arena.innerHTML = `${hud()}<div class="center"><span class="faint">Wait for the signal</span></div>`;
    const isi = 2000 + Math.random() * (duration > 60000 ? 8000 : 3500);
    timers.push(setTimeout(showSignal, isi));
  }

  function showSignal() {
    if (!active) return;
    arena.innerHTML = `${hud()}<div class="center"><div class="signal" id="sig">0</div></div>`;
    const sig = arena.querySelector('#sig');
    raf = requestAnimationFrame((t0) => {
      onset = t0; waiting = false;
      const tick = (t) => { sig.textContent = Math.round(t - onset); if (t - onset > 3000) return respond(t, true); raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
    });
  }

  function respond(t, timedOut = false) {
    if (!active || cooldown) return;
    if (waiting || !onset) {
      falseStarts++;
      clear(); cooldown = true;
      arena.innerHTML = `${hud()}<div class="center"><span style="color:var(--warn)">Too early. Wait for the signal.</span></div>`;
      timers.push(setTimeout(next, 1100));
      return;
    }
    cancelAnimationFrame(raf);
    const rt = Math.round((timedOut ? 3000 : t - onset));
    rts.push(rt);
    onset = 0; cooldown = true;
    arena.innerHTML = `${hud()}<div class="center"><div class="stack" style="justify-items:center"><span style="font-size:2.4rem;font-weight:600">${rt} ms</span><span class="muted">${rt >= 500 ? 'Lapse: slower than half a second' : 'Got it'}</span></div></div>`;
    timers.push(setTimeout(next, 900));
  }

  const onPointer = (e) => { if (!active) return; if (e.target.closest('button')) return; e.preventDefault(); respond(performance.now()); };
  const onKey = (e) => { if (!active) return; if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); respond(performance.now()); } };
  arena.addEventListener('pointerdown', onPointer);
  window.addEventListener('keydown', onKey);

  async function finish() {
    active = false; clear();
    if (rts.length < 3) {
      arena.innerHTML = `<div class="center"><div class="stack" style="justify-items:center"><p>Not enough signals caught to score. Try again when you can give it a full minute.</p><button class="btn" data-again>${icon('refresh')}Try again</button></div></div>`;
      arena.querySelector('[data-again]').addEventListener('click', (e) => { e.stopPropagation(); intro(); });
      return;
    }
    const prev = await games('signal');
    const rec = { id: store.uid(), game: 'signal', at: new Date().toISOString(), date: dayKey(), medianMs: Math.round(median(rts)), meanMs: Math.round(mean(rts)), lapses: rts.filter((r) => r >= 500).length, falseStarts, trials: rts.length, durationMs: duration, sample: false };
    const st = evaluateReaction(rec, prev);
    await saveResult(rec);
    arena.innerHTML = `<div class="center"><div class="stack" style="justify-items:center"><span class="muted">Median reaction time</span><span style="font-size:3rem;font-weight:600">${rec.medianMs} ms</span>${statusChip(st.level)}</div></div>`;
    const guide = REACTION_GUIDE[st.level] || [];
    after.innerHTML = `
      <div class="stack">
        <div class="result-grid panel">
          <div><div class="muted small">Signals</div><div class="v">${rec.trials}</div></div>
          <div><div class="muted small">Lapses (500 ms or slower)</div><div class="v">${rec.lapses}</div></div>
          <div><div class="muted small">Too-early taps</div><div class="v">${rec.falseStarts}</div></div>
          <div><div class="muted small">Your usual</div><div class="v">${st.baseline ? `${Math.round(st.baseline)} ms` : 'Building'}</div></div>
        </div>
        <p>${esc(st.reason)}</p>
        ${guide.length ? `<article class="action-card ${st.level}"><h3>What to do</h3><ol>${guide.map((g) => `<li>${esc(g)}</li>`).join('')}</ol></article>` : ''}
        <div class="btn-row">
          <button class="btn ghost" data-again>${icon('refresh')}Play again</button>
          <a class="btn ghost" href="#/trends">${icon('trends')}See the trend</a>
          ${st.level === 'bad' ? `<button class="btn" data-report>${icon('send')}Send to flight surgeon</button>` : ''}
        </div>
      </div>`;
    after.querySelector('[data-again]').addEventListener('click', intro);
    after.querySelector('[data-report]')?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      await queueReport({ level: 'red', summary: `Reaction time ${rec.medianMs} ms, ${st.reason}`, snapshot: { reaction: rec, baseline: st.baseline } });
      toast('Report queued in your outbox.', 'send');
    });
  }

  intro();
  return () => { active = false; clear(); window.removeEventListener('keydown', onKey); };
}

// ---------------- Debris dodge (go / no-go) ----------------
async function debris(main) {
  const { arena, after } = arenaPage(main, 'debris');
  let timers = [], active = false, trials = [], current = null;
  const DURATION = 45000;
  const clear = () => { timers.forEach(clearTimeout); timers = []; };

  function intro() {
    arena.innerHTML = `<div class="center"><div class="stack" style="justify-items:center;max-width:440px">
      <div class="row" style="justify-content:center;gap:28px"><div class="stack" style="justify-items:center"><div style="width:64px">${DEBRIS_SVG}</div><span>Tap debris</span></div><div class="stack" style="justify-items:center"><div style="width:64px">${SATELLITE_SVG}</div><span>Leave satellites</span></div></div>
      <p class="muted">Objects appear for less than a second. Keyboard: press the space bar for debris.</p>
      <button class="btn" data-start>${icon('play')}Start</button></div></div>`;
    arena.querySelector('[data-start]').addEventListener('click', (e) => { e.stopPropagation(); start(); });
  }

  function start() {
    trials = []; active = true; after.innerHTML = '';
    const end = performance.now() + DURATION;
    arena.focus();
    const spawn = () => {
      if (!active) return;
      if (performance.now() >= end) return finish();
      const go = Math.random() < 0.72;
      const x = 12 + Math.random() * 76, y = 18 + Math.random() * 68;
      arena.innerHTML = `<div class="hud"><span>${trials.length} objects</span><span>${Math.ceil((end - performance.now()) / 1000)} s left</span></div><button type="button" class="target" style="left:${x}%;top:${y}%" aria-label="${go ? 'Debris' : 'Satellite'}">${go ? DEBRIS_SVG : SATELLITE_SVG}</button>`;
      current = { go, shown: performance.now(), tapped: false, rt: null };
      trials.push(current);
      const btn = arena.querySelector('.target');
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); tap(); });
      timers.push(setTimeout(() => { if (active) { arena.querySelector('.target')?.remove(); current = null; } }, 750));
      timers.push(setTimeout(spawn, 1000 + Math.random() * 300));
    };
    spawn();
  }

  function tap() {
    if (!active || !current || current.tapped) return;
    current.tapped = true; current.rt = performance.now() - current.shown;
    const t = arena.querySelector('.target');
    if (t) t.style.opacity = '0.25';
  }
  const onKey = (e) => { if (active && (e.code === 'Space' || e.key === ' ')) { e.preventDefault(); tap(); } };
  window.addEventListener('keydown', onKey);

  async function finish() {
    active = false; clear();
    const go = trials.filter((t) => t.go), nogo = trials.filter((t) => !t.go);
    const hits = go.filter((t) => t.tapped);
    const prev = await games('debris');
    const rec = { id: store.uid(), game: 'debris', at: new Date().toISOString(), date: dayKey(), hitRate: go.length ? hits.length / go.length : 0, falseTaps: nogo.filter((t) => t.tapped).length, meanMs: Math.round(mean(hits.map((h) => h.rt))) || null, trials: trials.length, sample: false };
    await saveResult(rec);
    const usualFalse = prev.length >= 3 ? mean(prev.slice(-10).map((p) => p.falseTaps)) : null;
    const level = rec.falseTaps >= 4 || rec.hitRate < 0.7 ? 'warn' : 'ok';
    arena.innerHTML = `<div class="center"><div class="stack" style="justify-items:center"><span class="muted">Debris caught</span><span style="font-size:3rem;font-weight:600">${Math.round(rec.hitRate * 100)}%</span>${statusChip(level, level === 'ok' ? 'Steady' : 'Lower than ideal')}</div></div>`;
    after.innerHTML = `
      <div class="stack">
        <div class="result-grid panel">
          <div><div class="muted small">Satellites tapped by mistake</div><div class="v">${rec.falseTaps}</div></div>
          <div><div class="muted small">Average reaction</div><div class="v">${rec.meanMs ? `${rec.meanMs} ms` : '–'}</div></div>
          <div><div class="muted small">Your usual mistakes</div><div class="v">${usualFalse != null ? usualFalse.toFixed(1) : 'Building'}</div></div>
        </div>
        <p class="muted">More mistaken taps than usual can be a sign of fatigue or stress. Check your sleep and mood if this keeps happening.</p>
        <div class="btn-row"><button class="btn ghost" data-again>${icon('refresh')}Play again</button><a class="btn ghost" href="#/games">All games</a></div>
      </div>`;
    after.querySelector('[data-again]').addEventListener('click', intro);
  }

  intro();
  return () => { active = false; clear(); window.removeEventListener('keydown', onKey); };
}

// ---------------- Star map (memory span) ----------------
async function stars(main) {
  const { arena, after } = arenaPage(main, 'stars');
  let timers = [], seq = [], input = [], len = 3, best = 0, fails = 0, accepting = false, alive = true;
  const clear = () => { timers.forEach(clearTimeout); timers = []; };

  function grid(msg) {
    arena.innerHTML = `<div class="hud"><span>${esc(msg)}</span><span>Best: ${best}</span></div><div class="star-grid">${Array.from({ length: 16 }, (_, i) => `<button type="button" data-i="${i}" aria-label="Star ${i + 1}">${icon('star')}</button>`).join('')}</div>`;
    arena.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); pick(Number(b.dataset.i), b); }));
  }

  function intro() {
    arena.innerHTML = `<div class="center"><div class="stack" style="justify-items:center;max-width:420px"><p>Stars will light up one at a time. When they stop, tap them in the same order. Each round adds one star. Two misses in a row ends the game.</p><button class="btn" data-start>${icon('play')}Start</button></div></div>`;
    arena.querySelector('[data-start]').addEventListener('click', (e) => { e.stopPropagation(); len = 3; best = 0; fails = 0; after.innerHTML = ''; round(); });
  }

  function round() {
    seq = []; input = []; accepting = false;
    while (seq.length < len) { const n = Math.floor(Math.random() * 16); if (seq.at(-1) !== n) seq.push(n); }
    grid(`Watch: ${len} stars`);
    seq.forEach((n, i) => {
      timers.push(setTimeout(() => { arena.querySelector(`[data-i="${n}"]`)?.classList.add('lit'); }, 700 + i * 850));
      timers.push(setTimeout(() => { arena.querySelector(`[data-i="${n}"]`)?.classList.remove('lit'); }, 700 + i * 850 + 550));
    });
    timers.push(setTimeout(() => { if (!alive) return; accepting = true; arena.querySelector('.hud span').textContent = 'Your turn'; arena.querySelector('[data-i]')?.focus(); }, 700 + seq.length * 850));
  }

  function pick(i, btn) {
    if (!accepting) return;
    btn.classList.add('lit'); timers.push(setTimeout(() => btn.classList.remove('lit'), 220));
    input.push(i);
    const k = input.length - 1;
    if (input[k] !== seq[k]) {
      accepting = false; btn.classList.add('wrong'); fails++;
      if (fails >= 2) { timers.push(setTimeout(finish, 600)); return; }
      arena.querySelector('.hud span').textContent = 'Missed. Same length again.';
      timers.push(setTimeout(round, 1200));
      return;
    }
    if (input.length === seq.length) {
      accepting = false; best = Math.max(best, len); fails = 0; len++;
      arena.querySelector('.hud span').textContent = 'Correct';
      timers.push(setTimeout(round, 900));
    }
  }

  async function finish() {
    const prev = await games('stars');
    const rec = { id: store.uid(), game: 'stars', at: new Date().toISOString(), date: dayKey(), span: best, sample: false };
    await saveResult(rec);
    const usual = prev.length >= 3 ? median(prev.slice(-10).map((p) => p.span)) : null;
    arena.innerHTML = `<div class="center"><div class="stack" style="justify-items:center"><span class="muted">Stars remembered</span><span style="font-size:3rem;font-weight:600">${best}</span>${usual != null ? `<span class="muted">Your usual: ${usual}</span>` : ''}</div></div>`;
    after.innerHTML = `<div class="btn-row"><button class="btn ghost" data-again>${icon('refresh')}Play again</button><a class="btn ghost" href="#/games">All games</a></div>`;
    after.querySelector('[data-again]').addEventListener('click', intro);
  }

  intro();
  return () => { alive = false; clear(); };
}
