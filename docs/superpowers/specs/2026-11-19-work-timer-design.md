# Work Timer: Design

Date: 2026-11-19 · Status: approved by owner 2026-11-19

## Intent
One satisfying button on the iPhone home screen to clock in and out. Each finished session lands as a row in the owner's Google Sheet. The owner tracks hours for three purposes (client billing, personal records, an employer) and picks which one each session belongs to.

Why: tracking exact hours today is a chore. The app has to make clocking in and out feel rewarding, so the habit sticks, and the sheet has to be ready for totals and billing without cleanup.

**Hard constraint: completely free to run.** No paid Apple developer account, no paid hosting, no paid services.

## Goals
- Start or stop a session with one tap, from the home screen, in under 2 seconds.
- The category (Client / Personal / Employer) is chosen with a chip above the button. The last choice is remembered, so starting is still one tap.
- Every completed session becomes one row in Google Sheets: **Date · Category · Start · End · Hours** (decimal hours, e.g. 2.25).
- No lost taps: sessions are saved on the device first and synced when online. They retry until the sheet confirms.
- A bold, satisfying feel: the "Neon Edge" look (below), a strong tap animation and a synth sound.

## Non-goals (v1)
- Editing or deleting sessions in the app. Mistakes are fixed directly in the sheet.
- Gamification: no XP, levels or streaks. The owner tried these and rejected them.
- Custom or editable categories, reports or charts in the app, multiple users, notifications, native iOS app.

## Anti-goals
- Any recurring cost or paid account.
- A cluttered screen. The owner rejected the "Overdrive" and "Full Glitch" levels of effects.
- A session silently disappearing, whether through a failed sync, a closed app or iOS clearing storage.

## Approaches considered
1. **Native SwiftUI app.** Real haptics. Rejected: without the $99/yr Apple developer account the app expires every 7 days.
2. **Web app (PWA) saved to the home screen + GitHub Pages + Google Apps Script.** **Chosen.** $0, updates instantly, and reuses the HTML mockups directly. Costs: no reliable haptics, and sound follows the silent switch unless overridden.
3. **iOS Shortcuts.** Rejected: no custom UI, so none of the feel the owner wants.

Sheet connection: a **private Apps Script web-app URL** (chosen) rather than in-app Google sign-in. The sign-in route needs a Google Cloud project and OAuth, which is too much setup for one user.

Hosting: **GitHub Pages** (chosen; the owner has an account) rather than serving from Apps Script, which adds a Google banner and handles Add to Home Screen poorly.

## Decided design

### Look ("Option 1 · Neon Edge"; mockup: `.superpowers/brainstorm/*/content/final-design.html`)
- Near-black background with a fine grain, a faint cyan grid floor with a magenta glow, and light scanlines.
- Accents: lime `#D4FF3A` when idle or starting, magenta `#FF2E88` while working, cyan `#22E6FF` for status text.
- Fonts: Orbitron for the timer and button, JetBrains Mono for labels.
- Layout, top to bottom:
  - header line ("SHIFT//LOG")
  - status line (Standby / ▶ Online · Client / ■ Logged ✓)
  - a large running timer h:mm:ss
  - "Today ▸ Xh Ym" (today's total across all categories, from sessions stored on the device)
  - chips: Client / Personal / Employer
  - a large button with angled corners: START (lime), or STOP (magenta) while running
- Tap feedback: a screen flash, a double shockwave ring with angled corners, about 28 neon shards, and the button "slamming" (shrinks, overshoots, settles).
- Sound: a synth "power-up" (filtered saw sweep, a sub-bass thump and a rising arpeggio) on start, and the reverse "power-down" on stop.

### Behaviour
- Tap START: record the start time and category, then animate.
- Tap STOP: record the end time, save the session, animate, then queue it for sync.
- The running state survives the app being closed or the phone restarting. The start time is stored on the device; the timer is not a live process.
- Changing the chip while a session is running changes that session's category (the owner picked the wrong one).
- If a session has been running for more than **12 hours**, show a clear warning on the screen ("Still working? Started 13h ago") so a forgotten stop is noticed. v1 does not stop it automatically.
- A small, unobtrusive sync indicator shows pending versus synced. Tapping it retries.
- On first launch, a settings screen asks for the Apps Script URL. It is stored only on the device, and settings can be reopened later (for example with a long-press on the header).

### Platform details
- Haptics: try the iOS 18+ trick (toggling a hidden `<input type="checkbox" switch>`, which gives a system haptic tick). If it doesn't work in home-screen mode, accept no haptics.
- Sound: Web Audio, started on the tap gesture. By default it respects the iPhone's silent switch. Settings has two toggles: **Sound** (on/off, default on) and **Play sound in silent mode** (default **off**). When that second toggle is on, set `navigator.audioSession.type = "playback"` where supported.
- Offline: a service worker caches the app shell, and sessions and the sync queue live in IndexedDB (or localStorage). Home-screen web apps on iOS are not subject to Safari's 7-day storage purge.
- Manifest and icons so "Add to Home Screen" opens full-screen with a proper icon and splash screen.

### Data and the sheet
- Apps Script `doPost` receives JSON `{id, date, category, start, end, hours}` and appends a row. It ignores an `id` it has already seen, so retries never create duplicate rows.
- Times are written in the phone's local time zone. Date = the start date.
- Hours = (end − start) rounded to 2 decimals.

### Privacy and security
- The repo is public (free GitHub Pages). It contains **no** URL or secret.
- The Apps Script URL acts as a write-only password. Anyone holding it could add rows but not read the sheet, which is acceptable for personal use.

## Calls made during review (minor, settled without the owner)
- Sync: send POST as `text/plain` (this avoids a CORS preflight, which Apps Script can't answer) and follow the redirect to read the confirmation. Don't use `no-cors`, because it hides the reply.
- Apps Script deploys as a web app that executes as the owner, with access set to "Anyone".
- Start and End are written as real date/time cell values, not text, so the sheet can total them.
- A session that crosses midnight counts toward its start date, both in the sheet and in "Today".
- Sound is on by default and respects the silent switch unless the owner turns on "Play sound in silent mode". The haptics and `audioSession` tricks are used only where supported.

## Left to the builder
- File structure, build tooling (plain HTML/JS with no build step is preferred), and test approach.
- Exact animation timings and sound design, within the mockup's character.
- The exact Apps Script code, plus a short step-by-step setup guide for the owner (create sheet → Extensions → Apps Script → deploy as web app → copy URL).
- The GitHub repo name and the Pages setup steps for the owner.
