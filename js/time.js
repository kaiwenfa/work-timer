const pad = (n) => String(n).padStart(2, '0');

export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${pad(m)}:${pad(s)}`;
}

export function hoursBetween(startMs, endMs) {
  return Math.round(((endMs - startMs) / 3_600_000) * 100) / 100;
}

export function localDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayTotalMs(sessions, nowMs, active) {
  const today = localDate(nowMs);
  let total = 0;
  for (const s of sessions) {
    if (s.date === today) total += s.end - s.start;
  }
  if (active && localDate(active.start) === today) total += nowMs - active.start;
  return total;
}
