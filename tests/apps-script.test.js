import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');

function fakeSheet(name) {
  const rows = [];
  return {
    name,
    rows,
    getName: () => name,
    getLastRow: () => rows.length,
    getRange: (row, col, numRows, numCols) => ({
      getValues: () => rows.slice(row - 1, row - 1 + numRows).map((r) => r.slice(col - 1, col - 1 + numCols)),
    }),
    appendRow: (r) => { rows.push(Array.from(r)); }, // Array.from: arrays made inside vm have another realm's prototype
    setFrozenRows() {},
  };
}

function setup({ failOn } = {}) {
  const sheets = [fakeSheet('Sheet1')];
  const calls = { flush: 0 };
  const byName = (n) => sheets.find((s) => s.name === n) || null;
  const ss = {
    getSheets: () => sheets,
    getSheetByName: byName,
    insertSheet: (n) => {
      const s = fakeSheet(n);
      if (failOn === n) s.appendRow = () => { throw new Error('boom'); };
      sheets.push(s);
      return s;
    },
    getUrl: () => 'https://docs.google.com/spreadsheets/d/SHEET123/edit',
  };
  const ctx = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush: () => { calls.flush++; } },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'JSON', TEXT: 'TEXT' },
      createTextOutput: (text) => ({ setMimeType() { return this; }, getContent: () => text }),
    },
  });
  vm.runInContext(code, ctx);
  const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).getContent());
  const get = (parameter = {}) => ctx.doGet({ parameter }).getContent();
  const tab = (n) => byName(n);
  return { sheets, tab, post, calls, get };
}

const HEADER = ['Date', 'Category', 'Start', 'End', 'Hours', 'ID'];
const payload = { id: 'abc', date: '2026-11-19', category: 'Client', start: 1700000000000, end: 1700003600000, hours: 1 };

test('writes the row to its category tab and to Everything, creating them with headers', () => {
  const { tab, post } = setup();
  const res = post(payload);
  assert.deepEqual({ ...res }, { ok: true, id: 'abc', duplicate: false });
  for (const name of ['Client', 'Everything']) {
    const rows = tab(name).rows;
    assert.equal(rows.length, 2, name);
    assert.deepEqual(rows[0], HEADER);
    const [date, category, start, end, hours, id] = rows[1];
    assert.deepEqual([date, category, hours, id], ['2026-11-19', 'Client', 1, 'abc']);
    assert.equal(start.getTime(), 1700000000000);
    assert.equal(end.getTime(), 1700003600000);
  }
  assert.equal(tab('Personal'), null);
  assert.equal(tab('Employer'), null);
  assert.equal(tab('Sheet1').rows.length, 0); // the old default tab is left alone
});

test('each category goes to its own tab; Everything collects all', () => {
  const { tab, post } = setup();
  post({ ...payload, id: 'c1', category: 'Client' });
  post({ ...payload, id: 'p1', category: 'Personal' });
  post({ ...payload, id: 'e1', category: 'Employer' });
  assert.deepEqual(tab('Client').rows.slice(1).map((r) => r[5]), ['c1']);
  assert.deepEqual(tab('Personal').rows.slice(1).map((r) => r[5]), ['p1']);
  assert.deepEqual(tab('Employer').rows.slice(1).map((r) => r[5]), ['e1']);
  assert.deepEqual(tab('Everything').rows.slice(1).map((r) => r[5]), ['c1', 'p1', 'e1']);
});

test('unknown category goes only to Everything', () => {
  const { tab, sheets, post } = setup();
  const res = post({ ...payload, category: 'Hobby' });
  assert.equal(res.ok, true);
  assert.equal(tab('Everything').rows.length, 2);
  assert.deepEqual(sheets.map((s) => s.name).sort(), ['Everything', 'Sheet1']);
});

test('duplicate id appends no second row anywhere', () => {
  const { tab, post } = setup();
  post(payload);
  const res = post(payload);
  assert.deepEqual({ ...res }, { ok: true, id: 'abc', duplicate: true });
  assert.equal(tab('Client').rows.length, 2);
  assert.equal(tab('Everything').rows.length, 2);
});

test('a retry after a partial failure fills in only the missing tab', () => {
  const { tab, post } = setup({ failOn: 'Everything' });
  const first = post(payload);
  assert.equal(first.ok, false);
  assert.equal(tab('Client').rows.length, 2);
  tab('Everything').appendRow = function (r) { this.rows.push(Array.from(r)); };
  const second = post(payload);
  assert.deepEqual({ ...second }, { ok: true, id: 'abc', duplicate: false });
  assert.equal(tab('Client').rows.length, 2);
  assert.equal(tab('Everything').rows.length, 2);
});

test('bad JSON returns ok:false', () => {
  const { sheets, post } = setup();
  const res = post('not json{');
  assert.equal(res.ok, false);
  assert.equal(typeof res.error, 'string');
  assert.equal(sheets.length, 1);
});

test('missing id returns ok:false', () => {
  const { sheets, post } = setup();
  const res = post({ ...payload, id: undefined });
  assert.equal(res.ok, false);
  assert.equal(sheets.length, 1);
});

test('flush is called after appending, and not on duplicates', () => {
  const { post, calls } = setup();
  post(payload);
  assert.equal(calls.flush, 1);
  post(payload);
  assert.equal(calls.flush, 1);
});

test('doGet without params shows a human-readable working message', () => {
  const { get, sheets } = setup();
  assert.match(get(), /Work Timer sync is working/);
  assert.equal(sheets.length, 1);
});

test('doGet?format=json returns the spreadsheet URL', () => {
  const { get } = setup();
  assert.deepEqual({ ...JSON.parse(get({ format: 'json' })) }, { ok: true, sheetUrl: 'https://docs.google.com/spreadsheets/d/SHEET123/edit' });
});
