const KEYS = { active: 'wt.active', sessions: 'wt.sessions', settings: 'wt.settings' };
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
    addSession: (s) => write(KEYS.sessions, [...listSessions(), s]),
    listSessions,
    pendingSessions: () => listSessions().filter((s) => !s.synced),
    markSynced: (id) =>
      write(KEYS.sessions, listSessions().map((s) => (s.id === id ? { ...s, synced: true } : s))),
    getSettings,
    saveSettings: (partial) => write(KEYS.settings, { ...getSettings(), ...partial }),
  };
}
