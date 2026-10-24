import { describe, expect, it } from 'vitest';
import { activitySeries, MAX_ACTIVITY_BUCKETS, median, progressBreakdown } from '../../src/lib/insights';
import type { Task } from '../../src/lib/types';
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

  it('works on the standard fixture', () => {
    const p = progressBreakdown(standard.tasks as Task[]);
    expect(p.overall.total).toBe(12);
    expect(p.byStatus.reduce((n, s) => n + s.count, 0)).toBe(12);
  });
});

describe('activitySeries', () => {
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
    expect(s.unitLabel).toBe('1 hour');
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
    expect(days.unitLabel).toBe('1 day');
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
