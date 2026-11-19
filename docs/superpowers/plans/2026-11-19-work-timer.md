# Work Timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A free home-screen web app with one neon button that clocks work sessions in and out, saves them on the device, and syncs each finished session as a row in the owner's Google Sheet.

**Architecture:** Static PWA (plain HTML/CSS/ES modules, no build step) hosted on GitHub Pages. Logic is split into pure, unit-tested modules (time, store, timer, sync) plus untested-by-unit UI/feedback modules that are verified in a browser. A Google Apps Script web app appends rows and dedupes by session id.

**Tech Stack:** HTML, CSS, vanilla JS ES modules, localStorage, Service Worker, Web Audio; Node 22 `node:test` for tests (no npm dependencies); Google Apps Script; GitHub Pages via `gh`.

**Spec:** `docs/superpowers/specs/2026-11-19-work-timer-design.md`

## Global Constraints
- $0 to run: no paid services, no npm runtime dependencies, no build step.
- Repo is public: no URL, key or secret may appear in any committed file. The Apps Script URL lives only in the device's settings storage.
- Categories are exactly `Client`, `Personal`, `Employer` (fixed, in that order).
- Sheet columns: `Date · Category · Start · End · Hours`, plus a trailing `ID` column (needed for dedupe; builder's call, permitted by the spec's dedupe rule).
- Hours = (end − start) in hours, rounded to 2 decimals. Date = the local start date (`YYYY-MM-DD`), including sessions that cross midnight.
- Overdue warning threshold: 12 hours. No auto-stop.
- Look: Neon Edge, copied from `.superpowers/brainstorm/39255-1795077338/content/final-design.html`. Colors: lime `#D4FF3A`, magenta `#FF2E88`, cyan `#22E6FF`. Fonts: Orbitron, JetBrains Mono.
- Settings: Sheet URL; **Sound** (default on); **Play sound in silent mode** (default off; when on, set `navigator.audioSession.type = "playback"` if it exists). Settings open with a long-press (600 ms) on the header.
- Sync: `POST` with `Content-Type: text/plain;charset=utf-8`, `redirect: "follow"`; never `no-cors`.

## Review Focus
1. **App killed or phone restarted mid-session** → reopening shows the session still running with the correct elapsed time (Task 3: `restores active session from storage`).
2. **Rapid double tap on the button** → exactly one toggle, never a zero-length session (Task 3: `tap guard ignores taps within 600ms`).
3. **Sync hits a network error, a non-JSON HTML error page, or `{ok:false}`** → the session stays pending, no exception, retried later (Task 4: three failure tests).
4. **No Sheet URL configured yet** → STOP still saves locally; sync does not call fetch and reports `needsSetup` (Task 4: `skips fetch when url is empty`).
5. **Same session posted twice** (response lost, client retries) → exactly one row in the sheet (Task 5: `duplicate id appends no second row`).

---

## File Structure
```
work-timer/
  index.html              UI markup, loads css/app.css and js/app.js
  css/app.css             Neon Edge styles (ported from mockup)
  js/time.js              pure time/format helpers
  js/store.js             persistence over a Storage-like object
  js/timer.js             session state machine + tap guard + overdue check
  js/sync.js              payload building + pending sync
  js/feedback.js          sound, haptic tick, visual fx (browser-only)
  js/app.js               wires DOM ↔ timer/store/sync/feedback
  sw.js                   offline cache of the app shell
  manifest.webmanifest    home-screen metadata
  icons/                  icon-180.png, icon-512.png
  apps-script/Code.gs     Google Apps Script endpoint
  docs/SETUP.md           owner's step-by-step setup guide
  tests/*.test.js         node:test suites
  package.json            {"type":"module","scripts":{"test":"node --test tests/"}}
  .gitignore              .superpowers/, .DS_Store
```

---

### Task 1: Repo scaffold + time helpers

**Files:** Create `package.json`, `.gitignore`, `js/time.js`, `tests/time.test.js`

**Interfaces — Produces:**
- `formatDuration(ms: number) -> string` → `"h:mm:ss"`
- `hoursBetween(startMs: number, endMs: number) -> number` (2 decimals)
- `localDate(ms: number) -> string` → `"YYYY-MM-DD"` in local time
- `todayTotalMs(sessions: Session[], nowMs: number, active?: Active) -> number` → sum of durations of sessions whose `date === localDate(nowMs)`, plus elapsed of a running active session started today
- Types: `Session = {id, category, start, end, date, hours, synced}` (start/end epoch ms); `Active = {id, category, start}`

