import { icon } from '../icons.js';
import { esc, statusChip, fmtDateTime, fmtDate, toast } from '../ui.js';
import * as store from '../store.js';
import { INDICATORS, pick } from '../health.js';
import { queueMessage } from '../outbox.js';

const LEVEL = { green: 'ok', amber: 'warn', red: 'bad' };

export async function render(main) {
  const crew = await store.get('crew', null);
  if (!crew || crew.status !== 'approved') {
    main.innerHTML = `<div class="page"><div class="page-head"><h1>Crew health reports</h1><p>Join the crew space with the invite code the astronaut sent you. Reports appear here once you are approved.</p></div><a class="btn" href="#/messages">${icon('link')}Join with a code</a></div>`;
    return;
  }
  const cleanups = [];
  main.innerHTML = `
    <div class="page">
      <div class="page-head"><h1>Crew health reports</h1><p>Reports from ${esc(crew.name)}. Each one is what the astronaut chose to share: that day’s readings and a 7-day trend. Replies travel back with the same signal delay.</p></div>
      <div class="msg-list" id="reports"></div>
    </div>`;

  async function paint() {
    const reports = (await store.get('reports', [])).filter((r) => r.astronaut_id);
    const box = main.querySelector('#reports');
    if (!reports.length) { box.innerHTML = '<div class="empty"><p class="muted">No reports yet. When the astronaut sends one, it appears here after the signal delay.</p></div>'; return; }
    box.innerHTML = reports.map((r) => {
      const c = r.snapshot?.checkin;
      const rows = c ? INDICATORS.filter((i) => c.statuses?.[i.id]).map((i) => `<tr><td>${esc(i.short)}</td><td>${esc(i.format(pick(c.values, i)))} ${esc(i.unitShort || i.unit)}</td><td>${statusChip(c.statuses[i.id].level)}</td></tr>`).join('') : '';
      const last7 = (r.snapshot?.last7 || []).map((d) => `<tr><td>${fmtDate(d.date)}</td><td>${d.values?.sys ? `${d.values.sys}/${d.values.dia}` : '–'}</td><td>${d.values?.hr ?? '–'}</td><td>${d.values?.sleep ?? '–'}</td><td>${d.values?.mood ?? '–'}</td></tr>`).join('');
      const reaction = r.snapshot?.reaction ? `<p>Reaction test: ${r.snapshot.reaction.medianMs} ms median${r.snapshot.baseline ? `, usual ${Math.round(r.snapshot.baseline)} ms` : ''}, ${r.snapshot.reaction.lapses} lapses.</p>` : '';
      return `
        <article class="msg">
          <div class="meta"><strong>${esc(r.summary)}</strong>${statusChip(LEVEL[r.level] || 'none')}</div>
          <span class="muted small">Sent ${fmtDateTime(r.created_at)}, arrived ${fmtDateTime(r.deliver_at)}</span>
          ${c?.symptoms?.length ? `<p style="color:var(--bad)">Symptoms reported: ${esc(c.symptoms.join(', '))}</p>` : ''}
          ${reaction}
          ${rows ? `<table class="data-table"><thead><tr><th>Reading</th><th>Value</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
          ${last7 ? `<details class="table-toggle"><summary class="muted">Last 7 days</summary><div class="table-scroll"><table class="data-table"><thead><tr><th>Date</th><th>BP</th><th>HR</th><th>Sleep</th><th>Mood</th></tr></thead><tbody>${last7}</tbody></table></div></details>` : ''}
          <form class="stack" data-reply="${r.id}" data-to="${r.astronaut_id}">
            <label class="field">Reply with advice<textarea class="input" name="body" maxlength="2000" required placeholder="For example: rest today, recheck blood pressure tomorrow morning, and send me the result."></textarea></label>
            <div><button class="btn small" type="submit">${icon('send')}Send reply</button></div>
          </form>
        </article>`;
    }).join('');
    box.querySelectorAll('[data-reply]').forEach((f) => f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = f.querySelector('textarea').value.trim();
      if (!body) return;
      await queueMessage({ kind: 'text', body, recipientId: f.dataset.to, reportId: f.dataset.reply });
      f.querySelector('textarea').value = '';
      toast('Reply queued. It travels with the signal delay.', 'send');
    }));
  }
  await paint();
  const sync = await import('../sync.js');
  sync.start(); sync.flush();
  cleanups.push(store.onChange((n) => { if (n === 'kv') paint(); }));
  return () => cleanups.forEach((fn) => fn());
}
