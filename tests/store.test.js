import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  };
}

const session = (id) => ({
  id, category: 'Client', start: 0, end: 3_600_000,
  date: '2026-11-19', hours: 1, synced: false,
});

test('round-trips active', () => {
  const store = createStore(fakeStorage());
  const a = { id: 'a1', category: 'Client', start: 1000 };
  store.setActive(a);
  assert.deepEqual(store.getActive(), a);
});

test('clearActive returns null after', () => {
  const store = createStore(fakeStorage());
  store.setActive({ id: 'a1', category: 'Client', start: 1000 });
  store.clearActive();
  assert.equal(store.getActive(), null);
});

test('addSession then pendingSessions contains it; after markSynced it does not', () => {
  const store = createStore(fakeStorage());
  store.addSession(session('s1'));
  assert.deepEqual(store.pendingSessions().map((s) => s.id), ['s1']);
  store.markSynced('s1');
  assert.deepEqual(store.pendingSessions(), []);
  assert.equal(store.listSessions()[0].synced, true);
});

test('getSettings returns defaults when empty', () => {
  const store = createStore(fakeStorage());
  assert.deepEqual(store.getSettings(), {
    sheetUrl: '', sound: true, silentSound: false, lastCategory: 'Client',
  });
});

test('saveSettings({sound:false}) keeps other defaults', () => {
  const store = createStore(fakeStorage());
  store.saveSettings({ sound: false });
  assert.deepEqual(store.getSettings(), {
    sheetUrl: '', sound: false, silentSound: false, lastCategory: 'Client',
  });
});

test('corrupt JSON in wt.sessions yields [] instead of throwing', () => {
  const storage = fakeStorage();
  storage.setItem('wt.sessions', '{not json');
  const store = createStore(storage);
  assert.deepEqual(store.listSessions(), []);
  assert.deepEqual(store.pendingSessions(), []);
});
