import { describe, expect, it } from 'vitest';
import { completions, computeTimeline, formatDate, formatDateTime } from '../../src/lib/timeline';
import type { Task } from '../../src/lib/types';
import standard from '../fixtures/standard.json';
import large from '../fixtures/large-90.json';

const done = (id: string, updated_at?: string): Task => ({
  id,
  name: `Task ${id}`,
  phase: 0,
  type: 'feature',
  description: '',
  status: 'done',
  updated_at,
});

describe('completions', () => {
  it('keeps done tasks with valid timestamps, oldest first', () => {
    const tasks = [
      done('b', '2026-04-02T00:00:00Z'),
      done('a', '2026-04-01T00:00:00Z'),
      done('none'),
      done('bad', 'not a date'),
      { ...done('todo', '2026-04-01T00:00:00Z'), status: 'todo' },
    ];
    expect(completions(tasks).map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('computeTimeline', () => {
  it('buckets the standard fixture like the legacy dashboard', () => {
    const t = computeTimeline(standard.tasks as Task[])!;
    expect(t.minT).toBe(Date.parse('2026-04-01T09:00:00Z'));
    expect(t.maxT).toBe(Date.parse('2026-04-03T11:00:00Z'));
    expect(t.buckets.map((b) => b.completions.map((c) => c.id))).toEqual([
      ['T-001', 'T-002'],
      [],
      ['T-003'],
      ['T-012'],
      ['T-004'],
    ]);
    expect(t.buckets.map((b) => b.height)).toEqual([40, 0, 20, 20, 20]);
    expect(t.buckets[1].start).toBe(t.minT + 10 * 3600_000);
  });

  it('needs at least two completions', () => {
    expect(computeTimeline([])).toBeNull();
    expect(computeTimeline([done('a', '2026-04-01T00:00:00Z'), done('b')])).toBeNull();
  });

  it('uses at least 4 and at most 16 buckets', () => {
    expect(
      computeTimeline([done('a', '2026-04-01T00:00:00Z'), done('b', '2026-04-02T00:00:00Z')])!.buckets,
    ).toHaveLength(4);
    expect(computeTimeline(large.tasks as Task[])!.buckets).toHaveLength(16);
  });

  it('puts the latest completion in the last bucket', () => {
    const t = computeTimeline([done('a', '2026-04-01T00:00:00Z'), done('b', '2026-04-05T00:00:00Z')])!;
    expect(t.buckets.at(-1)!.completions.map((c) => c.id)).toEqual(['b']);
  });

  it('handles identical timestamps', () => {
    const t = computeTimeline([done('a', '2026-04-01T00:00:00Z'), done('b', '2026-04-01T00:00:00Z')])!;
    expect(t.buckets[0].completions).toHaveLength(2);
    expect(t.buckets.slice(1).every((b) => b.height === 0)).toBe(true);
  });

  it('scales small buckets to at least 4px', () => {
    const tasks = [done('x', '2026-04-05T00:00:00Z')];
    for (let i = 0; i < 15; i++) tasks.push(done(`a${i}`, '2026-04-01T00:00:00Z'));
    const heights = computeTimeline(tasks)!.buckets.map((b) => b.height);
    expect(heights[0]).toBe(40);
    expect(heights.at(-1)).toBe(4);
  });
});

describe('date formatting', () => {
  it('formats in the runtime locale', () => {
    const ts = Date.parse('2026-04-03T11:00:00Z');
    expect(formatDate(ts)).toBe(new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
    expect(formatDateTime(ts)).toContain(formatDate(ts));
  });
});
