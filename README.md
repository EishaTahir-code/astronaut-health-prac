# Horizon

Health monitoring for astronauts on long missions: log your readings, see your status at a glance, and know what to do next, even with no connection to Earth. Built as a practice run for the NASA Space Apps Challenge 2026 challenge "Create Health Monitoring Software for Astronauts on Space Missions".

Horizon is an installable web app (PWA). After the first visit it works fully offline.

## What it does

| Page | What you can do |
| --- | --- |
| Today | The horizon-to-globe hero: scroll to pull back from a thin glowing horizon to the whole planet (Earth, Moon or Mars, matching the mission). Today's status, tasks due, mission facts, the family's local time, streaks and badges. |
| Check-in | Seven readings (blood pressure, heart rate, blood sugar, temperature, sleep, mood, exercise), each with a how-to guide and an instant green, amber or red result, then a symptom check. Results come with action cards and a one-tap report to the flight surgeon. |
| Body | A clickable body figure. Each region shows what it does, your status, what spaceflight does to it and what helps. |
| Trends | One chart per reading, compared with your own usual range, with a plain-language headline. Includes a sleep vs reaction-time chart. Every chart has a table view. |
| Games | Signal lock (vigilance test, as used on the ISS), Debris dodge (impulse control) and Star map (working memory), scored against your own baseline. |
| Messages | Crew spaces with invite codes, links and QR codes. Record video, voice or text, including sealed "open when…" messages. An outbox holds messages until there is a connection, and delivery waits for the real signal delay of the mission (shortened in demo mode). |
| Reports | Flight surgeon view: shared health reports and replies. |
| Learn | Guides for every reading, the five spaceflight hazards (RIDGE) and how the colours work. |
| Settings | Mission (station, spacecraft, Moon base, Mars base), role switch for demos, demo delays, motion, install, export and delete data. |

Health readings never leave the device unless the astronaut sends a report. Family members never see health data.

Horizon is a prototype and not a medical device. The ranges in `js/health.js` are approximate general adult guidance and must be checked against cited sources before real use.

## Run it locally

Service workers and the camera need a real web server, so don't open `index.html` as a file:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploy

It is a static site with no build step. On GitHub: Settings, Pages, deploy from the branch root. HTTPS (which GitHub Pages provides) is required for offline mode, installing, and recording.

## Messaging backend (Supabase)

- The database schema, row-level security rules, invite functions and the private `media` storage bucket are in `supabase/migrations/`. They are already applied to the project in `js/config.js`.
- **Anonymous sign-in must be switched on** (Supabase dashboard, Authentication, Sign In / Providers, "Allow anonymous sign-ins"). Without it, the Messages page explains what to turn on and everything else keeps working.
- `js/config.js` holds the project URL and its public anon key. That key is meant to be public; access is enforced by row-level security.

## Code map

| Path | Purpose |
| --- | --- |
| `index.html`, `css/app.css` | App shell, navigation, design tokens |
| `js/app.js` | Router, role-based navigation, service worker registration |
| `js/health.js` | Indicators, ranges, guidance, body regions, hazards |
| `js/hero.js` | three.js horizon-to-globe scene |
| `js/charts.js` | SVG charts with baseline bands, tooltips and table views |
| `js/store.js`, `js/data.js` | On-device storage (IndexedDB) and derived data |
| `js/outbox.js`, `js/sync.js`, `js/supa.js` | Offline outbox and Supabase sync |
| `js/pages/*.js` | One module per page |
| `sw.js`, `manifest.webmanifest` | Offline cache and install metadata |
| `.claude/skills/` | Design skills copied from the AI-game-echoes repo |

## Credits

- [three.js](https://threejs.org) (MIT), [supabase-js](https://github.com/supabase/supabase-js) (MIT) and [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT), vendored in `vendor/`.
- Bodoni Moda and IBM Plex Sans fonts (SIL Open Font License), via Fontsource.
- Earth textures derived from NASA Blue Marble and Black Marble imagery, via the three-globe package. Moon and Mars surfaces are procedurally generated, not real maps.
