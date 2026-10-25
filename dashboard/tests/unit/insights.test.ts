import { describe, expect, it } from 'vitest';
import {
  activitySeries,
  gaps,
  MAX_ACTIVITY_BUCKETS,
  median,
  progressBreakdown,
  periodPhrase,
  PRESET_BUCKET_MS,
  rangeLabel,
  rangeWindow,
} from '../../src/lib/insights';
import type { Task } from '../../src/lib/types';
import { resolveVocabulary } from '../../src/lib/vocab';
import standard from '../fixtures/standard.json';

const H = 3_600_000;
const T0 = Date.parse('2026-04-01T08:10:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

const task = (id: string, fields: Partial<Task> = {}): Task => ({
  id,
  name: `Task ${id}`,
  phase: 0,
  type: 'feature',
  description: '',
  status: 'todo',
  ...fields,
});

/** A task started at T0 + `start` hours and, when `end` is given, done at T0 + `end` hours */
const worked = (id: string, start: number, end?: number, fields: Partial<Task> = {}) =>
  task(id, {
    status: end === undefined ? 'in_progress' : 'done',
    created_at: iso(T0),
    started_at: iso(T0 + start * H),
    ...(end === undefined ? {} : { completed_at: iso(T0 + end * H) }),
    ...fields,
  });

describe('median', () => {
  it('is the middle value, or the mean of the two middle ones', () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([9, 1, 5])).toBe(5);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('progressBreakdown', () => {
  it('shares done overall, per phase and per type', () => {
    const tasks = [
      task('a', { status: 'done', phase: 1 }),
      task('b', { phase: 1, type: 'test' }),
      task('c', { status: 'done', phase: 0, type: 'test' }),
      task('d', { status: 'in_progress', phase: 0 }),
    ];
    const p = progressBreakdown(tasks);
    expect(p.overall).toEqual({ key: 'all', label: 'All tasks', done: 2, total: 4, ratio: 0.5 });
    expect(p.byPhase.map((s) => [s.label, s.done, s.total])).toEqual([
      ['Phase 0', 1, 2],
      ['Phase 1', 1, 2],
    ]);
    expect(p.byType.map((s) => [s.key, s.ratio])).toEqual([
      ['feature', 0.5],
      ['test', 0.5],
    ]);
  });

  it('counts statuses in workflow order, unknown statuses last', () => {
    const tasks = ['todo', 'weird', 'done', 'blocked', 'done', 'in_progress'].map((status, i) =>
      task(String(i), { status }),
    );
    expect(progressBreakdown(tasks).byStatus).toEqual([
      { status: 'done', count: 2 },
      { status: 'in_progress', count: 1 },
      { status: 'todo', count: 1 },
      { status: 'blocked', count: 1 },
      { status: 'weird', count: 1 },
    ]);
  });

  it('no tasks: a ratio of 0, not NaN', () => {
    expect(progressBreakdown([]).overall.ratio).toBe(0);
  });

  it("follows a project's statuses by kind: done-kind is done, the split is in kind order", () => {
    const vocab = resolveVocabulary({
      statuses: [
        { id: 'backlog', kind: 'todo' },
        { id: 'doing', kind: 'active' },
        { id: 'awaiting_user', kind: 'review' },
        { id: 'shipped', kind: 'done' },
      ],
    });
    const tasks = ['backlog', 'awaiting_user', 'shipped', 'doing', 'shipped'].map((status, i) =>
      task(String(i), { status }),
    );
    const p = progressBreakdown(tasks, vocab);
    expect(p.overall.done).toBe(2);
    expect(p.byStatus.map((s) => s.status)).toEqual(['shipped', 'doing', 'awaiting_user', 'backlog']);
  });

  it('works on the standard fixture', () => {
    const p = progressBreakdown(standard.tasks as Task[]);
    expect(p.overall.total).toBe(12);
    expect(p.byStatus.reduce((n, s) => n + s.count, 0)).toBe(12);
  });
});

describe('activitySeries', () => {
  it('measures time per task and agent work until the review was requested; reviews are not work in progress', () => {
    const s = activitySeries(
      [
        worked('a', 0, 4, { agent: 'alice', review_requested_at: iso(T0 + H) }),
        worked('b', 1, undefined, { agent: 'bob', status: 'in_review', review_requested_at: iso(T0 + 2 * H) }),
      ],
      null,
      T0 + 5 * H,
    )!;
    expect(s.cycleTimes.map((c) => [c.id, c.minutes])).toEqual([['a', 60]]);
    expect(s.workingNow).toBe(0);
    // Each worked one hour (hourly buckets, aligned to the clock: 08:00, 09:00, ...), not until completion or now
    const busyHours = (agent: string) => s.buckets.reduce((sum, b) => sum + (b.agentBusy[agent] ?? 0), 0);
    expect(busyHours('alice')).toBeCloseTo(1);
    expect(busyHours('bob')).toBeCloseTo(1);
    // At 09:00 alice works, at 10:00 bob; after that both tasks only wait for their reviews
    expect(s.buckets.map((b) => b.wip)).toEqual([1, 1, 0, 0, 0]);
  });

  it("follows a project's statuses by kind", () => {
    const vocab = resolveVocabulary({
      statuses: [
        { id: 'backlog', kind: 'todo' },
        { id: 'doing', kind: 'active' },
        { id: 'shipped', kind: 'done' },
      ],
    });
    const tasks = [worked('a', 0, 1, { status: 'shipped' }), worked('b', 1, undefined, { status: 'doing' })];
    expect(activitySeries(tasks, null, T0 + 2 * H)).toBeNull();
    const s = activitySeries(tasks, null, T0 + 2 * H, vocab)!;
    expect([s.totalCompleted, s.workingNow]).toEqual([1, 1]);
  });

  it('is null without completions', () => {
    expect(activitySeries([])).toBeNull();
    expect(activitySeries([worked('a', 0)])).toBeNull();
  });

  it('buckets completions by hour over a short span, with per-type counts and a rolling average', () => {
    const tasks = [
      worked('a', 0, 0.5),
      worked('b', 0.2, 0.6, { type: 'test' }),
      worked('c', 1, 2.5),
      worked('d', 2, 3.2),
      worked('e', 3, undefined),
      task('f', { created_at: iso(T0 + 2.5 * H) }),
    ];
    const s = activitySeries(tasks)!;
    expect(s.unitLabel).toBe('hour');
    expect(s.bucketMs).toBe(H);
    expect(s.totalCompleted).toBe(4);
    expect(s.buckets.map((b) => b.completed.length)).toEqual([2, 0, 1, 1]);
    expect(s.buckets[0].byType).toEqual({ feature: 1, test: 1 });
    // Mean of this bucket and up to two before it
    expect(s.buckets.map((b) => b.average)).toEqual([2, 1, 1, 2 / 3]);
    expect(s.buckets.map((b) => b.cumulativeDone)).toEqual([2, 2, 3, 4]);
    // Buckets are whole clock hours (08:00–09:00, …), so they end at T0 + 0.83 h, 1.83 h, … f is created in the third
    // hour
    expect(s.buckets.map((b) => b.scope)).toEqual([5, 5, 6, 6]);
    // In progress at each bucket's end: c (1–2.5), d (2–3.2), e (3–)
    expect(s.buckets.map((b) => b.wip)).toEqual([0, 1, 1, 1]);
    expect(s.types).toEqual([
      { type: 'feature', count: 3 },
      { type: 'test', count: 1 },
    ]);
  });

  it('measures cycle times from start to completion, oldest first, with their median', () => {
    const s = activitySeries([worked('slow', 0, 3), worked('fast', 1, 1.5), worked('bad', 2, 1)])!;
    expect(s.cycleTimes.map((c) => [c.id, c.minutes])).toEqual([
      ['fast', 30],
      ['slow', 180],
    ]);
    expect(s.medianCycleMinutes).toBe(105);
  });

  it('picks longer buckets for longer spans, never more than the maximum', () => {
    const days = activitySeries([worked('a', 0, 1), worked('b', 0, 24 * 20)])!;
    expect(days.unitLabel).toBe('day');
    const months = activitySeries([worked('a', 0, 1), worked('b', 0, 24 * 365 * 5)])!;
    expect(months.unitLabel).toBe('30 days');
    for (const s of [days]) expect(s.buckets.length).toBeLessThanOrEqual(MAX_ACTIVITY_BUCKETS);
  });

  it('tasks without a start time still count as completions, but have no cycle time', () => {
    const s = activitySeries([task('a', { status: 'done', completed_at: iso(T0) })])!;
    expect(s.totalCompleted).toBe(1);
    expect(s.cycleTimes).toEqual([]);
    expect(s.medianCycleMinutes).toBeNull();
  });
});

describe('rangeWindow and activity in a period', () => {
  const now = new Date(2026, 3, 1, 15, 30).getTime(); // Wednesday 1 April, 15:30 local

  it('turns presets into periods ending now', () => {
    expect(rangeWindow({ preset: 'hour' }, now)).toEqual({ start: now - H, end: now });
    expect(rangeWindow({ preset: 'day' }, now)!.start).toBe(new Date(2026, 3, 1).getTime());
    expect(rangeWindow({ preset: 'week' }, now)!.start).toBe(new Date(2026, 2, 30).getTime()); // Monday
    expect(rangeWindow({ preset: 'month' }, now)!.start).toBe(new Date(2026, 3, 1).getTime());
    expect(rangeWindow({ preset: 'all' }, now)).toBeNull();
    expect(rangeWindow({ preset: 'custom', from: 1, to: 5 }, now)).toEqual({ start: 1, end: 5 });
    expect(rangeWindow({ preset: 'custom', from: 5, to: 1 }, now)).toBeNull();
  });

  it('steps back whole days, weeks and months, with readable labels', () => {
    expect(rangeWindow({ preset: 'day', offset: -1 }, now)).toEqual({
      start: new Date(2026, 2, 31).getTime(),
      end: new Date(2026, 3, 1).getTime(),
    });
    expect(rangeWindow({ preset: 'week', offset: -1 }, now)).toEqual({
      start: new Date(2026, 2, 23).getTime(),
      end: new Date(2026, 2, 30).getTime(),
    });
    expect(rangeWindow({ preset: 'month', offset: -2 }, now)!.start).toBe(new Date(2026, 1, 1).getTime());
    expect(rangeWindow({ preset: 'hour', offset: -2 }, now)).toEqual({ start: now - 3 * H, end: now - 2 * H });
    expect(rangeWindow({ preset: 'day', offset: 3 }, now)!.end).toBe(now); // never in the future
    const label = (preset: 'day' | 'week' | 'month' | 'hour', offset = 0) => rangeLabel({ preset, offset }, now);
    expect([label('day'), label('day', -1), label('week'), label('week', -1), label('month', -1)]).toEqual([
      'Today',
      'Yesterday',
      'This week',
      'Last week',
      'Last month',
    ]);
    expect(label('week', -2)).toMatch(/^Week of /);
    expect(label('hour')).toBe('Last hour');
    expect(rangeLabel({ preset: 'all' }, now)).toBe('All time');
  });

  it('a period limits the buckets and counts, but the cumulative total includes earlier work', () => {
    const tasks = [worked('a', 0, 0.5), worked('b', 1, 2.5), worked('c', 2, 2.7)];
    const s = activitySeries(tasks, { start: T0 + 2 * H, end: T0 + 3 * H })!;
    expect(s.unitLabel).toBe('5 minutes');
    expect(s.totalCompleted).toBe(2);
    expect(s.cycleTimes.map((c) => c.id)).toEqual(['b', 'c']);
    expect(s.buckets.at(-1)!.cumulativeDone).toBe(3);
  });

  it('each stepped period has its natural bucket: an hour per 5 minutes, a day per hour, a week or month per day', () => {
    const tasks = [worked('a', 0, 0.5), worked('b', 1, 2.5)];
    const bucketOf = (preset: 'hour' | 'day' | 'week' | 'month') => {
      const s = activitySeries(tasks, rangeWindow({ preset }, now), now, undefined, PRESET_BUCKET_MS[preset])!;
      return [s.unitLabel, s.buckets.length];
    };
    expect(bucketOf('hour')).toEqual(['5 minutes', 12]);
    expect(bucketOf('day')).toEqual(['hour', 16]); // midnight to 15:30
    expect(bucketOf('week')).toEqual(['day', 3]); // Monday to Wednesday (the bug: "per 6 hours")
    expect(bucketOf('month')).toEqual(['day', 1]);
    // All time and custom periods still pick the smallest size that fits
    expect(PRESET_BUCKET_MS.all).toBeUndefined();
    expect(PRESET_BUCKET_MS.custom).toBeUndefined();
  });

  it('periodPhrase names the period inside a heading', () => {
    const phrase = (preset: 'hour' | 'day' | 'week' | 'month', offset = 0) => periodPhrase({ preset, offset }, now);
    expect([phrase('hour'), phrase('day'), phrase('day', -1), phrase('week'), phrase('week', -1)]).toEqual([
      'in the last hour',
      'today',
      'yesterday',
      'this week',
      'last week',
    ]);
    expect([phrase('month'), phrase('month', -1)]).toEqual(['this month', 'last month']);
    expect(phrase('week', -2)).toMatch(/^in the week of /);
    expect(phrase('month', -2)).toMatch(/^in February 2026$/);
    expect(phrase('day', -3)).toMatch(/^on /);
    expect(phrase('hour', -1)).toMatch(/^from /);
    expect(periodPhrase({ preset: 'all' }, now)).toBe('over all time');
    expect(periodPhrase({ preset: 'custom', from: 1, to: 5 }, now)).toBe('in the chosen period');
  });
});

describe('idle stretches', () => {
  const M = 60_000;
  it('gaps of at least 10 minutes in the union of work intervals', () => {
    const work = [
      { start: 0, end: 20 * M },
      { start: 10 * M, end: 30 * M }, // overlaps: no gap
      { start: 35 * M, end: 40 * M }, // 5 min pause: too short
      { start: 70 * M, end: 80 * M }, // 30 min gap
      { start: 200 * M, end: 300 * M }, // starts after the end
    ];
    expect(gaps(work, 0, 120 * M)).toEqual([
      { start: 40 * M, end: 70 * M },
      { start: 80 * M, end: 120 * M },
    ]);
    expect(gaps([], 0, 5 * M)).toEqual([]);
  });

  it('activity reports idle time from the first start to now', () => {
    // a: 0–0.5 h, b: 2–2.5 h, now 3 h: idle 0.5–2 h and 2.5–3 h
    const s = activitySeries([worked('a', 0, 0.5), worked('b', 2, 2.5)], null, T0 + 3 * H)!;
    expect(s.idle).toEqual([
      { start: T0 + 0.5 * H, end: T0 + 2 * H },
      { start: T0 + 2.5 * H, end: T0 + 3 * H },
    ]);
    expect(s.idleMs).toBe(2 * H);
  });

  it('agents busy per period: each agent at most fully busy', () => {
    const s = activitySeries(
      [worked('a', 0, 0.5, { agent: 'x' }), worked('b', 0, 0.5, { agent: 'x' }), worked('c', 0, 1, { agent: 'y' })],
      null,
      T0 + H,
    )!;
    expect(s.agents).toEqual(['x', 'y']);
    expect(s.buckets[0].agentBusy.x).toBeLessThanOrEqual(1);
    expect(s.workingNow).toBe(0);
  });
});
