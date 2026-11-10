import { icon } from '../icons.js';
import { esc, statusChip } from '../ui.js';
import { INDICATORS, byId, HAZARDS, HAZARD_INFO, REGIONS, actionsFor } from '../health.js';

const FEATURES = {
  radiation: ['Temperature and immune checks catch infection early.', 'Body page notes on radiation effects.'],
  isolation: ['Mood check-in every day.', 'Reaction games to spot fatigue.', 'Recorded messages and “open when…” letters from home.'],
  distance: ['Clear self-assessment with colour status.', 'Action cards for every amber or red result.', 'Store-and-forward reports to the flight surgeon, with the real signal delay.', 'Works with no connection.'],
  gravity: ['Blood pressure, heart rate and exercise tracking.', 'Mission setting adjusts guidance for station, Moon or Mars gravity.', 'Body page for bones, muscles, heart and eyes.'],
  environment: ['Daily prompts for routine checks.', 'Sleep tracking in a noisy, artificially lit cabin.', 'Temperature checks to catch illness spreading.'],
};

export async function render(main, { rest }) {
  const [kind, id] = rest || [];
  if (kind === 'reading' && byId[id]) return reading(main, byId[id]);
  if (kind === 'hazard' && HAZARDS[id]) return hazard(main, id);
  if (kind === 'colours') return colours(main);
  if (kind === 'about') return about(main);
  main.innerHTML = `
    <div class="page">
      <div class="page-head"><h1>Learn</h1><p>Plain-language guides to every reading, the five hazards of spaceflight, and how Horizon decides what each colour means.</p></div>
      <section class="section"><h2>Your readings</h2><div class="topic-list">
        ${INDICATORS.map((i) => `<a href="#/learn/reading/${i.id}"><strong>${esc(i.name)}</strong><span>${esc(i.why.split('. ')[0])}.</span></a>`).join('')}
      </div></section>
      <section class="section"><h2>The five hazards of spaceflight</h2><p class="lead">NASA’s Human Research Program groups them as RIDGE.</p><div class="topic-list">
        ${Object.values(HAZARDS).map((h) => `<a href="#/learn/hazard/${h.id}"><strong>${esc(h.name)}</strong><span>${esc(HAZARD_INFO[h.id].summary)}</span></a>`).join('')}
      </div></section>
      <section class="section"><h2>About Horizon</h2><div class="topic-list">
        <a href="#/learn/colours"><strong>How the colours work</strong><span>Green, amber and red, and when to contact the flight surgeon.</span></a>
        <a href="#/learn/about"><strong>Your data and sources</strong><span>What stays on this device, what is shared, and where the guidance comes from.</span></a>
      </div></section>
    </div>`;
}

function back() {
  return `<p><a href="#/learn">${icon('arrowLeft').replace('<svg', '<svg style="width:16px;height:16px;display:inline;vertical-align:-3px"')} All topics</a></p>`;
}

function reading(main, ind) {
  const regions = REGIONS.filter((r) => r.indicators.includes(ind.id));
  const sample = (level, kind) => actionsFor(ind, { level, kind });
  main.innerHTML = `
    <div class="page">
      <div class="page-head">${back()}<h1>${esc(ind.name)}</h1><p>${esc(ind.why)}</p></div>
      <div class="prose">
        <h2>In space</h2><p>${esc(ind.space)}</p>
        <h2>How to measure</h2><ol>${ind.howTo.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        <h2>What the colours mean</h2>
        <table class="ranges"><thead><tr><th>Status</th><th>Range (${esc(ind.unitShort || ind.unit)})</th></tr></thead><tbody>
          <tr><td>${statusChip('ok')}</td><td>${esc(ind.ranges.ok)}</td></tr>
          <tr><td>${statusChip('warn')}</td><td>${esc(ind.ranges.warn)}</td></tr>
          <tr><td>${statusChip('bad')}</td><td>${esc(ind.ranges.bad)}</td></tr>
        </tbody></table>
        <h2>If it needs a recheck</h2><ul>${(sample('warn', 'high').length ? sample('warn', 'high') : sample('warn', 'low')).map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
        <h2>If it needs action now</h2><ul>${(sample('bad', 'high').length ? sample('bad', 'high') : sample('bad', 'low')).map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
        <h2>Linked body parts and hazards</h2>
        <div class="hazard-tags">${regions.map((r) => `<span>${esc(r.name)}</span>`).join('')}${ind.hazards.map((h) => `<span>${HAZARDS[h].name}</span>`).join('')}</div>
        <p class="disclaimer">Ranges are approximate general guidance for adults and must be checked against cited sources before real use. Always follow your flight surgeon’s advice.</p>
      </div>
    </div>`;
}

