import { formatDuration, todayTotalMs } from './time.js';
import { createStore } from './store.js';
import { start, stop, setCategory, isOverdue, createTapGuard } from './timer.js';
import { syncPending } from './sync.js';
import { playStart, playStop, hapticTick, burst, setSilentMode } from './feedback.js';

const $ = (id) => document.getElementById(id);
const app = $('app'), btn = $('btn'), statusEl = $('status'), timeEl = $('time'), todayEl = $('today');
const syncEl = $('sync'), overdueEl = $('overdue'), chipsEl = $('chips'), settingsEl = $('settings');

const store = createStore(window.localStorage);
const tapGuard = createTapGuard(600);
let notice = null; // { text, error, until }
let syncing = false;

const setNotice = (text, error = false, ms = error ? 5000 : 1800) => {
  notice = { text, error, until: Date.now() + ms };
};
const getSettings = () => { try { return store.getSettings(); } catch { return {}; } };

function render() {
  const now = Date.now();
  const active = store.getActive();
  const settings = store.getSettings();
  app.classList.toggle('working', !!active);
  btn.textContent = active ? 'STOP' : 'START';
  timeEl.textContent = formatDuration(active ? now - active.start : 0);

  const cat = active ? active.category : settings.lastCategory;
  chipsEl.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.cat === cat));

  if (notice && now > notice.until) notice = null;
  statusEl.classList.toggle('error', !!(notice && notice.error));
  statusEl.textContent = notice ? notice.text : active ? `▶ Online · ${active.category}` : 'Standby';

  const total = todayTotalMs(store.listSessions(), now, active);
  const mins = Math.floor(total / 60000);
  todayEl.textContent = `TODAY ▸ ${Math.floor(mins / 60)}h ${mins % 60}m`;

  if (isOverdue(active, now)) {
    overdueEl.hidden = false;
    overdueEl.textContent = `Still working? Started ${Math.floor((now - active.start) / 3_600_000)}h ago`;
  } else {
    overdueEl.hidden = true;
  }
  renderSync(settings);
}

function renderSync(settings = store.getSettings()) {
  const pending = store.pendingSessions().length;
  let text, cls;
  if (!settings.sheetUrl || !settings.sheetUrl.trim()) { text = '⚠ set up sheet'; cls = 'setup'; }
  else if (pending > 0) { text = `● ${pending} pending`; cls = 'pending'; }
  else { text = '✓ synced'; cls = 'ok'; }
  if (syncEl.textContent !== text) syncEl.textContent = text;
  syncEl.className = cls;
}

// Run a store-touching action; on failure show a visible error and re-sync the UI with storage.
function guarded(fn, message) {
  try { return fn(); } catch (e) {
    console.error(e);
    setNotice(message, true);
    return undefined;
  }
}

let resyncRequested = false;
async function doSync() {
  if (syncing) { resyncRequested = true; return; }
  syncing = true;
  try {
    do {
      resyncRequested = false;
      try {
        const { sheetUrl } = store.getSettings();
        const res = await syncPending(store, sheetUrl);
        if (res.failed > 0) setNotice(`⚠ ${store.pendingSessions().length} pending — sync failed`, true, 3000);
      } catch (e) {
        console.error(e);
        setNotice('⚠ Sync error', true);
      }
      render();
    } while (resyncRequested);
  } finally {
    syncing = false;
  }
}

btn.addEventListener('click', () => {
  if (!tapGuard(Date.now())) return;
  const now = Date.now();
  const active = store.getActive();
  const prevCat = (active && active.category) || store.getSettings().lastCategory;
  let ok = false;
  if (active) {
    ok = guarded(() => { stop(store, now); return true; }, "⚠ Couldn't save — storage full?");
    if (ok) { setNotice('■ Logged ✓'); fire(false); }
  } else {
    const cat = chipsEl.querySelector('.chip.on')?.dataset.cat || prevCat;
    ok = guarded(() => { start(store, cat, now); return true; }, "⚠ Couldn't save — storage full?");
    if (ok) { notice = null; fire(true); }
  }
  render();
  if (ok) doSync();
});

function fire(up) {
  hapticTick();
  if (getSettings().sound) (up ? playStart : playStop)();
  burst(app, btn, up ? '#D4FF3A' : '#FF2E88');
}

chipsEl.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  guarded(() => setCategory(store, chip.dataset.cat), "⚠ Couldn't save — storage full?");
  render();
});

syncEl.addEventListener('click', () => {
  if (!store.getSettings().sheetUrl) { openSettings(); return; }
  doSync();
});

// Settings: long-press (600 ms) on the header logo.
const logo = $('logo');
let pressTimer = null;
const cancelPress = () => { clearTimeout(pressTimer); pressTimer = null; };
logo.addEventListener('pointerdown', () => { cancelPress(); pressTimer = setTimeout(() => { pressTimer = null; openSettings(); }, 600); });
['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => logo.addEventListener(t, cancelPress));
logo.addEventListener('contextmenu', (e) => e.preventDefault());

function openSettings() {
  const s = store.getSettings();
  $('sheetUrl').value = s.sheetUrl || '';
  $('sound').checked = !!s.sound;
  $('silentSound').checked = !!s.silentSound;
  settingsEl.hidden = false;
}

$('silentSound').addEventListener('change', (e) => setSilentMode(e.target.checked));

$('closeSettings').addEventListener('click', () => {
  const saved = guarded(() => {
    store.saveSettings({
      sheetUrl: $('sheetUrl').value.trim(),
      sound: $('sound').checked,
      silentSound: $('silentSound').checked,
    });
    return true;
  }, "⚠ Couldn't save — storage full?");
  if (saved) setSilentMode($('silentSound').checked);
  settingsEl.hidden = true;
  render();
  if (saved) doSync();
});

window.addEventListener('online', doSync);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') doSync(); });

setSilentMode(!!getSettings().silentSound);
render();
setInterval(render, 250);
doSync();
