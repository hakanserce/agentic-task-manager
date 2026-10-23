import { describe, expect, it } from 'vitest';
import { formatMinutes, formatMinutesRange, formatWhen } from '../../src/lib/format';

describe('formatMinutes', () => {
  it('rounds to whole minutes and switches to hours', () => {
    expect(formatMinutes(0.2)).toBe('< 1 m');
    expect(formatMinutes(8.5)).toBe('9 m');
    expect(formatMinutes(59.4)).toBe('59 m');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(70)).toBe('1 h 10 m');
    expect(formatMinutes(63)).toBe('1 h 3 m');
  });
});

describe('formatMinutesRange', () => {
  it('joins both ends, or collapses equal ones', () => {
    expect(formatMinutesRange(45, 63)).toBe('45 m – 1 h 3 m');
    expect(formatMinutesRange(8.2, 7.9)).toBe('8 m');
  });
});

describe('formatWhen', () => {
  const now = new Date(2026, 3, 6, 12, 0).getTime();

  it('shows only the time for today', () => {
    const ts = new Date(2026, 3, 6, 12, 51).getTime();
    expect(formatWhen(ts, now)).toBe(
      new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    );
  });

  it('adds the date for other days', () => {
    const ts = new Date(2026, 3, 1, 9, 30).getTime();
    const out = formatWhen(ts, now);
    expect(out).toContain(new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
    expect(out).toContain(new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));
  });
});
