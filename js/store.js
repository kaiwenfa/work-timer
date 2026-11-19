const KEYS = { active: 'wt.active', sessions: 'wt.sessions', settings: 'wt.settings', corrupt: 'wt.sessions.corrupt' };
const DEFAULT_SETTINGS = { sheetUrl: '', sound: true, silentSound: false, lastCategory: 'Client' };

export function createStore(storage) {
  const read = (key, fallback) => {
    try {
      const raw = storage.getItem(key);
      if (raw == null) return fallback;
      const value = JSON.parse(raw);
      return value == null ? fallback : value;
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => storage.setItem(key, JSON.stringify(value));

  // Before overwriting an unparseable / wrong-shape sessions value, keep the raw
  // string in wt.sessions.corrupt (appended with a newline if a backup already exists).
  // Write errors are deliberately not caught: callers (the UI) handle them.
  const backupIfCorrupt = () => {
    const raw = storage.getItem(KEYS.sessions);
    if (raw == null) return;
    let ok = false;
    try { ok = Array.isArray(JSON.parse(raw)); } catch { ok = false; }
    if (ok) return;
    const prev = storage.getItem(KEYS.corrupt);
    storage.setItem(KEYS.corrupt, prev == null ? raw : `${prev}\n${raw}`);
  };
  const writeSessions = (list) => {
    backupIfCorrupt();
    write(KEYS.sessions, list);
  };

  const listSessions = () => {
    const v = read(KEYS.sessions, []);
    return Array.isArray(v) ? v : [];
  };

  const getSettings = () => {
    const v = read(KEYS.settings, {});
    return { ...DEFAULT_SETTINGS, ...(typeof v === 'object' && !Array.isArray(v) ? v : {}) };
  };

  return {
    getActive: () => read(KEYS.active, null),
    setActive: (a) => write(KEYS.active, a),
    clearActive: () => storage.removeItem(KEYS.active),
    addSession: (s) => writeSessions( [...listSessions(), s]),
    listSessions,
    pendingSessions: () => listSessions().filter((s) => !s.synced),
    markSynced: (id) =>
      writeSessions(listSessions().map((s) => (s.id === id ? { ...s, synced: true } : s))),
    getSettings,
    saveSettings: (partial) => write(KEYS.settings, { ...getSettings(), ...partial }),
  };
}
