# CLAUDE.md: Work Timer

This file guides Claude Code (claude.ai/code) when working in this repo.

## What this is

Work Timer ("SHIFT//LOG") is a one-tap clock-in/out app that the owner uses daily on an iPhone.
- It is a home-screen web app (PWA) hosted free on GitHub Pages at https://kaiwenfa.github.io/work-timer/.
- Each finished session becomes a row in the owner's Google Sheet, through a Google Apps Script web app.
- **Hard constraint: it must stay completely free.** No paid Apple developer account, no paid hosting, no paid services.

The full design and rationale are in `docs/superpowers/specs/2026-11-19-work-timer-design.md`. The original build plan is in `docs/superpowers/plans/2026-11-19-work-timer.md`. Setup for the owner is in `docs/SETUP.md`.

## Commands

- `npm test`: Node 22 `node:test` suite. It runs pure logic and Code.gs inside a `vm` with fake Google services, with no dependencies.
- `npm run deploy:script -- "what changed"`: pushes `apps-script/` with clasp, creates a version, and points the existing web-app deployment at it, so the URL is unchanged. It needs the local, git-ignored clasp setup described in SETUP.md.
- Local preview: `python3 -m http.server 8090 --bind 127.0.0.1`. The service worker only registers in real Chrome or Safari, not in Claude's built-in browser pane.
- Shipping the app means pushing to `main`. GitHub Pages rebuilds in about 40 s; check with `gh api repos/kaiwenfa/work-timer/pages/builds/latest`.

## Architecture

There is no build step: plain ES modules, HTML and CSS.

**App modules**

| File | Role |
|---|---|
| `js/time.js` | Formatting and date maths (`formatDuration`, `hoursBetween`, `localDate`, `todayTotalMs`) |
| `js/store.js` | localStorage persistence (`wt.active`, `wt.sessions`, `wt.settings`); corrupt data is backed up, not lost |
| `js/timer.js` | start, stop, category change, overdue check (over 12 h), double-tap guard |
| `js/sync.js` | POSTs pending sessions as `text/plain` (avoids a CORS preflight) with `redirect: 'follow'`; `fetchSheetLink` |
| `js/feedback.js` | Web Audio synth, the iOS 18 haptic trick (hidden `<input switch>`), burst animation |
| `js/app.js` | UI wiring, settings sheet (long-press SHIFT//LOG), sync indicator, loader, scroll lock |

**Other files**
- `sw.js` is the service worker. It is network-first with a 2.5 s timeout, then falls back to the cache. **Bump `CACHE` (currently `work-timer-v4`) whenever shell files change**, and list new files in `SHELL`.
- `apps-script/Code.gs`:
  - `doPost` writes each session to its category tab (Client, Personal or Employer) and to `Everything`. It dedupes by ID per tab, so a retry after a partial failure fills only the gap.
  - It rebuilds the `Summary` tab (weekly and monthly hours) after each sync, when the Sheet opens (`onOpen`), and from the Work Timer › Refresh summary menu.
  - `doGet` returns a "working" check page, and `?format=json` returns the Sheet's link.
- `icons/splash/` holds the iOS launch images: dark, with the icon centred at 96 CSS px. The inline `#loader` in `index.html` matches them so the handoff is seamless.

## Secrets: the repo is PUBLIC

- The Apps Script deployment URL (`…/macros/s/AKfy…/exec`) acts as a write password to the owner's Sheet. **It must never be committed.**
- It lives only on the phone, in app settings, and in the git-ignored `apps-script/.clasp.json` and `apps-script/.deployment-id`.
- A Claude Code PreToolUse hook (`.claude/hooks/secret-check.sh`) blocks `git commit` and `git push` if a URL, a deployment ID or the exact local IDs appear in tracked, staged or unpushed content.
- It's also worth running `git grep -nE "macros/s/AKfy"` before a push.
- Don't put the owner's personal details (email, Google account) in committed files.

## Owner preferences and decisions (don't relitigate)

- **Look:** "Neon Edge" cyberpunk.
  - Near-black background `#07070c`; lime `#D4FF3A` for idle/start, magenta `#FF2E88` while working, cyan `#22E6FF` for status.
  - Fonts: Orbitron and JetBrains Mono.
  - Keep it clean: the owner rejected heavier "overdrive" effects and gamification (XP, streaks).
- **Categories:** Client, Personal, Employer. The last one picked is remembered. Changing the chip mid-session changes that session's category.
- **Sheet layout:**
  - Columns: Date · Category · Start · End · Hours (2 decimals) · ID.
  - Times are in phone local time. A session that crosses midnight counts toward its start date.
  - Tab names are capitalised and the script creates them on first use.
- **Summary totals** are computed by the script (testable), not by Sheet formulas. Weeks start on Monday.
- **Sound** is on by default. "Play sound in silent mode" is a setting, off by default.
- **No auto-stop.** A warning banner appears after 12 h.
- **Out of scope for v1:** editing or deleting sessions in the app (fixes are made in the Sheet), notifications, multiple users, native iOS.

## Working with the owner

- Get the owner's OK before any `git push`, because pushing publishes the app.
- Commit locally with clear messages.
- After an Apps Script change, deploy with `npm run deploy:script` and verify by GET-ing the live URL, without printing it.
- Write tests first: add `node:test` cases for logic and Code.gs, and check UI changes in a phone-sized browser preview.

## Status and ideas backlog

Done and live: core app, sync, check page, Open Sheet button, scroll lock, launch screen and loader, per-category tabs, Summary tab, clasp deploys.

Not yet verified on a real iPhone:
- haptics
- sound after the app has been in the background
- the offline STOP → reconnect → exactly one row flow

Ideas, none started:
- Undo for a few seconds after START or STOP.
- GitHub Actions running `npm test` on every push.
- Prune old synced sessions from localStorage.
- Bundle the fonts so they work offline.
- A weekly recap delivered by a scheduled Claude task.
