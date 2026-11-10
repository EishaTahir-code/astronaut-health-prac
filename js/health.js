// Health indicators, colour-coded ranges and guidance.
// Ranges are approximate general adult guidance, to be checked against cited
// sources before any real use. Horizon is not a medical device.

const RANK = { none: 0, ok: 1, warn: 2, bad: 3 };
export const worst = (levels) => levels.reduce((w, l) => (RANK[l] > RANK[w] ? l : w), 'none');

export const HAZARDS = {
  radiation: { id: 'radiation', letter: 'R', name: 'Radiation' },
  isolation: { id: 'isolation', letter: 'I', name: 'Isolation and confinement' },
  distance: { id: 'distance', letter: 'D', name: 'Distance from Earth' },
  gravity: { id: 'gravity', letter: 'G', name: 'Gravity fields' },
  environment: { id: 'environment', letter: 'E', name: 'Hostile closed environment' },
};

export const SYMPTOMS = [
  { id: 'chest', label: 'Chest pain or pressure' },
  { id: 'faint', label: 'Fainting, or feeling about to faint' },
  { id: 'breath', label: 'Short of breath at rest' },
  { id: 'headache', label: 'Severe or sudden headache' },
  { id: 'vision', label: 'Sudden change in vision' },
  { id: 'confusion', label: 'Confusion or trouble speaking' },
];

const recentValues = (history, key, n) => history.slice(-n).map((c) => c.values?.[key]).filter((v) => v != null);

