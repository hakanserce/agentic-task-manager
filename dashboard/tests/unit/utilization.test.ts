import { describe, expect, it } from 'vitest';
import type { Task } from '../../src/lib/types';
import { utilization, workdayTime } from '../../src/lib/utilization';
import { resolveVocabulary } from '../../src/lib/vocab';

const H = 3_600_000;
// Monday 2026-03-30, local time
const MON = new Date(2026, 2, 30).getTime();
const iso = (ms: number) => new Date(ms).toISOString();
const worked = (id: string, start: number, end: number | null, agent?: string): Task => ({
  id,
  name: id,
  phase: 0,
  type: 'feature',
  description: '',
  status: end === null ? 'in_progress' : 'done',
  started_at: iso(start),
  ...(end === null ? {} : { completed_at: iso(end) }),
  ...(agent ? { agent } : {}),
});

describe('workdayTime', () => {
  it('is 8 hours per weekday, pro rata, and nothing on weekends', () => {
    expect(workdayTime(MON, MON + 24 * H)).toBe(8 * H);
    expect(workdayTime(MON, MON + 12 * H)).toBe(4 * H);
    expect(workdayTime(MON, MON + 7 * 24 * H)).toBe(40 * H);
    const SAT = MON + 5 * 24 * H;
    expect(workdayTime(SAT, SAT + 48 * H)).toBe(0);
  });
});

describe('utilization', () => {
  it('is null before any task has started', () => {
    expect(utilization([], new Map(), MON)).toBeNull();
  });

  it('counts work until a review was requested, not the review; blocked tasks hold no work', () => {
    const tasks = [
      { ...worked('a', MON, MON + 10 * H, 'alice'), review_requested_at: iso(MON + 2 * H) },
      { ...worked('b', MON, null, 'alice'), status: 'in_review', review_requested_at: iso(MON + 3 * H) },
      { ...worked('c', MON, null, 'alice'), status: 'blocked' },
    ];
    expect(utilization(tasks, new Map(), MON + 24 * H)!.workMs).toBe(5 * H);
  });

  it("follows a project's statuses by kind", () => {
    const vocab = resolveVocabulary({
      statuses: [
        { id: 'backlog', kind: 'todo' },
        { id: 'doing', kind: 'active' },
        { id: 'shipped', kind: 'done' },
      ],
    });
    const tasks = [
      { ...worked('a', MON, MON + 2 * H, 'alice'), status: 'shipped' },
      { ...worked('b', MON, null, 'alice'), status: 'doing' },
    ];
    expect(utilization(tasks, new Map(), MON + 4 * H, tasks, vocab)!.workMs).toBe(6 * H);
    // Without the vocabulary neither status means anything
    expect(utilization(tasks, new Map(), MON + 4 * H)!.workMs).toBe(0);
  });

  it('compares agent work with calendar and working time, per agent and in total', () => {
    const tasks = [
      worked('a', MON, MON + 6 * H, 'alice'),
      worked('b', MON, MON + 12 * H, 'bob'),
      worked('c', MON + 20 * H, null, 'alice'), // still running: counts up to now
    ];
    const u = utilization(tasks, new Map(), MON + 24 * H)!;
    expect(u.calendarMs).toBe(24 * H);
    expect(u.workdayMs).toBe(8 * H);
    expect(u.workMs).toBe(22 * H);
    expect(u.daily).toBeCloseTo(22 / 24);
    expect(u.workday).toBeCloseTo(22 / 8);
    expect(u.agents.map((a) => [a.agent, a.workMs / H])).toEqual([
      ['bob', 12],
      ['alice', 10],
    ]);
  });

  it('the period comes from all tasks, the work from the given ones', () => {
    const all = [worked('a', MON, MON + 2 * H), worked('b', MON + 10 * H, MON + 12 * H)];
    const u = utilization([all[1]], new Map(), MON + 24 * H, all)!;
    expect(u.start).toBe(MON);
    expect(u.workMs).toBe(2 * H);
    expect(u.agents[0].agent).toBe('');
  });
});
