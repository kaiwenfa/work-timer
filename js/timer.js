import { hoursBetween, localDate } from './time.js';

const OVERDUE_MS = 12 * 3_600_000;

export function start(store, category, nowMs) {
  const active = { id: crypto.randomUUID(), category, start: nowMs };
  store.setActive(active);
  store.saveSettings({ lastCategory: category });
  return active;
}

export function stop(store, nowMs) {
  const active = store.getActive();
  if (!active) throw new Error('No active session');
  const end = Math.max(nowMs, active.start); // clock moved backwards: never log negative time
  const session = {
    id: active.id,
    category: active.category,
    start: active.start,
    end,
    date: localDate(active.start),
    hours: hoursBetween(active.start, end),
    synced: false,
  };
  // Write the session first so a failed write never loses the running session.
  store.addSession(session);
  store.clearActive();
  return session;
}

export function setCategory(store, category) {
  const active = store.getActive();
  if (active) store.setActive({ ...active, category });
  store.saveSettings({ lastCategory: category });
}

export function isOverdue(active, nowMs) {
  return active != null && nowMs - active.start > OVERDUE_MS;
}

export function createTapGuard(windowMs = 600) {
  let last = null;
  return (nowMs) => {
    if (last !== null && nowMs - last < windowMs) return false;
    last = nowMs;
    return true;
  };
}
