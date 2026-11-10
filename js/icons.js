// Small hand-drawn icon set (24x24, stroke-based). Returned as SVG strings.
const P = {
  today: '<path d="M3 18c3-5 6-7 9-7s6 2 9 7"/><path d="M12 4v3M5.6 6.6l1.8 1.8M18.4 6.6l-1.8 1.8"/><path d="M2 21h20"/>',
  checkin: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M8 13h2l1.5-3 2 5 1.5-2h1"/>',
  body: '<circle cx="12" cy="5" r="2.5"/><path d="M7 10h10M12 10v5M9 21l3-6 3 6"/><path d="M7 10l-2 5M17 10l2 5"/>',
  trends: '<path d="M4 4v16h16"/><path d="M7 15l4-4 3 3 5-6"/>',
  messages: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  learn: '<path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z"/><path d="M12 6v14"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  games: '<rect x="3" y="7" width="18" height="11" rx="4"/><path d="M8 11v3M6.5 12.5h3"/><circle cx="16" cy="11.5" r="1"/><circle cx="18" cy="13.5" r="1"/>',
  surgeon: '<path d="M9 3h6v4h4v6h-4v4H9v-4H5V7h4z"/>',
  ok: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
  warn: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.2v.3"/>',
  bad: '<path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/><path d="M12 8v5M12 16.2v.3"/>',
  none: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.6v.3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  arrowDown: '<path d="M12 4v16M6 14l6 6 6-6"/>',
  arrowLeft: '<path d="M20 12H4M10 6l-6 6 6 6"/>',
  arrowRight: '<path d="M4 12h16M14 6l6 6-6 6"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
  text: '<path d="M5 6h14M5 12h14M5 18h9"/>',
  send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  satellite: '<path d="M8 8l8 8M9.5 4.5l-5 5 4 4 5-5zM19.5 14.5l-5 5-4-4 5-5z"/><path d="M15 21a6 6 0 006-6"/>',
  wifiOff: '<path d="M3 3l18 18"/><path d="M8.5 16.5a5 5 0 017 0M5 13a10 10 0 015-2.6M14 10.4A10 10 0 0119 13M2 9.5a14 14 0 015-2.9M12 5a14 14 0 0110 4.5"/><circle cx="12" cy="20" r="0.8"/>',
  envelope: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5"/><path d="M16 5a3 3 0 010 6M18 14.5c2 .8 3.2 2.6 3.7 5.5"/>',
  star: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  flame: '<path d="M12 21c-4 0-7-2.7-7-6.5 0-3 2-5.2 4-7 .3 2 1.3 3 2.5 3.5C11 8 12 5 15 3c0 3 4 5.5 4 10.5 0 4.1-3 7.5-7 7.5z"/>',
  medal: '<circle cx="12" cy="15" r="5"/><path d="M8.5 11L6 3h4l2 5 2-5h4l-2.5 8"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  refresh: '<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/>',
  heart: '<path d="M12 20s-7-4.4-9-9a4.7 4.7 0 019-3 4.7 4.7 0 019 3c-2 4.6-9 9-9 9z"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/>',
};

export function icon(name, cls = '') {
  const body = P[name] || P.info;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${body}</svg>`;
}

// Debris and satellite shapes for the Debris dodge game (filled, 64x64).
export const DEBRIS_SVG = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 22l14-10 20 6 6 18-12 16-22-2-8-14z" fill="#7d6a58" stroke="#c9b49a" stroke-width="2"/><path d="M24 26l8 4M36 22l2 10M22 40l10-2" stroke="#4a3d31" stroke-width="2.5" stroke-linecap="round"/></svg>';
export const SATELLITE_SVG = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="25" y="24" width="14" height="16" rx="2" fill="#d9e2f1" stroke="#ffffff" stroke-width="1.5"/><rect x="4" y="26" width="18" height="12" fill="#2b5fb8" stroke="#8fb4f0" stroke-width="1.5"/><rect x="42" y="26" width="18" height="12" fill="#2b5fb8" stroke="#8fb4f0" stroke-width="1.5"/><path d="M10 26v12M16 26v12M48 26v12M54 26v12" stroke="#8fb4f0" stroke-width="1"/><path d="M32 24v-8" stroke="#ffffff" stroke-width="2"/><circle cx="32" cy="14" r="3" fill="#ffb547"/></svg>';