function hazard(main, id) {
  const h = HAZARDS[id], info = HAZARD_INFO[id];
  main.innerHTML = `
    <div class="page">
      <div class="page-head">${back()}<h1>${esc(h.name)}</h1><p>${esc(info.summary)}</p></div>
      <div class="prose">
        <h2>What it can do to the body</h2><ul>${info.effects.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
        <h2>What helps</h2><ul>${info.helps.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
        <h2>How Horizon helps</h2><ul>${FEATURES[id].map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
      </div>
    </div>`;
}

function colours(main) {
  main.innerHTML = `
    <div class="page">
      <div class="page-head">${back()}<h1>How the colours work</h1><p>Every reading gets one of three statuses. Colour is always paired with an icon and a word, so it never relies on colour alone.</p></div>
      <div class="prose">
        <table class="ranges"><tbody>
          <tr><td>${statusChip('ok')}</td><td>Within the healthy range. Nothing to do.</td></tr>
          <tr><td>${statusChip('warn')}</td><td>Outside the ideal range, or a change from your usual. Follow the action card and measure again.</td></tr>
          <tr><td>${statusChip('bad')}</td><td>Needs action now. Follow the action card, and send a report to the flight surgeon.</td></tr>
        </tbody></table>
        <h2>Every range at a glance</h2>
        <table class="ranges"><thead><tr><th>Reading</th><th>In range</th><th>Recheck</th><th>Act now</th></tr></thead><tbody>
          ${INDICATORS.map((i) => `<tr><td><a href="#/learn/reading/${i.id}">${esc(i.short)}</a> <span class="muted small">(${esc(i.unitShort || i.unit)})</span></td><td>${esc(i.ranges.ok)}</td><td>${esc(i.ranges.warn)}</td><td>${esc(i.ranges.bad)}</td></tr>`).join('')}
          <tr><td>Reaction time</td><td>Within your usual</td><td>10–20% slower, or 2 or more lapses</td><td>Over 20% slower, or 5 or more lapses</td></tr>
        </tbody></table>
        <h2>Your own normal</h2>
        <p>Trends compare each reading with your own usual range, worked out from your earlier readings. Some readings run differently in space, so a change from your usual can matter more than a population average.</p>
        <h2>Symptoms always come first</h2>
        <p>If you report chest pain, fainting, shortness of breath, a severe headache, a sudden change in vision or confusion, Horizon shows red straight away and asks you to contact the flight surgeon, whatever your readings say.</p>
        <p class="disclaimer">The reaction-time thresholds are placeholders to be tuned with real test data.</p>
      </div>
    </div>`;
}

function about(main) {
  main.innerHTML = `
    <div class="page">
      <div class="page-head">${back()}<h1>Your data and sources</h1><p>Horizon is built to work far from Earth: it runs fully on the device and only sends what you choose.</p></div>
      <div class="prose">
        <h2>What stays on this device</h2>
        <ul><li>Every check-in, reading, game result and trend.</li><li>Messages you have received, including videos, so you can watch them offline.</li></ul>
        <h2>What is sent, and to whom</h2>
        <ul><li>Messages you record, to the people in your crew space.</li><li>Health reports, only when you press send, and only to your crew’s flight surgeon.</li><li>Family members never see health readings.</li></ul>
        <h2>Sources</h2>
        <ul>
          <li><a href="https://www.nasa.gov/hrp/" rel="noopener">NASA Human Research Program</a>, for the five hazards of spaceflight and their effects on health.</li>
          <li>The Psychomotor Vigilance Test used on the space station, and NASA’s Cognition test battery, for the reaction games.</li>
          <li>General adult clinical guidance for blood pressure, heart rate, blood sugar and temperature ranges.</li>
        </ul>
        <p class="disclaimer">Prototype for the NASA Space Apps Challenge. Not a medical device. Ranges are approximate and must be checked against cited sources before real use. Earth imagery is derived from NASA’s Blue Marble and Black Marble. Moon and Mars surfaces are generated, not real maps.</p>
      </div>
    </div>`;
}
