import { icon } from '../icons.js';
import { esc, statusChip, prefersReducedMotion, plural } from '../ui.js';
import * as store from '../store.js';
import { settings, mission, missionDay, homeTime } from '../missions.js';
import { latestStatuses, todayCheckin, tasksToday, streak, badges, latestReaction } from '../data.js';
import { summarise, INDICATORS } from '../health.js';

export async function render(main) {
  const s = settings();
  const m = mission();
  const role = s.role;
  const day = missionDay();
  const home = homeTime();
  const firstName = s.name.replace(/^(Commander|Captain|Dr\.?|Flight Engineer)\s+/i, '').split(' ')[0] || s.name;
  const today = await todayCheckin();
  const latest = await latestStatuses();
  const sum = today ? summarise(today.statuses, today.symptoms) : null;
  const reaction = await latestReaction();
  const crew = await store.get('crew', null);
  const inbox = await store.all('inbox');
  const unread = inbox.filter((r) => !r.mine && r.kind !== 'report' && !r.opened_at && new Date(r.deliver_at) <= new Date()).length;

  let intro = '';
  if (role === 'astronaut') {
    intro = `
      <p class="kicker">${esc(s.name)}, ${esc(m.place)}</p>
      <h1>Day ${day} ${m.world === 'mars' ? 'on Mars' : m.world === 'moon' ? 'on the Moon' : 'in orbit'}</h1>
      ${sum ? `<p class="status-line">${statusChip(sum.level, '')}<span>${esc(sum.text)}</span></p>` : '<p class="status-line">No check-in yet today. It takes about 2 minutes.</p>'}
      <div class="btn-row">${today ? `<a class="btn ghost" href="#/trends">${icon('trends')}See trends</a>` : `<a class="btn" href="#/check-in">${icon('checkin')}Start check-in</a>`}<a class="btn ghost" href="#/body">${icon('body')}Body status</a></div>`;
  } else if (role === 'family') {
    intro = `
      <p class="kicker">${esc(crew?.name || 'Family view')}</p>
      <h1>${esc(firstName)} is ${m.world === 'mars' ? 'on Mars' : m.world === 'moon' ? 'on the Moon' : 'in orbit'}</h1>
      <p class="status-line">Messages take ${esc(m.delayText)} to reach ${esc(firstName)}. ${esc(m.liveCall)}</p>
      <div class="btn-row"><a class="btn" href="#/messages">${icon('video')}Record a message</a></div>`;
  } else {
    intro = `
      <p class="kicker">Flight surgeon, ${esc(m.inSentence)}</p>
      <h1>Crew health reports</h1>
      <p class="status-line">Reports arrive after the ${esc(m.delayText)} signal delay. Only what the astronaut chooses to share appears here.</p>
      <div class="btn-row"><a class="btn" href="#/surgeon">${icon('surgeon')}Open reports</a></div>`;
  }

  main.innerHTML = `
    <div class="page today">
      <section class="today-intro">
        ${intro}
        <p class="scroll-cue">${icon('arrowDown')}Scroll to pull back from the horizon</p>
      </section>
      <div class="today-spacer" aria-hidden="true"></div>
      <section class="today-panels" id="panels"></section>
      <div id="home-label" class="home-label" hidden></div>
    </div>`;

  const panels = main.querySelector('#panels');
  if (role === 'astronaut') panels.innerHTML = await astronautPanels({ sum, latest, reaction, day, m, home, unread, crew });
  else if (role === 'family') panels.innerHTML = familyPanels({ m, home, firstName, unread, day });
  else panels.innerHTML = surgeonPanels({ m, crew });

  // Hero
  const reduced = prefersReducedMotion();
  let hero = null;
  const canvas = document.getElementById('hero-canvas');
  const label = main.querySelector('#home-label');
  try {
    const { createHero } = await import('../hero.js');
    hero = createHero(canvas, { world: m.world, home: s.homeCity, reduced });
  } catch (e) { console.warn('Hero unavailable', e); }
  if (hero) document.body.classList.add('hero-on');
  else document.body.classList.add('hero-still');

  const intro2 = main.querySelector('.today-intro');
  const spacer = main.querySelector('.today-spacer');
  function onScroll() {
    const end = intro2.offsetHeight + spacer.offsetHeight * 0.55; // globe is complete before the panels arrive
    const p = Math.min(1, window.scrollY / Math.max(1, end));
    hero?.setProgress(p);
    intro2.style.opacity = String(Math.max(0, 1 - p * 1.6));
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  if (hero && m.world === 'earth') {
    hero.onFrame(() => {
      const pos = hero.homeScreenPos();
      if (!pos || window.scrollY < 40) { label.hidden = true; return; }
      label.hidden = false;
      label.style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)`;
    });
    label.innerHTML = `<span class="dot"></span><span>${esc(home.city)}, ${esc(home.time)}</span>`;
  }

  return () => {
    window.removeEventListener('scroll', onScroll);
    hero?.dispose();
    document.body.classList.remove('hero-on', 'hero-still');
  };
}

async function astronautPanels({ sum, latest, reaction, day, m, home, unread, crew }) {
  const tasks = await tasksToday();
  const st = await streak();
  const b = await badges();
  const rows = INDICATORS.filter((i) => latest[i.id]).map((i) => {
    const l = latest[i.id];
    return `<div class="reading-row"><span class="status-bar ${l.level}"></span><div class="what"><strong>${esc(i.short)}</strong><span class="muted small">${l.today ? 'Today' : 'Last reading'}: ${esc(i.format(pickVals(l.values, i)))} ${esc(i.unitShort || i.unit)}</span></div>${statusChip(l.level)}</div>`;
  }).join('');
  const reactRow = reaction ? `<div class="reading-row"><span class="status-bar ${reaction.status.level}"></span><div class="what"><strong>Reaction time</strong><span class="muted small">${reaction.result.medianMs} ms median. ${esc(reaction.status.reason)}</span></div>${statusChip(reaction.status.level)}</div>` : '';
  const overall = sum || { level: 'none', text: 'Check in to see today’s status.' };
  return `
    <article class="panel stack">
      <div class="big-status"><div class="glyph ${overall.level}">${icon(overall.level === 'none' ? 'none' : overall.level)}</div>
        <div class="stack" style="gap:4px"><h2>${esc(overall.text)}</h2><p class="muted">${sum ? 'From this morning’s check-in.' : 'These are your most recent readings.'}</p></div></div>
      <div>${rows}${reactRow}</div>
      <a href="#/body">Open the body view</a>
    </article>
    <div class="stack" style="gap:16px">
      <article class="panel">
        <h3>Due today</h3>
        <ul class="tasks">${tasks.map((t) => `<li class="${t.done ? 'done' : ''}"><span class="tick">${t.done ? icon('check') : ''}</span><span class="label">${esc(t.label)}</span>${t.done ? '<span class="visually-hidden">Done</span>' : `<a href="${t.href}">Start</a>`}</li>`).join('')}</ul>
      </article>
      <article class="panel stack">
        <h3>Mission</h3>
        <div class="mission-facts">
          <div class="fact"><div class="k">Mission day</div><div class="v">${day}</div></div>
          <div class="fact"><div class="k">Gravity</div><div class="v">${esc(m.gravityShort)}</div></div>
          <div class="fact"><div class="k">Signal delay to Earth</div><div class="v">${esc(m.delayText)}</div></div>
          <div class="fact"><div class="k">At home in ${esc(home.city)}</div><div class="v">${esc(home.time)}, ${home.awake ? 'awake' : 'asleep'}</div></div>
        </div>
        <p class="muted small">${esc(m.gravityNote)}</p>
        ${unread ? `<a class="btn ghost" href="#/messages">${icon('envelope')}${plural(unread, 'new message')} from home</a>` : crew ? '' : `<a href="#/messages">Set up family messages</a>`}
      </article>
      <article class="panel stack">
        <div class="spread"><h3>Check-in streak</h3><span class="badge">${icon('flame')}${plural(st, 'day')}</span></div>
        <div class="streak">${b.map((x) => `<span class="badge ${x.earned ? '' : 'locked'}">${icon(x.earned ? 'medal' : 'lock')}${esc(x.name)}</span>`).join('')}</div>
        <p class="muted small">Badges reward the habit of checking, never the results.</p>
      </article>
    </div>`;
}

function pickVals(values, ind) {
  const o = {};
  ind.fields.forEach((f) => { o[f.key] = values?.[f.key]; });
  return o;
}

function familyPanels({ m, home, firstName, unread, day }) {
  return `
    <article class="panel stack">
      <h3>Two clocks</h3>
      <div class="mission-facts">
        <div class="fact"><div class="k">${esc(firstName)}’s mission day</div><div class="v">${day}</div></div>
        <div class="fact"><div class="k">Here in ${esc(home.city)}</div><div class="v">${esc(home.time)}</div></div>
        <div class="fact"><div class="k">A message takes</div><div class="v">${esc(m.delayText)}</div></div>
      </div>
      <p class="muted">${esc(m.liveCall)} Recorded messages always get through; they just take time.</p>
    </article>
    <article class="panel stack">
      <h3>${unread ? plural(unread, 'new message') : 'Messages'}</h3>
      <p class="muted">Short videos and voice notes work best: they are quicker to send across the distance. You can also leave an “open when…” message for a birthday or a hard day.</p>
      <div class="btn-row"><a class="btn" href="#/messages">${icon('messages')}Open messages</a></div>
      <p class="disclaimer">Family members never see health readings. Those stay with the astronaut and their flight surgeon.</p>
    </article>`;
}

function surgeonPanels({ m, crew }) {
  return `
    <article class="panel stack">
      <h3>How reports reach you</h3>
      <p class="muted">The astronaut runs a daily check-in on board. When a result is amber or red, Horizon offers to send you a report with that day’s readings and a 7-day trend. Reports travel with the ${esc(m.delayText)} delay.</p>
      <div class="btn-row"><a class="btn" href="#/surgeon">${icon('surgeon')}Open reports</a><a class="btn ghost" href="#/messages">${icon('messages')}Messages</a></div>
      ${crew ? '' : '<p class="muted small">You are not in a crew space yet. Join with the code the astronaut sent you, on the Messages page.</p>'}
    </article>`;
}
