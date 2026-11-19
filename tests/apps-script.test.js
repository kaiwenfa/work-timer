import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');

function fakeSheet(name) {
  const rows = [];
  const sheetObj = {
    name,
    rows,
    getName: () => name,
    getLastRow: () => rows.length,
    getRange: (row, col, numRows = 1, numCols = 1) => rangeOn(rows, row, col, numRows, numCols),
    appendRow: (r) => { rows.push(Array.from(r)); }, // Array.from: arrays made inside vm have another realm's prototype
    setFrozenRows() {},
    clear: () => { rows.length = 0; },
  };
  return sheetObj;
}

function rangeOn(rows, row, col, numRows, numCols) {
  const range = {
    getValues: () => rows.slice(row - 1, row - 1 + numRows).map((r) => r.slice(col - 1, col - 1 + numCols)),
    setValues: (vals) => {
      vals.forEach((v, i) => {
        const r = row - 1 + i;
        while (rows.length <= r) rows.push([]);
        Array.from(v).forEach((x, j) => { rows[r][col - 1 + j] = x; });
      });
      return range; // like the real Range, so calls can be chained
    },
    setNumberFormat() { return range; },
    setFontWeight() { return range; },
  };
  return range;
}

function setup({ failOn, summaryFails } = {}) {
  const sheets = [fakeSheet('Sheet1')];
  const calls = { flush: 0, menus: [] };
  const byName = (n) => sheets.find((s) => s.name === n) || null;
  const ss = {
    getSheets: () => sheets,
    getSheetByName: byName,
    insertSheet: (n, index) => {
      const s = fakeSheet(n);
      if (failOn === n) s.appendRow = () => { throw new Error('boom'); };
      if (summaryFails && n === 'Summary') s.clear = () => { throw new Error('summary boom'); };
      if (index === undefined) sheets.push(s); else sheets.splice(index, 0, s);
      return s;
    },
    getSpreadsheetTimeZone: () => 'UTC',
    getUrl: () => 'https://docs.google.com/spreadsheets/d/SHEET123/edit',
  };
  const ctx = vm.createContext({
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      flush: () => { calls.flush++; },
      getUi: () => ({
        createMenu: (title) => {
          const m = { title, items: [], addItem(label, fn) { this.items.push([label, fn]); return this; }, addToUi() { calls.menus.push(this); } };
          return m;
        },
      }),
    },
    Utilities: { formatDate: (d, tz, fmt) => d.toISOString().slice(0, 10) },
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
  return { sheets, tab, post, calls, get, ctx };
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
  assert.deepEqual(sheets.map((s) => s.name).sort(), ['Everything', 'Sheet1', 'Summary']);
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

// --- Summary tab ---
const iso = (v) => (typeof v === 'string' ? v : v.toISOString().slice(0, 10));

test('buildSummary groups hours by Monday-start week and by month, per category, newest first', () => {
  const { ctx } = setup();
  const rows = [
    ['2026-11-16', 'Client', 0, 0, 2],     // Mon
    ['2026-11-22', 'Personal', 0, 0, 1.5], // Sun, same week
    ['2026-11-23', 'Client', 0, 0, 1.25],  // next Mon
    ['2026-10-31', 'Employer', 0, 0, 3],   // Sat in Oct; its week starts Mon Oct 26
    ['', '', '', '', ''],                   // blank row ignored
  ];
  const s = ctx.buildSummary(rows, iso);
  assert.deepEqual(JSON.parse(JSON.stringify(s.weeks)), [
    ['Nov 23, 2026', 1.25, 0, 0, 1.25],
    ['Nov 16, 2026', 2, 1.5, 0, 3.5],
    ['Oct 26, 2026', 0, 0, 3, 3],
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(s.months)), [
    ['Nov 2026', 3.25, 1.5, 0, 4.75],
    ['Oct 2026', 0, 0, 3, 3],
  ]);
});

test('buildSummary rounds to 2 decimals and accepts Date cells', () => {
  const { ctx } = setup();
  const s = ctx.buildSummary([[new Date('2026-11-19T00:00:00Z'), 'Client', 0, 0, 0.1], ['2026-11-19', 'Client', 0, 0, 0.2]], iso);
  assert.deepEqual(JSON.parse(JSON.stringify(s.weeks)), [['Nov 16, 2026', 0.3, 0, 0, 0.3]]);
});

test('a sync creates a Summary tab first in the Sheet with weekly and monthly tables', () => {
  const { sheets, tab, post } = setup();
  post({ ...payload, id: 'a', date: '2026-11-19', category: 'Client', hours: 2 });
  post({ ...payload, id: 'b', date: '2026-11-20', category: 'Personal', hours: 1 });
  assert.equal(sheets[0].name, 'Summary');
  const r = tab('Summary').rows;
  assert.equal(r[0][0], 'WEEKLY HOURS');
  assert.deepEqual(r[1].slice(0, 5), ['Week of', 'Client', 'Personal', 'Employer', 'Total']);
  assert.deepEqual(r[2].slice(0, 5), ['Nov 16, 2026', 2, 1, 0, 3]);
  assert.equal(r[0][6], 'MONTHLY HOURS');
  assert.deepEqual(r[1].slice(6, 11), ['Month', 'Client', 'Personal', 'Employer', 'Total']);
  assert.deepEqual(r[2].slice(6, 11), ['Nov 2026', 2, 1, 0, 3]);
});

test('a broken Summary never fails the sync', () => {
  const { tab, post } = setup({ summaryFails: true });
  const res = post(payload);
  assert.deepEqual({ ...res }, { ok: true, id: 'abc', duplicate: false });
  assert.equal(tab('Everything').rows.length, 2);
});

test('onOpen refreshes the Summary and adds a Work Timer menu', () => {
  const { ctx, tab, post, calls } = setup();
  post(payload);
  tab('Everything').rows.push(['2026-11-19', 'Employer', 0, 0, 4, 'manual']); // a row typed in by hand
  ctx.onOpen();
  assert.deepEqual(tab('Summary').rows[2].slice(0, 5), ['Nov 16, 2026', 1, 0, 4, 5]);
  assert.equal(calls.menus[0].title, 'Work Timer');
  assert.deepEqual(Array.from(calls.menus[0].items[0]), ['Refresh summary', 'refreshSummary']);
});
