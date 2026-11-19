// Work Timer endpoint. Paste into Extensions > Apps Script and deploy as a Web app.

const HEADER = ['Date', 'Category', 'Start', 'End', 'Hours', 'ID'];

function rowFromPayload(p) {
  return [p.date, p.category, new Date(p.start), new Date(p.end), p.hours, p.id];
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
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
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADER);
    }
    const last = sheet.getLastRow();
    if (last > 1) {
      const ids = sheet.getRange(2, 6, last - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) === String(p.id)) {
          return jsonOut({ ok: true, id: p.id, duplicate: true });
        }
      }
    }
    sheet.appendRow(rowFromPayload(p));
    SpreadsheetApp.flush();
    return jsonOut({ ok: true, id: p.id, duplicate: false });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}
