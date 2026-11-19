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
    if (wrote) SpreadsheetApp.flush();
    return jsonOut({ ok: true, id: p.id, duplicate: !wrote });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
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
