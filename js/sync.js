export function toPayload(s) {
  return {
    id: s.id,
    date: s.date,
    category: s.category,
    start: s.start,
    end: s.end,
    hours: s.hours,
  };
}

async function postOne(session, url, fetchFn) {
  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(toPayload(session)),
      redirect: 'follow',
    });
    const data = await res.json();
    return data !== null && typeof data === 'object' && data.ok === true && data.id === session.id;
  } catch {
    return false;
  }
}

export async function syncPending(store, url, fetchFn = fetch) {
  if (typeof url !== 'string' || url.trim() === '') {
    return { synced: 0, failed: 0, needsSetup: true };
  }
  let synced = 0;
  let failed = 0;
  for (const session of store.pendingSessions()) {
    if (await postOne(session, url, fetchFn)) {
      store.markSynced(session.id);
      synced++;
    } else {
      failed++;
    }
  }
  return { synced, failed, needsSetup: false };
}

// Asks the Apps Script for the Sheet's own link. Returns null if offline, on an old script, or on anything odd.
export async function fetchSheetLink(url, fetchFn = fetch) {
  if (typeof url !== 'string' || url.trim() === '') return null;
  try {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetchFn(`${url.trim()}${sep}format=json`, { redirect: 'follow' });
    const data = await res.json();
    const link = data && data.ok === true && data.sheetUrl;
    return typeof link === 'string' && link.startsWith('https://docs.google.com/') ? link : null;
  } catch {
    return null;
  }
}