- [ ] **Step 1:** In `work-timer/`, run `git init`, create `package.json` and `.gitignore` as in File Structure.
- [ ] **Step 2: Write failing tests** in `tests/time.test.js`:
  - `formatDuration(0) === "0:00:00"`, `formatDuration(3_723_000) === "1:02:03"`, `formatDuration(36_000_000) === "10:00:00"`
  - `hoursBetween(0, 8_100_000) === 2.25`, `hoursBetween(0, 1_000) === 0` (1 s rounds to 0.00)
  - `localDate(new Date(2026,10,19,23,59).getTime()) === "2026-11-19"`
  - `todayTotalMs`: two sessions today (1h, 30m) + one yesterday (2h) at `now` → 5_400_000; with active started 10 min before `now` → 6_000_000
- [ ] **Step 3:** Run `npm test` → FAIL (module not found).
- [ ] **Step 4:** Implement the four functions in `js/time.js` (ES module exports).
- [ ] **Step 5:** Run `npm test` → PASS.
- [ ] **Step 6:** Commit: `git add -A && git commit -m "chore: scaffold; feat: time helpers"`

### Task 2: Store

**Files:** Create `js/store.js`, `tests/store.test.js`

**Interfaces:**
- Consumes: `Session`, `Active` types (Task 1)
- Produces: `createStore(storage: Storage-like {getItem,setItem,removeItem}) -> Store` with:
  `getActive(): Active|null`, `setActive(a: Active)`, `clearActive()`,
  `addSession(s: Session)`, `listSessions(): Session[]`, `pendingSessions(): Session[]`, `markSynced(id: string)`,
  `getSettings(): {sheetUrl: string, sound: boolean, silentSound: boolean, lastCategory: string}`, `saveSettings(partial)`
- Keys: `wt.active`, `wt.sessions`, `wt.settings`. Defaults: `{sheetUrl:"", sound:true, silentSound:false, lastCategory:"Client"}`.

- [ ] **Step 1: Write failing tests** with an in-memory fake storage:
  - `round-trips active`, `clearActive returns null after`
  - `addSession then pendingSessions contains it; after markSynced it does not`
  - `getSettings returns defaults when empty`; `saveSettings({sound:false}) keeps other defaults`
  - `corrupt JSON in wt.sessions yields [] instead of throwing`
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `createStore` (JSON in/out; any parse error → default value).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: local store`.

### Task 3: Timer state machine

**Files:** Create `js/timer.js`, `tests/timer.test.js`

**Interfaces:**
- Consumes: `createStore` (Task 2), `hoursBetween`, `localDate` (Task 1)
- Produces:
  - `start(store, category: string, nowMs: number) -> Active` (id = `crypto.randomUUID()`; saves `lastCategory`)
  - `stop(store, nowMs: number) -> Session` (adds session `synced:false`, clears active; throws if none active)
  - `setCategory(store, category: string)` (updates active if running, and `lastCategory`)
  - `isOverdue(active: Active|null, nowMs: number) -> boolean` (> 12 h)
  - `createTapGuard(windowMs = 600) -> (nowMs: number) => boolean` (true = accept tap)

- [ ] **Step 1: Write failing tests:**
  - `start then stop produces session with date of start, hours rounded` (start 23:30 on 19 Nov, stop 01:15 on 20 Nov → `date "2026-11-19"`, `hours 1.75`)
  - `restores active session from storage` (start with store A, create new store B over same fake storage, `getActive()` equals)
  - `setCategory while running changes the stopped session's category`
  - `isOverdue false at 12h exactly, true at 12h+1ms, false when null`
  - `tap guard ignores taps within 600ms` (accept at 0, reject at 599, accept at 600)
  - `stop without active throws`
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: timer state machine`.

### Task 4: Sync client

**Files:** Create `js/sync.js`, `tests/sync.test.js`

**Interfaces:**
- Consumes: `Store` (Task 2)
- Produces:
  - `toPayload(s: Session) -> {id, date, category, start, end, hours}`
  - `syncPending(store, url: string, fetchFn = fetch) -> Promise<{synced: number, failed: number, needsSetup: boolean}>`; posts each pending session sequentially; marks synced only when the response parses as JSON with `ok === true && id === session.id`.

- [ ] **Step 1: Write failing tests** with a fake `fetchFn` that records calls:
  - `posts text/plain JSON with redirect follow` (assert method, header, `redirect`, body parses to payload)
  - `marks synced on {ok:true,id}`
  - `network error leaves pending` (fetchFn rejects → `failed:1`, still pending, no throw)
  - `HTML error page leaves pending` (response `.json()` rejects)
  - `{ok:false} leaves pending`
  - `skips fetch when url is empty` → `needsSetup:true`, zero calls
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: sheet sync client`.

### Task 5: Apps Script endpoint + setup guide

**Files:** Create `apps-script/Code.gs`, `tests/apps-script.test.js`, `docs/SETUP.md`

**Interfaces:**
- Consumes: payload shape from `toPayload` (Task 4)
- Produces: `doPost(e)` → `ContentService` JSON `{ok:true, id, duplicate:boolean}` or `{ok:false, error}`; helper `rowFromPayload(p) -> [date, category, new Date(start), new Date(end), hours, id]`. Writes to the first sheet; adds header row `Date, Category, Start, End, Hours, ID` if the sheet is empty. Uses `LockService.getScriptLock()` around check-and-append.