export const INDICATORS = [
  {
    id: 'bp', name: 'Blood pressure', short: 'Blood pressure', unit: 'mmHg', regions: ['heart'], hazards: ['gravity', 'isolation'],
    fields: [
      { key: 'sys', label: 'Top number (systolic)', min: 60, max: 260, step: 1, placeholder: '118' },
      { key: 'dia', label: 'Bottom number (diastolic)', min: 30, max: 160, step: 1, placeholder: '76' },
    ],
    format: (v) => `${v.sys}/${v.dia}`,
    howTo: [
      'Rest quietly for 5 minutes with your back supported and your feet anchored.',
      'Wrap the cuff around your bare upper arm, level with your heart.',
      'Stay still and silent while the cuff inflates.',
      'Take two readings a minute apart and enter the second one.',
    ],
    why: 'High blood pressure strains the heart and blood vessels. Low blood pressure can make you dizzy or faint.',
    space: 'In weightlessness, body fluids shift toward the head and the heart’s workload changes. Many astronauts feel dizzy when they stand up again after landing.',
    ranges: { ok: 'Below 120/80', warn: '120–139 or 80–89, or below 90/60', bad: '140/90 or higher, or low with dizziness' },
    evaluate(v, history, symptoms = []) {
      const { sys, dia } = v;
      if (sys >= 180 || dia >= 120) return { level: 'bad', reason: 'Very high. Rest, recheck now and contact the flight surgeon.', kind: 'high' };
      if (sys >= 140 || dia >= 90) return { level: 'bad', reason: 'High. Rest and recheck in 5 minutes.', kind: 'high' };
      if (sys < 90 || dia < 60) {
        if (symptoms.includes('faint')) return { level: 'bad', reason: 'Low, with dizziness or fainting.', kind: 'low' };
        return { level: 'warn', reason: 'Lower than usual. Fine if you feel well.', kind: 'low' };
      }
      if (sys >= 120 || dia >= 80) return { level: 'warn', reason: 'A little above the healthy range.', kind: 'high' };
      return { level: 'ok', reason: 'In the healthy range.' };
    },
    actions: {
      'warn-high': ['Rest for 5 minutes and recheck.', 'Go easy on salt and caffeine today.', 'Keep up your scheduled exercise.', 'Recheck tomorrow morning at the same time.'],
      'warn-low': ['Drink 500 ml of water or rehydration fluid.', 'Move slowly when you change position.', 'Recheck in 30 minutes.'],
      'bad-high': ['Stop what you are doing and rest for 5 minutes, then recheck.', 'If it is still 140/90 or higher, send a report to the flight surgeon.', 'If you also have chest pain, a severe headache or vision changes, contact the flight surgeon now.'],
      'bad-low': ['Secure yourself and rest, legs higher than your head if you can.', 'Drink fluids once the dizziness passes.', 'Contact the flight surgeon now.'],
    },
  },
  {
    id: 'hr', name: 'Resting heart rate', short: 'Heart rate', unit: 'beats per minute', unitShort: 'bpm', regions: ['heart'], hazards: ['gravity', 'isolation'],
    fields: [{ key: 'hr', label: 'Beats per minute, at rest', min: 25, max: 220, step: 1, placeholder: '64' }],
    format: (v) => `${v.hr}`,
    howTo: [
      'Rest for 5 minutes first.',
      'Read it from the blood pressure cuff or chest strap, or count your pulse at the wrist for 30 seconds and double it.',
      'Measure at the same time each day, ideally before coffee.',
    ],
    why: 'Resting heart rate rises with stress, poor sleep, illness and dehydration. A rate that is very fast or very slow can signal a heart rhythm problem.',
    space: 'Spaceflight reduces the heart’s workload and it can lose some muscle. Fit people often rest below 60, which is usually normal for them.',
    ranges: { ok: '60–100', warn: '40–59 or 101–120 with no symptoms', bad: 'Below 40 or above 120 at rest, or with chest pain or fainting' },
    evaluate(v, history, symptoms = []) {
      const hr = v.hr;
      const sym = symptoms.includes('chest') || symptoms.includes('faint');
      if (hr < 40 || hr > 120 || (sym && (hr < 60 || hr > 100))) return { level: 'bad', reason: hr > 100 ? 'Too fast for rest.' : 'Very slow.', kind: hr > 100 ? 'high' : 'low' };
      if (hr > 100) return { level: 'warn', reason: 'Faster than usual for rest.', kind: 'high' };
      if (hr < 60) return { level: 'warn', reason: 'Slow. Often normal for fit people.', kind: 'low' };
      return { level: 'ok', reason: 'In the normal resting range.' };
    },
    actions: {
      'warn-high': ['Rest quietly for 10 minutes and recheck.', 'Drink water; dehydration raises heart rate.', 'Think about caffeine, stress or recent exercise.'],
      'warn-low': ['If you feel well, this is often normal for fit people.', 'Recheck later today.', 'Report it if you feel dizzy, faint or short of breath.'],
      'bad-high': ['Stop activity and rest.', 'Recheck in 5 minutes.', 'If it stays above 120, or you have chest pain or feel faint, contact the flight surgeon now.'],
      'bad-low': ['Rest and recheck in 5 minutes.', 'If it stays below 40, or you feel faint, contact the flight surgeon now.'],
    },
  },
  {
    id: 'glucose', name: 'Blood sugar (fasting)', short: 'Blood sugar', unit: 'mg/dL', regions: ['blood'], hazards: ['gravity', 'environment'],
    fields: [{ key: 'glucose', label: 'Fasting blood sugar', min: 20, max: 600, step: 1, placeholder: '88' }],
    format: (v) => `${v.glucose}`,
    howTo: [
      'Measure before breakfast, at least 8 hours after your last meal.',
      'Wash and dry your hands.',
      'Prick the side of a fingertip and touch the test strip to the drop.',
      'Enter the number from the meter. To convert mmol/L, multiply by 18.',
    ],
    why: 'Blood sugar shows how well your body handles energy from food. High fasting levels can point to insulin resistance; low levels cause shakiness and confusion.',
    space: 'Less physical activity in space can make the body less sensitive to insulin. Meals are fixed, so changes are easier to spot.',
    ranges: { ok: '70–99', warn: '100–125, or 54–69', bad: '126 or higher, or below 54' },
    evaluate(v) {
      const g = v.glucose;
      if (g < 54) return { level: 'bad', reason: 'Too low.', kind: 'low' };
      if (g >= 126) return { level: 'bad', reason: 'High for a fasting reading.', kind: 'high' };
      if (g < 70) return { level: 'warn', reason: 'A little low.', kind: 'low' };
      if (g >= 100) return { level: 'warn', reason: 'A little high for a fasting reading.', kind: 'high' };
      return { level: 'ok', reason: 'In the healthy fasting range.' };
    },
    actions: {
      'warn-high': ['Recheck tomorrow morning before eating.', 'Choose lower-sugar options from today’s menu.', 'Keep up your exercise sessions.'],
      'warn-low': ['Eat or drink 15 g of fast sugar, such as juice or glucose tablets.', 'Recheck in 15 minutes.', 'Have a proper meal once it is back above 70.'],
      'bad-high': ['Recheck to rule out a meter error.', 'If it is still 126 or higher, send a report to the flight surgeon.', 'Drink water and avoid sugary food until you hear back.'],
      'bad-low': ['Take 15–20 g of fast sugar now.', 'Recheck in 15 minutes and repeat if still low.', 'Tell a crewmate and contact the flight surgeon.'],
    },
  },
  {
    id: 'temp', name: 'Body temperature', short: 'Temperature', unit: '°C', regions: ['immune'], hazards: ['environment', 'radiation'],
    fields: [{ key: 'temp', label: 'Temperature', min: 30, max: 44, step: 0.1, placeholder: '36.7' }],
    format: (v) => `${Number(v.temp).toFixed(1)}`,
    howTo: [
      'Measure before exercise, and not straight after a hot or cold drink.',
      'Use the same thermometer in the same place (mouth, ear or forehead) each day.',
      'Wait for the beep, then enter the number.',
    ],
    why: 'A fever is often the first sign of an infection. In a small crew, catching it early protects everyone.',
    space: 'Studies have reported core body temperature running higher during long missions, especially with exercise. The immune system also changes in space.',
    ranges: { ok: '36.1–37.2', warn: '37.3–37.9, or 35.0–36.0', bad: '38.0 or higher, or below 35.0' },
    evaluate(v) {
      const t = Number(v.temp);
      if (t >= 38) return { level: 'bad', reason: 'Fever.', kind: 'high' };
      if (t < 35) return { level: 'bad', reason: 'Too low.', kind: 'low' };
      if (t >= 37.3) return { level: 'warn', reason: 'Slightly raised.', kind: 'high' };
      if (t < 36.1) return { level: 'warn', reason: 'A little low.', kind: 'low' };
      return { level: 'ok', reason: 'Normal.' };
    },
    actions: {
      'warn-high': ['Rest and drink fluids.', 'Recheck in 4 hours.', 'Watch for chills, sore throat or cough.'],
      'warn-low': ['Add a layer and have a warm drink.', 'Recheck in 1 hour.'],
      'bad-high': ['Keep your distance from the crew where you can, and wipe shared surfaces.', 'Rest and drink plenty of fluids.', 'Send a report to the flight surgeon with any other symptoms.'],
      'bad-low': ['Warm up gradually with layers and warm drinks.', 'Contact the flight surgeon if it stays below 35.'],
    },
  },
  {
    id: 'sleep', name: 'Sleep', short: 'Sleep', unit: 'hours', regions: ['brain'], hazards: ['isolation', 'environment'],
    fields: [{ key: 'sleep', label: 'Hours slept in the last 24 hours', min: 0, max: 16, step: 0.25, placeholder: '7' }],
    format: (v) => `${v.sleep}`,
    howTo: [
      'Count the hours you actually slept, not time spent in your sleep station.',
      'Include naps.',
      'If you wear a sleep tracker, use its total.',
    ],
    why: 'Sleep loss slows reactions, lowers mood and weakens the immune system. It builds up over several nights.',
    space: 'In orbit the Sun rises every 90 minutes, and cabins are noisy. Studies have found crews sleep about 6 hours a night on average, less than scheduled.',
    ranges: { ok: '7 hours or more', warn: '6–7 hours, or one night under 6', bad: 'Under 6 hours for 2 or more nights' },
    evaluate(v, history) {
      const s = Number(v.sleep);
      const prev = recentValues(history, 'sleep', 1);
      if (s < 6 && prev.length && prev[0] < 6) return { level: 'bad', reason: 'Second short night in a row.', kind: 'low' };
      if (s < 6) return { level: 'warn', reason: 'One short night.', kind: 'low' };
      if (s < 7) return { level: 'warn', reason: 'A bit less than you need.', kind: 'low' };
      return { level: 'ok', reason: 'Enough sleep.' };
    },
    actions: {
      'warn-low': ['Aim for lights out on schedule tonight.', 'Dim screens and lights for 30 minutes before sleep.', 'Avoid caffeine after midday.'],
      'bad-low': ['Tell the crew and flight surgeon so they can adjust your schedule.', 'Avoid demanding tasks, such as robotics or spacewalks, until you have rested.', 'Use earplugs, an eye mask and your sleep station’s dim light setting.'],
    },
  },
  {
    id: 'mood', name: 'Mood', short: 'Mood', unit: 'out of 5', regions: ['brain'], hazards: ['isolation', 'distance'],
    fields: [{ key: 'mood', label: 'How has your mood been over the last 24 hours?', min: 1, max: 5, step: 1 }],
    moodWords: ['Very low', 'Low', 'Okay', 'Good', 'Great'],
    format: (v) => `${v.mood}`,
    howTo: [
      'Think about the whole of the last 24 hours, not just this moment.',
      'Pick the number that fits best. There is no right answer.',
    ],
    why: 'Mood affects sleep, focus and how a crew works together. Catching a slide early makes it easier to turn around.',
    space: 'Isolation, a small team, a fixed routine and distance from family all weigh on mood, especially on long missions.',
    ranges: { ok: '4–5', warn: '3, a 2-point drop from usual, or one day at 1–2', bad: '1–2 for 3 or more days' },
    evaluate(v, history) {
      const m = Number(v.mood);
      const prev = recentValues(history, 'mood', 2);
      if (m <= 2 && prev.length === 2 && prev.every((p) => p <= 2)) return { level: 'bad', reason: 'Low for three days in a row.', kind: 'low' };
      if (m <= 2) return { level: 'warn', reason: 'A low day.', kind: 'low' };
      const usual = recentValues(history, 'mood', 14);
      const base = usual.length >= 5 ? usual.sort((a, b) => a - b)[Math.floor(usual.length / 2)] : null;
      if (m === 3) return { level: 'warn', reason: 'Okay, but not great.', kind: 'low' };
      if (base != null && base - m >= 2) return { level: 'warn', reason: 'Lower than usual for you.', kind: 'low' };
      return { level: 'ok', reason: 'Good.' };
    },
    actions: {
      'warn-low': ['Make time for something you enjoy today: music, a film, or the view from the window.', 'Open a message from home, or record one.', 'Talk to a crewmate. Check your sleep too; mood and sleep affect each other.'],
      'bad-low': ['Book a private conference with the flight surgeon or psychologist.', 'Tell a crewmate you trust how you are doing.', 'Lighten your schedule where you can, and keep to regular sleep.'],
    },
  },
  {
    id: 'exercise', name: 'Exercise', short: 'Exercise', unit: 'minutes', regions: ['bones', 'muscles'], hazards: ['gravity'], optional: true,
    fields: [{ key: 'exercise', label: 'Minutes of exercise yesterday', min: 0, max: 400, step: 5, placeholder: '120' }],
    format: (v) => `${v.exercise}`,
    howTo: [
      'Add up treadmill, bike and resistance training time from yesterday.',
      'Do not count setup or cleanup.',
    ],
    why: 'Exercise is the main way crews protect bone, muscle and heart fitness in low gravity.',
    space: 'On the space station, crews exercise about 2 hours a day. Without it, weight-bearing bones can lose about 1% of their density each month.',
    ranges: { ok: '90 minutes or more', warn: '30–89 minutes', bad: 'Under 30 minutes' },
    evaluate(v) {
      const e = Number(v.exercise);
      if (e < 30) return { level: 'bad', reason: 'Well below your daily target.', kind: 'low' };
      if (e < 90) return { level: 'warn', reason: 'Below your daily target.', kind: 'low' };
      return { level: 'ok', reason: 'On target.' };
    },
    actions: {
      'warn-low': ['Book an extra session today if your schedule allows.', 'Prioritise resistance training for legs, hips and back.'],
      'bad-low': ['Make up the session today: aim for at least 60 minutes.', 'Tell mission control if the schedule keeps squeezing exercise out.'],
    },
  },
];

