import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');

function setup() {
  const rows = [];
  const sheet = {
    getLastRow: () => rows.length,
    getRange: (row, col, numRows, numCols) => ({
      getValues: () => rows.slice(row - 1, row - 1 + numRows).map((r) => r.slice(col - 1, col - 1 + numCols)),
    }),
    appendRow: (r) => { rows.push(Array.from(r)); }, // Array.from: arrays made inside vm have another realm's prototype
  };
  const ctx = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheets: () => [sheet] }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (text) => ({ setMimeType() { return this; }, getContent: () => text }),
    },
  });
  vm.runInContext(code, ctx);
  const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).getContent());
  return { rows, post };
}

const payload = { id: 'abc', date: '2026-11-19', category: 'Client', start: 1700000000000, end: 1700003600000, hours: 1 };

test('appends header then row on empty sheet', () => {
  const { rows, post } = setup();
  const res = post(payload);
  assert.deepEqual({ ...res }, { ok: true, id: 'abc', duplicate: false });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], ['Date', 'Category', 'Start', 'End', 'Hours', 'ID']);
  const [date, category, start, end, hours, id] = rows[1];
  assert.deepEqual([date, category, hours, id], ['2026-11-19', 'Client', 1, 'abc']);
  assert.equal(start.getTime(), 1700000000000);
  assert.equal(end.getTime(), 1700003600000);
});

test('duplicate id appends no second row', () => {
  const { rows, post } = setup();
  post(payload);
  const res = post(payload);
  assert.equal(rows.length, 2);
  assert.deepEqual({ ...res }, { ok: true, id: 'abc', duplicate: true });
});

test('bad JSON returns ok:false', () => {
  const { rows, post } = setup();
  const res = post('not json{');
  assert.equal(res.ok, false);
  assert.equal(typeof res.error, 'string');
  assert.equal(rows.length, 0);
});

test('missing id returns ok:false', () => {
  const { rows, post } = setup();
  const res = post({ ...payload, id: undefined });
  assert.equal(res.ok, false);
  assert.equal(rows.length, 0);
});
