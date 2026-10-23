// Human-readable durations and times for estimates.

/** "8 m", "1 h 10 m", "2 h"; "< 1 m" for very short durations. */
export function formatMinutes(minutes: number): string {
  const total = Math.round(minutes);
  if (total < 1) return '< 1 m';
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} m`;
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
}

/** "50 m – 1 h 40 m", or a single value when both ends round to the same text. */
export function formatMinutesRange(low: number, high: number): string {
  const a = formatMinutes(low);
  const b = formatMinutes(high);
  return a === b ? a : `${a} – ${b}`;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Clock time in the viewer's locale, with the date only when it isn't the same day as `now`. */
export function formatWhen(ts: number, now: number): string {
  const d = new Date(ts);
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return sameDay(d, new Date(now))
    ? time
    : `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}
