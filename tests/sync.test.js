import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store.js';
import { syncPending, toPayload } from '../js/sync.js';

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

function setup(...ids) {
  const store = createStore(fakeStorage());
  for (const id of ids) store.addSession(session(id));
  return store;
}

function recorder(respond) {
  const calls = [];
  const fetchFn = async (url, opts) => {
    calls.push({ url, opts });
    return respond(url, opts);
  };
  return { calls, fetchFn };
}

const okFor = (opts) => ({ json: async () => ({ ok: true, id: JSON.parse(opts.body).id }) });

test('posts text/plain JSON with redirect follow', async () => {
  const store = setup('s1');
  const { calls, fetchFn } = recorder((u, o) => okFor(o));
  await syncPending(store, 'https://x.test/exec', fetchFn);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://x.test/exec');
  assert.equal(calls[0].opts.method, 'POST');
  assert.deepEqual(calls[0].opts.headers, { 'Content-Type': 'text/plain;charset=utf-8' });
  assert.equal(calls[0].opts.redirect, 'follow');
  assert.equal('mode' in calls[0].opts, false);
  assert.deepEqual(JSON.parse(calls[0].opts.body), toPayload(session('s1')));
});

test('toPayload picks only the sheet fields', () => {
  assert.deepEqual(toPayload(session('s1')), {
    id: 's1', date: '2026-11-19', category: 'Client', start: 0, end: 3_600_000, hours: 1,
  });
});

test('marks synced on {ok:true,id}', async () => {
  const store = setup('s1', 's2');
  const { fetchFn } = recorder((u, o) => okFor(o));
  const r = await syncPending(store, 'https://x.test/exec', fetchFn);
  assert.deepEqual(r, { synced: 2, failed: 0, needsSetup: false });
  assert.equal(store.pendingSessions().length, 0);
});

test('network error leaves pending', async () => {
  const store = setup('s1');
  const { fetchFn } = recorder(() => { throw new Error('offline'); });
  const r = await syncPending(store, 'https://x.test/exec', fetchFn);
  assert.deepEqual(r, { synced: 0, failed: 1, needsSetup: false });
  assert.equal(store.pendingSessions().length, 1);
});

test('HTML error page leaves pending', async () => {
  const store = setup('s1');
  const { fetchFn } = recorder(() => ({ json: async () => { throw new SyntaxError('html'); } }));
  const r = await syncPending(store, 'https://x.test/exec', fetchFn);
  assert.deepEqual(r, { synced: 0, failed: 1, needsSetup: false });
  assert.equal(store.pendingSessions().length, 1);
});

test('{ok:false} leaves pending', async () => {
  const store = setup('s1');
  const { fetchFn } = recorder(() => ({ json: async () => ({ ok: false, id: 's1' }) }));
  const r = await syncPending(store, 'https://x.test/exec', fetchFn);
  assert.equal(r.failed, 1);
  assert.equal(store.pendingSessions().length, 1);
});

test('id mismatch leaves pending', async () => {
  const store = setup('s1');
  const { fetchFn } = recorder(() => ({ json: async () => ({ ok: true, id: 'other' }) }));
  const r = await syncPending(store, 'https://x.test/exec', fetchFn);
  assert.equal(r.failed, 1);
  assert.equal(store.pendingSessions().length, 1);
});

test('null json body leaves pending', async () => {
  const store = setup('s1');
  const { fetchFn } = recorder(() => ({ json: async () => null }));
  const r = await syncPending(store, 'https://x.test/exec', fetchFn);
  assert.equal(r.failed, 1);
});

test('one failure does not block later sessions, order preserved', async () => {
  const store = setup('s1', 's2', 's3');
  const { calls, fetchFn } = recorder((u, o) => {
    if (JSON.parse(o.body).id === 's2') throw new Error('boom');
    return okFor(o);
  });
  const r = await syncPending(store, 'https://x.test/exec', fetchFn);
  assert.deepEqual(r, { synced: 2, failed: 1, needsSetup: false });
  assert.deepEqual(calls.map((c) => JSON.parse(c.opts.body).id), ['s1', 's2', 's3']);
  assert.deepEqual(store.pendingSessions().map((s) => s.id), ['s2']);
});

test('skips fetch when url is empty', async () => {
  const store = setup('s1');
  const { calls, fetchFn } = recorder((u, o) => okFor(o));
  for (const url of ['', '   ', undefined]) {
    const r = await syncPending(store, url, fetchFn);
    assert.deepEqual(r, { synced: 0, failed: 0, needsSetup: true });
  }
  assert.equal(calls.length, 0);
});
