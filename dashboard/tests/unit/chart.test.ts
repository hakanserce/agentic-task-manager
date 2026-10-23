import { describe, expect, it } from 'vitest';
import { countTicks, timeTickLabel, timeTicks } from '../../src/lib/chart';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('timeTicks', () => {
  it('uses minute steps for short spans and keeps ticks inside the range', () => {
    const start = Date.UTC(2026, 3, 6, 12, 3);
    const { step, ticks } = timeTicks(start, start + 20 * MIN);
    expect(step).toBe(5 * MIN);
    expect(ticks.every((t) => t >= start && t <= start + 20 * MIN)).toBe(true);
    expect(ticks.length).toBeLessThanOrEqual(6);
  });

  it('uses day steps aligned to local midnight for multi-day spans', () => {
    const start = new Date(2026, 3, 1, 8).getTime();
    const { step, ticks } = timeTicks(start, new Date(2026, 3, 6, 12).getTime());
    expect(step).toBe(DAY);
    expect(ticks.map((t) => new Date(t).getHours())).toEqual(ticks.map(() => 0));
    expect(new Date(ticks[0]).getDate()).toBe(2);
  });

  it('copes with a zero-length span', () => {
    expect(timeTicks(0, 0).step).toBe(MIN);
  });
});

describe('timeTickLabel', () => {
  it('shows dates for day steps and times otherwise', () => {
    const t = new Date(2026, 3, 2, 0, 0).getTime();
    expect(timeTickLabel(t, DAY)).toBe(new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
    expect(timeTickLabel(t, HOUR)).toBe(
      new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    );
  });
});

describe('countTicks', () => {
  it('rounds the top up and uses integer steps', () => {
    expect(countTicks(15)).toEqual({ max: 15, ticks: [0, 5, 10, 15] });
    expect(countTicks(7)).toEqual({ max: 8, ticks: [0, 2, 4, 6, 8] });
    expect(countTicks(0)).toEqual({ max: 1, ticks: [0, 1] });
    expect(countTicks(90).ticks.length).toBeLessThanOrEqual(6);
  });
});