export const byId = Object.fromEntries(INDICATORS.map((i) => [i.id, i]));

// Reaction-time check (Signal lock) against the astronaut's own baseline.
export function evaluateReaction(result, previous) {
  const base = previous.slice(-14).map((r) => r.medianMs).filter(Boolean);
  if (base.length < 3) return { level: 'ok', reason: 'Building your personal baseline.', baseline: null, slower: 0 };
  const sorted = [...base].sort((a, b) => a - b);
  const baseline = sorted[Math.floor(sorted.length / 2)];
  const slower = (result.medianMs - baseline) / baseline;
  if (slower > 0.2 || result.lapses >= 5) return { level: 'bad', reason: `${Math.round(slower * 100)}% slower than your usual.`, baseline, slower };
  if (slower > 0.1 || result.lapses >= 2) return { level: 'warn', reason: slower > 0.1 ? `${Math.round(slower * 100)}% slower than your usual.` : `${result.lapses} lapses.`, baseline, slower };
  return { level: 'ok', reason: 'In line with your usual.', baseline, slower };
}

export const REACTION_GUIDE = {
  warn: ['Check your sleep: short nights are the most common cause.', 'Take a short break before demanding tasks.', 'Repeat the test later today.'],
  bad: ['Avoid safety-critical work, such as robotics or spacewalks, until you have rested.', 'Tell the crew and send a report to the flight surgeon.', 'Repeat the test after rest.'],
};

