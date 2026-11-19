import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, hoursBetween, localDate, todayTotalMs } from '../js/time.js';

test('formatDuration', () => {
  assert.equal(formatDuration(0), '0:00:00');
  assert.equal(formatDuration(3_723_000), '1:02:03');
  assert.equal(formatDuration(36_000_000), '10:00:00');
});

test('hoursBetween rounds to 2 decimals', () => {
  assert.equal(hoursBetween(0, 8_100_000), 2.25);
  assert.equal(hoursBetween(0, 1_000), 0);
});

test('localDate uses local time', () => {
  assert.equal(localDate(new Date(2026, 10, 19, 23, 59).getTime()), '2026-11-19');
});

test('todayTotalMs', () => {
  const now = new Date(2026, 10, 19, 15, 0).getTime();
  const H = 3_600_000;
  const today = localDate(now);
  const yesterday = localDate(now - 24 * H);
  const sessions = [
    { id: 'a', category: 'x', start: now - 5 * H, end: now - 4 * H, date: today, hours: 1, synced: false },
    { id: 'b', category: 'x', start: now - 3 * H, end: now - 2.5 * H, date: today, hours: 0.5, synced: false },
    { id: 'c', category: 'x', start: now - 30 * H, end: now - 28 * H, date: yesterday, hours: 2, synced: false },
  ];
  assert.equal(todayTotalMs(sessions, now), 5_400_000);
  assert.equal(todayTotalMs(sessions, now, { id: 'd', category: 'x', start: now - 600_000 }), 6_000_000);
});
