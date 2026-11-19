import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store.js';
import { start, stop, setCategory, isOverdue, createTapGuard } from '../js/timer.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  };
}

const HOUR = 3_600_000;

test('start then stop produces session with date of start, hours rounded', () => {
  const store = createStore(fakeStorage());
  const t0 = new Date(2026, 10, 19, 23, 30).getTime();
  const t1 = new Date(2026, 10, 20, 1, 15).getTime();
  const active = start(store, 'Client', t0);
  assert.equal(store.getSettings().lastCategory, 'Client');
  const s = stop(store, t1);
  assert.deepEqual(s, {
    id: active.id, category: 'Client', start: t0, end: t1,
    date: '2026-11-19', hours: 1.75, synced: false,
  });
  assert.equal(store.getActive(), null);
  assert.deepEqual(store.listSessions(), [s]);
});

test('restores active session from storage', () => {
  const storage = fakeStorage();
  const a = start(createStore(storage), 'Client', 1000);
  assert.deepEqual(createStore(storage).getActive(), a);
});

test('setCategory while running changes the stopped session\'s category', () => {
  const store = createStore(fakeStorage());
  start(store, 'Client', 0);
  setCategory(store, 'Admin');
  assert.equal(store.getSettings().lastCategory, 'Admin');
  assert.equal(stop(store, HOUR).category, 'Admin');
});

test('setCategory with no active session only updates lastCategory', () => {
  const store = createStore(fakeStorage());
  setCategory(store, 'Admin');
  assert.equal(store.getActive(), null);
  assert.equal(store.getSettings().lastCategory, 'Admin');
});

test('isOverdue false at 12h exactly, true at 12h+1ms, false when null', () => {
  const a = { id: 'x', category: 'Client', start: 0 };
  assert.equal(isOverdue(a, 12 * HOUR), false);
  assert.equal(isOverdue(a, 12 * HOUR + 1), true);
  assert.equal(isOverdue(null, 99 * HOUR), false);
});

test('tap guard ignores taps within 600ms', () => {
  const guard = createTapGuard();
  assert.equal(guard(0), true);
  assert.equal(guard(599), false);
  assert.equal(guard(600), true);
});

test('stop without active throws', () => {
  const store = createStore(fakeStorage());
  assert.throws(() => stop(store, 1000));
});
