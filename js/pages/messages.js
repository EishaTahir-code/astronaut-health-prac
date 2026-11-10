import { icon } from '../icons.js';
import { esc, toast, fmtDateTime, fmtDuration, plural } from '../ui.js';
import * as store from '../store.js';
import { settings, mission, MISSIONS, sendDelaySec, updateSettings } from '../missions.js';
import { queueMessage, items as outboxItems, remove as removeOutbox } from '../outbox.js';

const OPEN_WHEN = ['', 'On your birthday', 'When you miss home', 'After a hard day', 'When you can’t sleep', 'On landing day'];
const MAX_REC_SEC = 90;

export async function render(main, { query }) {
  let crew = await store.get('crew', null);
  const cleanups = [];
  const s = settings();

  async function paint() {
    crew = await store.get('crew', null);
    if (!crew) return paintSetup();
    if (crew.status === 'pending') return paintPending();
    if (crew.status === 'removed') return paintRemoved();
    return paintCrew();
  }

  // ---------- Setup: create or join ----------
  function paintSetup() {
    const code = query.get('code') || '';
    const m = mission();
    const astronautFirst = s.role === 'astronaut' && !code;
    const createCard = `
      <article class="panel stack">
        <h2 style="font-size:1.2rem;font-weight:600">Create a crew space</h2>
        <p class="muted">For the astronaut, before launch. You approve everyone who joins and can remove anyone.</p>
        <form class="stack" data-create>
          <label class="field">Crew space name<input class="input" name="crew" required maxlength="80" value="${esc(s.name.split(' ').at(-1))} family"></label>
          <label class="field">Your name as others will see it<input class="input" name="me" required maxlength="60" value="${esc(s.name)}"></label>
          <button class="btn" type="submit">${icon('users')}Create crew space</button>
        </form>
      </article>`;
    const joinCard = `
      <article class="panel stack">
        <h2 style="font-size:1.2rem;font-weight:600">Join with an invite code</h2>
        <p class="muted">For family and the flight surgeon. The astronaut sends you a 6-character code or link.</p>
        <form class="stack" data-join>
          <label class="field">Invite code<input class="input big" name="code" required maxlength="6" autocapitalize="characters" autocomplete="off" value="${esc(code)}" style="letter-spacing:0.2em;text-transform:uppercase"></label>
          <label class="field">Your name<input class="input" name="me" required maxlength="60" placeholder="Maya"></label>
          <label class="field">Relationship <span class="hint">Optional, for example daughter, partner, flight surgeon</span><input class="input" name="rel" maxlength="40"></label>
          <button class="btn ${astronautFirst ? 'ghost' : ''}" type="submit">${icon('link')}Join</button>
        </form>
      </article>`;
    main.innerHTML = `
      <div class="page">
        <div class="page-head">
          <h1>Messages</h1>
          <p>Recorded video, voice and text messages between the crew, their families and the flight surgeon. Messages wait in an outbox when there is no connection, then travel with the real signal delay.</p>
        </div>
        ${delayStrip(m)}
        <div class="grid-2" style="margin-top:20px">${astronautFirst ? createCard + joinCard : joinCard + createCard}</div>
        <p class="disclaimer" style="margin-top:20px">Setting up needs a connection once. Messages are stored with row-level security, so only approved members of a crew space can read them. Health readings are never sent here.</p>
        <div id="setup-error" class="section"></div>
      </div>`;
    const errBox = main.querySelector('#setup-error');
    const fail = (e) => {
      console.warn(e);
      if (e.code === 'anon-disabled') errBox.innerHTML = `<article class="action-card bad"><h3>Messaging is not switched on yet</h3><p>Anonymous sign-in is turned off for this Supabase project. In the Supabase dashboard, open Authentication, then Sign In / Providers, and turn on “Allow anonymous sign-ins”.</p></article>`;
      else if (!navigator.onLine) errBox.innerHTML = `<article class="action-card warn"><h3>You are offline</h3><p>Connect once to create or join a crew space. After that, messages can be written offline.</p></article>`;
      else errBox.innerHTML = `<article class="action-card bad"><h3>That did not work</h3><p>${esc(e.message || String(e))}</p></article>`;
    };
    main.querySelector('[data-create]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget); const btn = e.currentTarget.querySelector('button'); btn.disabled = true;
      try {
        const supa = await import('../supa.js');
        const id = await supa.createCrew(String(f.get('crew')).trim(), s.mission, String(f.get('me')).trim());
        await store.set('crew', { id, name: String(f.get('crew')).trim(), role: 'astronaut', status: 'approved', mission: s.mission });
        if (s.role !== 'astronaut') await updateSettings({ role: 'astronaut' });
        (await import('../sync.js')).start();
        toast('Crew space created. Invite your family next.', 'users');
        paint();
      } catch (err) { btn.disabled = false; fail(err); }
    });
    main.querySelector('[data-join]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget); const btn = e.currentTarget.querySelector('button'); btn.disabled = true;
      try {
        const supa = await import('../supa.js');
        const row = await supa.joinCrew(String(f.get('code')).trim().toUpperCase(), String(f.get('me')).trim(), String(f.get('rel') || '').trim());
        if (!row) throw new Error('Could not join that crew space.');
        await store.set('crew', { id: row.crew_id, name: row.crew_name, role: row.role, status: row.status, mission: row.mission });
        await updateSettings({ role: row.role, mission: row.mission });
        (await import('../sync.js')).start();
        paint();
      } catch (err) { btn.disabled = false; fail(err); }
    });
  }

  function paintPending() {
    main.innerHTML = `
      <div class="page">
        <div class="page-head"><h1>Waiting for approval</h1><p>You asked to join <strong>${esc(crew.name)}</strong>. The astronaut needs to approve you before you can send or read messages. If they are on Mars, that can take a while.</p></div>
        <div class="btn-row"><button class="btn" data-refresh>${icon('refresh')}Check again</button><button class="btn ghost" data-leave>Use a different code</button></div>
      </div>`;
    main.querySelector('[data-refresh]').addEventListener('click', async () => { await (await import('../sync.js')).flush(); paint(); });
    main.querySelector('[data-leave]').addEventListener('click', async () => { await store.set('crew', null); paint(); });
  }

  function paintRemoved() {
    main.innerHTML = `<div class="page"><div class="page-head"><h1>No longer in this crew space</h1><p>The astronaut removed you from ${esc(crew.name)}, or the space was closed.</p></div><button class="btn" data-leave>Join another crew space</button></div>`;
    main.querySelector('[data-leave]').addEventListener('click', async () => { await store.set('crew', null); paint(); });
  }

  // ---------- Crew view ----------
  async function paintCrew() {
    const m = MISSIONS[crew.mission] || mission();
    const isAstronaut = crew.role === 'astronaut';
    main.innerHTML = `
      <div class="page">
        <div class="page-head">
          <h1>${esc(crew.name)}</h1>
          <p>${isAstronaut ? 'Send messages home and read what your family recorded for you.' : `Recorded messages reach the crew after the signal delay. ${esc(m.liveCall)}`}</p>
        </div>
        ${delayStrip(m)}
        <div class="grid-2" style="margin-top:20px;align-items:start">
          <section class="stack">
            <article class="panel stack" id="composer"></article>
            <div id="outbox" class="stack"></div>
            ${isAstronaut ? '<article class="panel stack" id="people"></article>' : ''}
          </section>
          <section class="stack">
            <div class="spread"><h2 style="font-size:1.2rem;font-weight:600">Conversation</h2><span class="muted small" id="sync-state"></span></div>
            <div class="msg-list" id="thread"></div>
          </section>
        </div>
      </div>`;
    composer(main.querySelector('#composer'), m);
    await paintOutbox();
    await paintThread();
    if (isAstronaut) await paintPeople();
    const sync = await import('../sync.js');
    sync.start();
    const syncState = main.querySelector('#sync-state');
    const showSync = (st) => { syncState.textContent = !navigator.onLine ? 'Offline: showing saved messages' : st.busy ? 'Syncing…' : st.error ? `Last sync failed: ${st.error}` : st.lastSync ? `Synced ${new Date(st.lastSync).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''; };
    showSync(sync.state);
    cleanups.push(sync.onSync(showSync));
    let tThread = 0, tPeople = 0;
    cleanups.push(store.onChange((name) => {
      if (name === 'outbox') paintOutbox();
      if (name === 'inbox' || name === 'media') { clearTimeout(tThread); tThread = setTimeout(paintThread, 150); }
      if (name === 'kv' && isAstronaut) { clearTimeout(tPeople); tPeople = setTimeout(paintPeople, 150); }
    }));
    const tick = setInterval(() => updateCountdowns(main), 1000);
    cleanups.push(() => clearInterval(tick));
    sync.flush();
  }

  async function paintOutbox() {
    const box = main.querySelector('#outbox');
    if (!box) return;
    const list = await outboxItems();
    if (!list.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<article class="panel stack"><h3>${icon('clock').replace('<svg', '<svg style="width:18px;height:18px;display:inline;vertical-align:-3px;margin-right:6px"')}Outbox</h3>
      ${list.map((it) => `<div class="spread"><span>${it.type === 'report' ? 'Health report to flight surgeon' : `${{ text: 'Text', voice: 'Voice note', video: 'Video' }[it.payload.kind]} message`}<br><span class="muted small">${it.status === 'failed' ? `Not sent yet: ${esc(it.error || 'error')}` : navigator.onLine ? 'Sending…' : 'Waiting for a connection'}</span></span><button class="btn small ghost" data-cancel="${it.id}">Cancel</button></div>`).join('')}
      </article>`;
    box.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', async () => { await removeOutbox(b.dataset.cancel); await store.del('media', b.dataset.cancel); }));
  }

  async function paintThread() {
    const box = main.querySelector('#thread');
    if (!box) return;
    const members = await store.get('members', []);
    const nameOf = (uid) => members.find((x) => x.user_id === uid)?.display_name || 'Crew member';
    const rows = (await store.all('inbox')).sort((a, b) => (b.sent_at || '').localeCompare(a.sent_at || ''));
    if (!rows.length) { box.innerHTML = '<div class="empty"><p class="muted">No messages yet. Record the first one.</p></div>'; return; }
    const now = Date.now();
    const parts = [];
    for (const r of rows.slice(0, 60)) {
      const inTransit = new Date(r.deliver_at).getTime() > now;
      if (r.kind === 'report') {
        parts.push(`<article class="msg mine"><div class="meta"><strong>You</strong><span>${fmtDateTime(r.sent_at)}</span></div><p>${icon('surgeon').replace('<svg', '<svg style="width:16px;height:16px;display:inline;vertical-align:-3px;margin-right:6px"')}Health report sent to the flight surgeon: ${esc(r.body)}</p>${transit(r, inTransit)}</article>`);
        continue;
      }
      const sealed = !r.mine && r.open_when && !r.opened_at;
      const who = r.mine ? 'You' : esc(nameOf(r.sender_id));
      const to = r.recipient_id ? ` to ${r.mine ? esc(nameOf(r.recipient_id)) : 'you'}` : '';
      if (sealed) {
        parts.push(`<article class="msg sealed"><div class="meta"><strong>${who}</strong><span>${fmtDateTime(r.sent_at)}</span></div><p>${icon('envelope').replace('<svg', '<svg style="width:18px;height:18px;display:inline;vertical-align:-4px;margin-right:6px"')}A message to open <strong>${esc(r.open_when.toLowerCase())}</strong>.</p><div><button class="btn small" data-open="${r.id}">Open it now</button></div></article>`);
        continue;
      }
      let media = '';
      if (r.media_path || r.kind === 'voice' || r.kind === 'video') {
        const mrec = await store.getOne('media', r.id);
        if (mrec?.blob) {
          const url = URL.createObjectURL(mrec.blob);
          media = r.kind === 'video' ? `<video controls playsinline preload="metadata" src="${url}"></video>` : `<audio controls preload="metadata" src="${url}"></audio>`;
        } else media = `<p class="muted small">${r.kind === 'video' ? 'Video' : 'Voice note'} downloading. It will be saved for offline viewing.</p>`;
      }
      parts.push(`<article class="msg ${r.mine ? 'mine' : ''}"><div class="meta"><strong>${who}${to}</strong><span>${fmtDateTime(r.sent_at)}</span></div>${r.open_when ? `<p class="muted small">Opened: “${esc(r.open_when)}”</p>` : ''}${media}${r.body ? `<p>${esc(r.body)}</p>` : ''}${r.mine ? transit(r, inTransit) : ''}</article>`);
    }
    box.innerHTML = parts.join('');
    box.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', async () => {
      const id = b.dataset.open;
      const row = await store.getOne('inbox', id);
      await store.put('inbox', { ...row, opened_at: new Date().toISOString() });
      try { await (await import('../supa.js')).markOpened(id); } catch { /* will stay opened locally */ }
    }));
    // mark plain received messages as read
    const unread = rows.filter((r) => !r.mine && !r.open_when && !r.opened_at && r.kind !== 'report' && new Date(r.deliver_at).getTime() <= now);
    if (unread.length) {
      const stamp = new Date().toISOString();
      await store.putMany('inbox', unread.map((r) => ({ ...r, opened_at: stamp })));
      if (navigator.onLine) { const supa = await import('../supa.js'); unread.forEach((r) => supa.markOpened(r.id).catch(() => {})); }
    }
  }

  let peopleKey = null;
  let inviteNode = null; // keeps the last invite on screen across repaints
  async function paintPeople() {
    const box = main.querySelector('#people');
    if (!box) return;
    const members = await store.get('members', []);
    const key = JSON.stringify(members.map((x) => [x.user_id, x.status, x.display_name]));
    if (key === peopleKey && box.childElementCount) return;
    peopleKey = key;
    const others = members.filter((x) => x.role !== 'astronaut' && x.status !== 'removed');
    const pending = others.filter((x) => x.status === 'pending');
    box.innerHTML = `
      <h3>People</h3>
      ${pending.length ? `<div class="stack">${pending.map((p) => `<div class="spread"><span><strong>${esc(p.display_name)}</strong>${p.relationship ? `, ${esc(p.relationship)}` : ''}<br><span class="muted small">Wants to join as ${p.role === 'surgeon' ? 'flight surgeon' : 'family'}</span></span><span class="btn-row"><button class="btn small" data-approve="${p.user_id}">Approve</button><button class="btn small danger" data-remove="${p.user_id}">Decline</button></span></div>`).join('')}</div><hr class="hairline">` : ''}
      ${others.filter((x) => x.status === 'approved').map((p) => `<div class="spread"><span>${esc(p.display_name)}${p.relationship ? `, <span class="muted">${esc(p.relationship)}</span>` : ''}</span><button class="btn small ghost" data-remove="${p.user_id}">Remove</button></div>`).join('') || '<p class="muted">Nobody has joined yet.</p>'}
      <hr class="hairline">
      <div class="stack"><p class="muted small">Invite codes last 14 days. Share the code, the link or the QR code.</p>
        <div class="btn-row"><button class="btn small" data-invite="family">${icon('users')}Invite family</button><button class="btn small ghost" data-invite="surgeon">${icon('surgeon')}Invite flight surgeon</button></div>
        <div id="invite-out"></div></div>`;
    const crewId = crew.id;
    if (inviteNode) box.querySelector('#invite-out').append(inviteNode);
    box.querySelectorAll('[data-approve],[data-remove]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        const supa = await import('../supa.js');
        await supa.setMemberStatus(crewId, b.dataset.approve || b.dataset.remove, b.dataset.approve ? 'approved' : 'removed');
        await store.set('members', await supa.members(crewId));
      } catch (e) { toast(navigator.onLine ? e.message : 'Connect to approve or remove people.', 'warn'); b.disabled = false; }
    }));
    box.querySelectorAll('[data-invite]').forEach((b) => b.addEventListener('click', async () => {
      const out = box.querySelector('#invite-out');
      b.disabled = true;
      try {
        const supa = await import('../supa.js');
        const code = await supa.createInvite(crewId, b.dataset.invite);
        const link = `${location.origin}${location.pathname}#/messages?code=${code}`;
        const { qrSvg } = await import('../qr.js');
        out.innerHTML = `<div class="panel tight stack" style="margin-top:12px"><span class="muted small">${b.dataset.invite === 'surgeon' ? 'Flight surgeon' : 'Family'} invite code</span><span class="code-box">${code}</span>
          <div class="qr">${qrSvg(link)}</div>
          <div class="btn-row"><button class="btn small ghost" data-copy="${esc(link)}">${icon('copy')}Copy link</button>${navigator.share ? `<button class="btn small ghost" data-share="${esc(link)}">${icon('send')}Share</button>` : ''}</div></div>`;
        inviteNode = out.firstElementChild;
        out.querySelector('[data-copy]').addEventListener('click', async (e) => { try { await navigator.clipboard.writeText(e.currentTarget.dataset.copy); toast('Link copied.', 'copy'); } catch { toast('Copy failed. Share the code instead.', 'warn'); } });
        out.querySelector('[data-share]')?.addEventListener('click', (e) => navigator.share({ title: 'Join my crew space on Horizon', text: `Join ${crew.name} on Horizon with code ${code}`, url: e.currentTarget.dataset.share }).catch(() => {}));
      } catch (e) { toast(navigator.onLine ? e.message : 'Connect to create an invite.', 'warn'); }
      b.disabled = false;
    }));
  }

  // ---------- Composer ----------
  function composer(box, m) {
    let kind = 'video', blob = null, recorder = null, stream = null, chunks = [], recTimer = null, startedAt = 0;
    const isAstronaut = crew.role === 'astronaut';
    box.innerHTML = `
      <h2 style="font-size:1.2rem;font-weight:600">New message</h2>
      <div class="seg" role="group" aria-label="Message type">
        <button type="button" data-kind="video" aria-pressed="true">${icon('video')}Video</button>
        <button type="button" data-kind="voice" aria-pressed="false">${icon('mic')}Voice</button>
        <button type="button" data-kind="text" aria-pressed="false">${icon('text')}Text</button>
      </div>
      <div id="rec" class="recorder"></div>
      <label class="field">Note <span class="hint">Optional with video or voice</span><textarea class="input" name="body" maxlength="2000" placeholder="${isAstronaut ? 'Tell them about your day' : 'Say hello'}"></textarea></label>
      <div class="grid-2">
        <label class="field">To<select class="input" name="to"><option value="">Everyone in the crew space</option></select></label>
        <label class="field">Open when <span class="hint">Seal it for later</span><select class="input" name="when">${OPEN_WHEN.map((w) => `<option value="${esc(w)}">${w ? esc(w) : 'Straight away'}</option>`).join('')}</select></label>
      </div>
      <div class="btn-row"><button class="btn" data-send>${icon('send')}Send</button></div>
      <p class="muted small">It will arrive after about ${esc(fmtDuration(sendDelaySec()))}${settings().demoDelays && m.delaySec !== m.demoDelaySec ? ` (shortened for demos; really ${esc(m.delayText)})` : ''}.</p>`;
    const rec = box.querySelector('#rec');
    const to = box.querySelector('[name=to]');
    store.get('members', []).then((list) => {
      list.filter((x) => x.status === 'approved').forEach((x) => {
        const o = document.createElement('option'); o.value = x.user_id; o.textContent = `${x.display_name}${x.relationship ? ` (${x.relationship})` : ''}`;
        to.append(o);
      });
    });

    function stopStream() { stream?.getTracks().forEach((t) => t.stop()); stream = null; }
    function paintRec() {
      if (kind === 'text') { rec.innerHTML = ''; return; }
      if (blob) {
        const url = URL.createObjectURL(blob);
        rec.innerHTML = `${kind === 'video' ? `<video controls playsinline src="${url}"></video>` : `<audio controls src="${url}"></audio>`}<div class="btn-row"><button class="btn small ghost" data-redo>${icon('refresh')}Record again</button><span class="muted small">${(blob.size / 1048576).toFixed(1)} MB</span></div>`;
        rec.querySelector('[data-redo]').addEventListener('click', () => { blob = null; paintRec(); });
        return;
      }
      rec.innerHTML = `${kind === 'video' ? '<video id="live" playsinline muted></video>' : ''}<div class="btn-row"><button class="btn small" data-rec>${icon(kind === 'video' ? 'video' : 'mic')}Start recording</button><span class="muted small" id="rec-time">Up to ${MAX_REC_SEC} seconds</span></div>`;
      rec.querySelector('[data-rec]').addEventListener('click', toggleRec);
    }
    async function toggleRec(e) {
      const btn = e.currentTarget;
      if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { toast('This browser cannot record. Send a text message instead.', 'warn'); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: kind === 'video' ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false });
      } catch { toast('Camera or microphone access was blocked. Allow it in your browser settings, or send text.', 'warn'); return; }
      if (kind === 'video') { const live = rec.querySelector('#live'); live.srcObject = stream; live.play().catch(() => {}); }
      const types = kind === 'video' ? ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'] : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      const mimeType = types.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 600000, audioBitsPerSecond: 64000 });
      chunks = [];
      recorder.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
      recorder.onstop = () => { clearInterval(recTimer); blob = new Blob(chunks, { type: recorder.mimeType || mimeType || (kind === 'video' ? 'video/webm' : 'audio/webm') }); stopStream(); recorder = null; paintRec(); };
      recorder.start(1000);
      startedAt = Date.now();
      btn.innerHTML = `${icon('stop')}Stop`;
      const tEl = rec.querySelector('#rec-time');
      recTimer = setInterval(() => {
        const sec = Math.floor((Date.now() - startedAt) / 1000);
        tEl.innerHTML = `<span class="rec-dot"></span> ${sec} s of ${MAX_REC_SEC}`;
        if (sec >= MAX_REC_SEC && recorder?.state === 'recording') recorder.stop();
      }, 250);
    }
    box.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => {
      if (recorder?.state === 'recording') recorder.stop();
      stopStream(); kind = b.dataset.kind; blob = null;
      box.querySelectorAll('[data-kind]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      paintRec();
    }));
    box.querySelector('[data-send]').addEventListener('click', async () => {
      const body = box.querySelector('[name=body]').value.trim();
      if (kind === 'text' && !body) { toast('Write a message first.', 'info'); return; }
      if (kind !== 'text' && !blob) { toast('Record your message first.', 'info'); return; }
      await queueMessage({ kind, body: body || null, recipientId: to.value || null, openWhen: box.querySelector('[name=when]').value || null, blob: kind === 'text' ? null : blob, mediaType: blob?.type || null });
      blob = null; box.querySelector('[name=body]').value = ''; paintRec();
      toast(navigator.onLine ? 'Sent. It is on its way.' : 'Saved in your outbox. It will send when you are back online.', 'send');
    });
    cleanups.push(() => { if (recorder?.state === 'recording') recorder.stop(); stopStream(); clearInterval(recTimer); });
    paintRec();
  }

  await paint();
  return () => cleanups.forEach((fn) => fn());
}

function delayStrip(m) {
  const demo = settings().demoDelays && m.delaySec !== m.demoDelaySec;
  return `<div class="delay-strip"><strong>${esc(m.name)}: messages take ${esc(m.delayText)} each way.</strong><span class="muted small">${esc(m.liveCall)}${demo ? ` In demo mode, Horizon holds messages for ${fmtDuration(m.demoDelaySec)} instead.` : ''}</span></div>`;
}

function transit(r, inTransit) {
  if (!inTransit) return `<span class="transit">${icon('check')}Delivered</span>`;
  const left = Math.max(0, (new Date(r.deliver_at).getTime() - Date.now()) / 1000);
  return `<span class="transit" data-deliver="${esc(r.deliver_at)}">${icon('satellite')}In transit, arrives in <span data-left>${esc(fmtDuration(left))}</span></span>`;
}

function updateCountdowns(main) {
  main.querySelectorAll('[data-deliver]').forEach((el) => {
    const left = (new Date(el.dataset.deliver).getTime() - Date.now()) / 1000;
    if (left <= 0) el.innerHTML = `${icon('check')}Delivered`;
    else el.querySelector('[data-left]').textContent = fmtDuration(left);
  });
}