- [ ] **Step 1: Write failing tests:** load `Code.gs` with `node:vm` into a context with fakes for `SpreadsheetApp` (in-memory rows), `LockService`, `ContentService`:
  - `appends header then row on empty sheet`
  - `duplicate id appends no second row` (post same payload twice → 2 rows total incl. header; second response `duplicate:true`)
  - `bad JSON returns ok:false`
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `Code.gs` (plain script, no modules).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Write `docs/SETUP.md`: create Sheet → check File › Settings time zone matches phone → Extensions › Apps Script → paste `Code.gs` → Deploy › New deployment › Web app, Execute as **Me**, Access **Anyone** → authorize → copy URL → in the app, long-press header, paste URL. Plus: open the GitHub Pages URL in Safari → Share › Add to Home Screen.
- [ ] **Step 6:** Commit `feat: apps script endpoint and setup guide`.

### Task 6: UI, feedback and wiring

**Files:** Create `index.html`, `css/app.css`, `js/feedback.js`, `js/app.js`

**Interfaces:**
- Consumes: everything from Tasks 1–4
- Produces (`feedback.js`): `playStart()`, `playStop()` (synth from mockup's `synth()`), `hapticTick()` (iOS 18 hidden `<input type="checkbox" switch>` + `<label>` click; no-op elsewhere), `burst(container: HTMLElement, origin: HTMLElement, color: string)` (flash + double ring + 28 shards + slam, from mockup's `fx()` in non-glitch mode), `setSilentMode(on: boolean)`.

- [ ] **Step 1:** Port markup/CSS of the Neon Edge phone from the mockup into `index.html`/`css/app.css` as a full-screen layout (100dvh, safe-area insets), dropping the phone frame. Elements: header "SHIFT//LOG" (long-press target), status line, timer, "TODAY ▸ Xh Ym", three chips, START/STOP button, sync indicator (`● 2 pending` / `✓ synced` / `⚠ set up sheet`), overdue banner, settings sheet (URL field, two toggles, close).
- [ ] **Step 2:** Implement `feedback.js` by porting from the mockup; sound respects `settings.sound`; call `setSilentMode(settings.silentSound)` at load and on toggle.
- [ ] **Step 3:** Implement `app.js`: on load restore active (resume ticking from stored start); chip tap → `setCategory`; button tap → tap guard → `start`/`stop` + feedback + `syncPending`; tick every 250 ms updating timer, today total and `isOverdue` banner ("Still working? Started Xh ago"); sync on load, on `online` event, on `visibilitychange` to visible, and on indicator tap.
- [ ] **Step 4: Verify in browser:** `python3 -m http.server 8080` in `work-timer/`, open `http://localhost:8080` in the browser pane at mobile size. Check: start/stop animates and sounds; reload mid-session keeps running time; double-click toggles once; with no URL, indicator shows "⚠ set up sheet"; long-press header opens settings; `npm test` still passes.
- [ ] **Step 5:** Commit `feat: neon edge UI and wiring`.

### Task 7: PWA install + offline

**Files:** Create `manifest.webmanifest`, `sw.js`, `icons/icon-180.png`, `icons/icon-512.png`; Modify `index.html` (manifest link, `apple-touch-icon`, `apple-mobile-web-app-capable`, `theme-color #07070c`, SW registration in `app.js`)

- [ ] **Step 1:** Generate the icons (lime angled-corner square with "▶" on near-black) with a throwaway Python/Pillow script kept out of the repo.
- [ ] **Step 2:** `manifest.webmanifest`: `name "Work Timer"`, `short_name "Shift"`, `display "standalone"`, `start_url "./"`, `scope "./"`, background/theme `#07070c`, both icons.
- [ ] **Step 3:** `sw.js`: precache all app-shell files under a versioned cache name; cache-first for same-origin GET; never intercept the Apps Script POST.
- [ ] **Step 4: Verify:** reload in browser pane; DevTools-free check via `navigator.serviceWorker.controller !== null` (javascript tool); stop the local server and reload → app still loads.
- [ ] **Step 5:** Commit `feat: installable offline PWA`.

### Task 8: Publish to GitHub Pages (needs owner's go-ahead)

- [ ] **Step 1:** Confirm with the owner before creating the **public** repo (name proposal: `work-timer`). Re-check `git grep -n "script.google.com"` returns nothing.
- [ ] **Step 2:** `gh repo create work-timer --public --source . --push`, then enable Pages from `main` root (`gh api repos/{owner}/work-timer/pages -X POST -f "source[branch]=main" -f "source[path]=/"`).
- [ ] **Step 3: Verify:** the Pages URL returns 200 and loads the app; hand the owner `docs/SETUP.md` to finish the Sheet + home-screen steps on their phone.