export function evaluateCheckin(values, history = [], symptoms = []) {
  const statuses = {};
  for (const ind of INDICATORS) {
    const v = pick(values, ind);
    if (!v) continue;
    statuses[ind.id] = ind.evaluate(v, history, symptoms);
  }
  let overall = worst(Object.values(statuses).map((s) => s.level));
  if (symptoms.length) overall = 'bad';
  return { statuses, overall };
}

export function pick(values, ind) {
  if (!values) return null;
  const out = {};
  for (const f of ind.fields) {
    const v = values[f.key];
    if (v == null || v === '' || Number.isNaN(Number(v))) return null;
    out[f.key] = Number(v);
  }
  return out;
}

export function actionsFor(ind, status) {
  if (!status || status.level === 'ok' || status.level === 'none') return [];
  const key = `${status.level}-${status.kind || 'high'}`;
  return ind.actions[key] || ind.actions[`${status.level}-low`] || ind.actions[`${status.level}-high`] || [];
}

export function summarise(statuses, symptoms = []) {
  if (symptoms.length) return { level: 'bad', text: 'You reported a symptom that needs the flight surgeon now.' };
  const entries = Object.entries(statuses);
  if (!entries.length) return { level: 'none', text: 'No check-in yet today.' };
  const bad = entries.filter(([, s]) => s.level === 'bad').map(([id]) => byId[id].short.toLowerCase());
  const warn = entries.filter(([, s]) => s.level === 'warn').map(([id]) => byId[id].short.toLowerCase());
  const list = (a) => (a.length === 1 ? a[0] : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  if (bad.length) return { level: 'bad', text: `${cap(list(bad))} ${bad.length === 1 ? 'needs' : 'need'} action now${warn.length ? `; ${list(warn)} ${warn.length === 1 ? 'needs' : 'need'} a recheck` : ''}.` };
  if (warn.length) return { level: 'warn', text: `${cap(list(warn))} ${warn.length === 1 ? 'needs' : 'need'} a recheck.` };
  return { level: 'ok', text: 'All readings are in range.' };
}

// Body regions for the clickable figure.
export const REGIONS = [
  {
    id: 'brain', name: 'Brain and mind', x: 120, y: 42, indicators: ['mood', 'sleep'], reaction: true, hazards: ['isolation', 'radiation', 'distance'],
    does: 'Runs thinking, memory, mood, sleep and reaction speed.',
    space: 'Isolation, broken sleep and a demanding schedule can lower mood and slow reactions. Space radiation is also being studied for effects on the brain.',
    helps: ['Keep a regular sleep schedule.', 'Take the reaction test daily to catch fatigue.', 'Stay in touch with home and make time for hobbies.'],
  },
  {
    id: 'eyes', name: 'Eyes', x: 120, y: 72, indicators: [], hazards: ['gravity'],
    does: 'Focus light onto the retina so you can see clearly.',
    space: 'On long missions many astronauts develop swelling at the back of the eye and a slightly flattened eyeball, called spaceflight-associated neuro-ocular syndrome (SANS). It can blur vision.',
    helps: ['Read the onboard eye chart once a week.', 'Report blurred or changed vision right away.', 'Keep scheduled eye scans with the crew medical officer.'],
    notTracked: 'Not part of the daily check-in. Use the weekly eye chart test.',
  },
  {
    id: 'heart', name: 'Heart and circulation', x: 136, y: 168, indicators: ['bp', 'hr'], hazards: ['gravity', 'radiation'],
    does: 'Pumps blood, oxygen and nutrients around the body.',
    space: 'Without gravity the heart works less and can shrink slightly. Fluid moves toward the head. After landing, many astronauts feel faint when standing.',
    helps: ['Do your aerobic exercise every day.', 'Stay hydrated.', 'Keep salt moderate.'],
  },
  {
    id: 'immune', name: 'Immune system', x: 102, y: 212, indicators: ['temp'], hazards: ['environment', 'radiation', 'isolation'],
    does: 'Fights infection and helps the body heal.',
    space: 'Spaceflight changes how immune cells behave. Dormant viruses, like the one behind cold sores, can wake up, and a closed cabin spreads germs easily.',
    helps: ['Sleep well; it supports immune function.', 'Wash hands and wipe shared surfaces.', 'Report a fever early.'],
  },
  {
    id: 'blood', name: 'Blood sugar and metabolism', x: 52, y: 288, indicators: ['glucose'], hazards: ['gravity', 'environment'],
    does: 'Turns food into energy. Insulin moves sugar from the blood into cells.',
    space: 'Less activity in space can make the body less sensitive to insulin, so fasting blood sugar can creep up.',
    helps: ['Keep up daily exercise.', 'Eat the balanced menu; limit sugary extras.', 'Test fasting blood sugar at the same time each morning.'],
  },
  {
    id: 'bones', name: 'Bones', x: 142, y: 300, indicators: ['exercise'], hazards: ['gravity', 'radiation'],
    does: 'Support the body, protect organs and store calcium.',
    space: 'Without weight on them, bones such as the hips and spine can lose about 1% of their density each month. This also raises the risk of kidney stones.',
    helps: ['Do resistance exercise every day.', 'Get enough calcium and vitamin D.', 'Drink plenty of water to lower kidney stone risk.'],
  },
  {
    id: 'muscles', name: 'Muscles', x: 100, y: 352, indicators: ['exercise'], hazards: ['gravity'],
    does: 'Move the body and hold it upright against gravity.',
    space: 'The muscles that hold you up on Earth, in the calves, thighs and back, weaken quickly when they are not loaded.',
    helps: ['Do resistance training for legs, hips and back.', 'Eat protein with every meal.', 'Log exercise minutes in your check-in.'],
  },
];

export const HAZARD_INFO = {
  radiation: {
    summary: 'Outside Earth’s protective magnetic field, crews are exposed to cosmic rays and bursts of particles from the Sun.',
    effects: ['Raises long-term cancer risk.', 'May affect the brain, heart and eyes.', 'Weakens the immune system.'],
    helps: ['Shielding and a storm shelter for solar events.', 'Wearing a dosimeter to track dose.', 'Planning spacewalks around space weather forecasts.'],
  },
  isolation: {
    summary: 'A small crew in a small space, far from family, for months at a time.',
    effects: ['Lower mood, stress and conflict.', 'Poor sleep.', 'Slower reactions and mistakes when tired.'],
    helps: ['Regular mood and reaction checks.', 'Contact with family and friends.', 'Private time, hobbies and a steady routine.'],
  },
  distance: {
    summary: 'The farther from Earth, the longer messages take and the harder it is to come home quickly.',
    effects: ['No quick evacuation if someone is ill.', 'Mars messages take 4 to 24 minutes each way.', 'Crews must judge and treat health problems themselves.'],
    helps: ['Clear self-checks and guidance on board.', 'Store-and-forward messages to doctors and family.', 'Medical training and supplies for the crew.'],
  },
  gravity: {
    summary: 'Weightlessness during travel, then partial gravity on the Moon or Mars, and back to full gravity on Earth.',
    effects: ['Bone and muscle loss.', 'Fluid shift toward the head and eye changes.', 'Dizziness and balance problems when gravity changes.'],
    helps: ['About 2 hours of exercise a day.', 'Good nutrition.', 'Careful checks around landings.'],
  },
  environment: {
    summary: 'A sealed spacecraft with recycled air and water, constant noise and artificial light.',
    effects: ['Headaches and poor focus from high carbon dioxide.', 'Germs spread easily in a closed space.', 'Disrupted body clock.'],
    helps: ['Monitoring the cabin air.', 'Cleaning and hygiene.', 'Lighting that follows a day-night cycle.'],
  },
};
