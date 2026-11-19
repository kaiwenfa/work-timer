// Work Timer endpoint. Paste into Extensions > Apps Script and deploy as a Web app.

const HEADER = ['Date', 'Category', 'Start', 'End', 'Hours', 'ID'];
// Each category gets its own tab; every session also goes to ALL_TAB. Tabs are created on first use.
const CATEGORY_TABS = { Client: 'Client', Personal: 'Personal', Employer: 'Employer' };
const ALL_TAB = 'Everything';

function rowFromPayload(p) {
  return [p.date, p.category, new Date(p.start), new Date(p.end), p.hours, p.id];
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getTab(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADER);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function hasId(sheet, id) {
  const last = sheet.getLastRow();
  if (last < 2) return false;
  const ids = sheet.getRange(2, 6, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return true;
  }
  return false;
}

function doPost(e) {
  let p;
  try {
    p = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut({ ok: false, error: 'Invalid JSON' });
  }
  if (!p || typeof p !== 'object' || !p.id) {
    return jsonOut({ ok: false, error: 'Missing id' });
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const names = [];
    if (Object.prototype.hasOwnProperty.call(CATEGORY_TABS, p.category)) names.push(CATEGORY_TABS[p.category]);
    names.push(ALL_TAB);

    // Check each tab separately, so a retry after a partial failure fills in only what is missing.
    let wrote = false;
    for (let i = 0; i < names.length; i++) {
      const sheet = getTab(ss, names[i]);
      if (!hasId(sheet, p.id)) {
        sheet.appendRow(rowFromPayload(p));
        wrote = true;
      }
    }
    if (wrote) {
      SpreadsheetApp.flush();
      try { refreshSummary(); } catch (e3) { /* the totals are a convenience; never fail a sync over them */ }
    }
    return jsonOut({ ok: true, id: p.id, duplicate: !wrote });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

// ---------- Summary tab: weekly and monthly hours per category ----------
const SUMMARY_TAB = 'Summary';
const SUMMARY_CATS = ['Client', 'Personal', 'Employer'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function round2(n) { return Math.round(n * 100) / 100; }

// rows: [date, category, start, end, hours] from the Everything tab. toIso turns a date cell into 'YYYY-MM-DD'.
// Returns { weeks, months }, each a list of [label, client, personal, employer, total], newest first.
function buildSummary(rows, toIso) {
  const weeks = {};
  const months = {};
  const add = (bucket, key, label, cat, hours) => {
    if (!bucket[key]) bucket[key] = { label: label, sums: [0, 0, 0], total: 0 };
    const i = SUMMARY_CATS.indexOf(cat);
    if (i >= 0) bucket[key].sums[i] += hours;
    bucket[key].total += hours;
  };
  for (let r = 0; r < rows.length; r++) {
    const cell = rows[r][0];
    if (cell === '' || cell === null || cell === undefined) continue;
    const iso = String(toIso(cell) || '');
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) continue;
    const hours = Number(rows[r][4]) || 0;
    const cat = String(rows[r][1]);
    const day = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    const monday = new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * 86400000);
    const wKey = monday.toISOString().slice(0, 10);
    add(weeks, wKey, MONTHS[monday.getUTCMonth()] + ' ' + monday.getUTCDate() + ', ' + monday.getUTCFullYear(), cat, hours);
    add(months, m[1] + '-' + m[2], MONTHS[+m[2] - 1] + ' ' + m[1], cat, hours);
  }
  const table = (bucket) => Object.keys(bucket).sort().reverse().map((k) => {
    const b = bucket[k];
    return [b.label, round2(b.sums[0]), round2(b.sums[1]), round2(b.sums[2]), round2(b.total)];
  });
  return { weeks: table(weeks), months: table(months) };
}

function writeTable(sheet, col, title, firstHeader, data) {
  sheet.getRange(1, col).setValues([[title]]).setFontWeight('bold');
  sheet.getRange(2, col, 1, 5).setValues([[firstHeader].concat(SUMMARY_CATS, ['Total'])]).setFontWeight('bold');
  if (data.length) {
    sheet.getRange(3, col, data.length, 1).setNumberFormat('@'); // keep labels as text
    sheet.getRange(3, col + 1, data.length, 4).setNumberFormat('0.00');
    sheet.getRange(3, col, data.length, 5).setValues(data);
  }
}

// Rebuilds the Summary tab from the Everything tab. Runs after each sync, when the Sheet opens, and from the menu.
function refreshSummary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const all = ss.getSheetByName(ALL_TAB);
  const last = all ? all.getLastRow() : 0;
  const rows = last > 1 ? all.getRange(2, 1, last - 1, 5).getValues() : [];
  const tz = ss.getSpreadsheetTimeZone();
  const toIso = (v) => (Object.prototype.toString.call(v) === '[object Date]'
    ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v));
  const s = buildSummary(rows, toIso);

  let sheet = ss.getSheetByName(SUMMARY_TAB);
  if (!sheet) sheet = ss.insertSheet(SUMMARY_TAB, 0);
  sheet.clear();
  writeTable(sheet, 1, 'WEEKLY HOURS', 'Week of', s.weeks);
  writeTable(sheet, 7, 'MONTHLY HOURS', 'Month', s.months);
  sheet.setFrozenRows(2);
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Work Timer').addItem('Refresh summary', 'refreshSummary').addToUi();
  try { refreshSummary(); } catch (e) { /* ignore; the menu item can retry */ }
}

// Opening the URL in a browser shows a check message; the app calls ?format=json to learn the Sheet's link.
function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.format === 'json') {
    return jsonOut({ ok: true, sheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl() });
  }
  return ContentService.createTextOutput('✓ Work Timer sync is working. Paste this URL into the app\'s settings.')
    .setMimeType(ContentService.MimeType.TEXT);
}
