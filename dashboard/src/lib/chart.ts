// Small helpers for hand-written SVG charts: time ticks that adapt from minutes to weeks, and integer value ticks.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const STEPS = [MIN, 5 * MIN, 15 * MIN, 30 * MIN, HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 7 * DAY, 14 * DAY];

/** Evenly spaced tick times within [start, end], at most `max` of them; day steps align to local midnight. */
export function timeTicks(start: number, end: number, max = 6): { step: number; ticks: number[] } {
  const span = Math.max(end - start, MIN);
  const step = STEPS.find((s) => span / s <= max) ?? STEPS[STEPS.length - 1];
  let first: number;
  if (step >= DAY) {
    const d = new Date(start);
    d.setHours(0, 0, 0, 0);
    first = d.getTime() < start ? d.getTime() + DAY : d.getTime();
  } else {
    first = Math.ceil(start / step) * step;
  }
  const ticks: number[] = [];
  for (let t = first; t <= end; t += step) ticks.push(t);
  return { step, ticks };
}

/** Label for a time tick: dates for day steps, clock times otherwise. */
export function timeTickLabel(t: number, step: number): string {
  const d = new Date(t);
  return step >= DAY
    ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** A round upper bound and integer ticks for a count axis: 0, …, max (3–6 ticks). */
export function countTicks(maxValue: number): { max: number; ticks: number[] } {
  const target = Math.max(1, maxValue);
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => Math.ceil(target / s) <= 5) ?? 1000;
  const max = Math.ceil(target / step) * step;
  return { max, ticks: Array.from({ length: max / step + 1 }, (_, i) => i * step) };
}
