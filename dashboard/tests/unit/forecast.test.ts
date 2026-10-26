import { describe, expect, it } from 'vitest';
import {
  activePhases,
  forecastPhases,
  pace,
  percentile,
  taskDurations,
  withWholePhaseEstimates,
  type PhaseForecast,
} from '../../src/lib/forecast';
import type { Task } from '../../src/lib/types';
import { resolveVocabulary } from '../../src/lib/vocab';
import progress from '../fixtures/progress.json';

// Expected numbers: tests/fixtures/progress.md
const NOW = Date.parse('2026-04-06T12:00:00Z');
const tasks = progress.tasks as Task[];
const t = (id: string, status: string, extra: Partial<Task> = {}): Task => ({
  id,
  name: id,
  phase: 0,
  type: 'feature',
  description: '',
  status,
  ...extra,
});

describe('taskDurations', () => {
  it('uses start/complete times, falls back to the gap since the previous completion, and caps idle gaps', () => {
    expect(taskDurations(tasks).map((d) => [d.id, d.minutes])).toEqual([
      ['T-001', 6],
      ['T-002', 8],
      ['T-003', 10],
      ['T-004', 6],
      ['T-005', 12],
      ['T-006', 8],
      ['T-007', 9],
      ['T-008', 30],
    ]);
  });

  it('leaves out a first completion with nothing to measure from', () => {
    expect(taskDurations([t('a', 'done', { updated_at: '2026-04-01T10:00:00Z' })])).toEqual([]);
  });

  it('ignores a started_at after the completion and unusable timestamps', () => {
    const d = taskDurations([
      t('a', 'done', { completed_at: '2026-04-01T10:00:00Z', started_at: '2026-04-01T09:50:00Z' }),
      t('b', 'done', { completed_at: '2026-04-01T10:05:00Z', started_at: '2026-04-01T11:00:00Z' }),
      t('c', 'done', { completed_at: 'nonsense' }),
      t('d', 'todo', { started_at: '2026-04-01T09:00:00Z' }),
    ]);
    expect(d.map((x) => [x.id, x.minutes])).toEqual([
      ['a', 10],
      ['b', 5],
    ]);
  });
});

describe('percentile and pace', () => {
  it('interpolates between ranks', () => {
    const s = [6, 6, 8, 8, 9, 10, 12, 30];
    expect([percentile(s, 0.25), percentile(s, 0.5), percentile(s, 0.75)]).toEqual([7.5, 8.5, 10.5]);
    expect(percentile([], 0.5)).toBeNaN();
  });

  it('is the median of recent durations with an interquartile range', () => {
    expect(pace(taskDurations(tasks))).toEqual({ likely: 8.5, low: 7.5, high: 10.5, basedOn: 8 });
  });

  it('uses only the last 10 completions', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ id: String(i), completedAt: i, minutes: i < 5 ? 100 : 1 }));
    expect(pace(many)).toMatchObject({ likely: 1, basedOn: 10 });
  });

  it('needs at least 3 timed completions', () => {
    expect(
      pace([
        { id: 'a', completedAt: 0, minutes: 5 },
        { id: 'b', completedAt: 1, minutes: 5 },
      ]),
    ).toBeNull();
  });
});

describe('forecastPhases', () => {
  const f = forecastPhases(tasks, NOW);

  it('reports per-phase progress and state; skipped tasks count apart, not in the total', () => {
    expect(f.phases.map((p) => [p.phase, p.done, p.total, p.skipped, p.remaining, p.blocked, p.state])).toEqual([
      [0, 4, 4, 0, 0, 0, 'done'],
      [1, 4, 6, 0, 1, 1, 'in_progress'],
      [2, 0, 5, 1, 5, 0, 'not_started'],
    ]);
  });

  it('dates finished phases by their last completion', () => {
    expect(f.phases[0].completedAt).toBe(Date.parse('2026-04-01T09:30:00Z'));
    expect(f.phases[0].estimate).toBeUndefined();
  });

  it('accumulates remaining work in phase order', () => {
    expect(f.phases[1].estimate!.minutes).toEqual({ likely: 8.5, low: 7.5, high: 10.5 });
    expect(f.phases[2].estimate!.minutes).toEqual({ likely: 51, low: 45, high: 63 });
    expect(f.phases[2].estimate!.finishAt.likely).toBe(Date.parse('2026-04-06T12:51:00Z'));
  });

  it('gives no estimate without enough history', () => {
    const few = forecastPhases([t('a', 'done', { completed_at: '2026-04-01T10:00:00Z' }), t('b', 'todo')], NOW);
    expect(few.pace).toBeNull();
    expect(few.phases[0].estimate).toBeUndefined();
  });

  it('gives no estimate for a phase where only blocked work is left', () => {
    const blockedOnly = [...tasks.filter((x) => x.phase !== 1), t('x', 'blocked', { phase: 1 })];
    const p1 = forecastPhases(blockedOnly, NOW).phases[1];
    expect([p1.state, p1.remaining, p1.blocked, p1.estimate]).toEqual(['not_started', 0, 1, undefined]);
  });

  it('can measure the pace on other tasks than the ones it estimates', () => {
    const phase2 = tasks.filter((x) => x.phase === 2);
    expect(forecastPhases(phase2, NOW).pace).toBeNull();
    const withHistory = forecastPhases(phase2, NOW, tasks);
    expect(withHistory.pace?.likely).toBe(8.5);
    expect(withHistory.phases[0].estimate!.minutes.likely).toBe(5 * 8.5);
  });

  it("a slice keeps its own counts, but each phase's finish is the whole phase's (T-239)", () => {
    const whole = forecastPhases(tasks, NOW);
    // One task of phase 2: alone it would be estimated as 1 task after phase 1's, not phase 2's five
    const slice = forecastPhases(
      tasks.filter((x) => x.phase !== 2 || x.id === tasks.find((y) => y.phase === 2 && y.status === 'todo')!.id),
      NOW,
      tasks,
    );
    const merged = withWholePhaseEstimates(slice, whole);
    expect(merged.phases.map((p) => [p.phase, p.total])).toEqual(slice.phases.map((p) => [p.phase, p.total]));
    expect(merged.phases[2].estimate).toEqual(whole.phases[2].estimate);
    expect(slice.phases[2].estimate).not.toEqual(whole.phases[2].estimate);
    expect(merged.phases[0].estimate).toBeUndefined(); // finished
  });
});

describe('activePhases', () => {
  const NOW = Date.parse('2026-04-20T12:00:00Z');
  const HOUR = 3_600_000;
  const phase = (n: number, state: PhaseForecast['state'], completedAt?: number): PhaseForecast => ({
    phase: n,
    total: 2,
    skipped: 0,
    done: state === 'done' ? 2 : 0,
    remaining: state === 'done' ? 0 : 2,
    blocked: 0,
    inReview: 0,
    state,
    ...(completedAt === undefined ? {} : { completedAt }),
  });
  const ids = (phases: PhaseForecast[]) => activePhases(phases).map((p) => p.phase);

  it('keeps every unfinished phase and only the one that finished last, however recent the others', () => {
    // A fast project: three phases finished within a few hours
    const phases = [
      phase(0, 'done', NOW - 5 * HOUR),
      phase(1, 'done', NOW - 1 * HOUR),
      phase(2, 'done', NOW - 3 * HOUR),
      phase(3, 'in_progress'),
      phase(4, 'not_started'),
    ];
    expect(ids(phases)).toEqual([1, 3, 4]);
  });

  it('on a tie the higher phase; without any completion times the highest finished phase', () => {
    expect(ids([phase(0, 'done', NOW), phase(1, 'done', NOW), phase(2, 'in_progress')])).toEqual([1, 2]);
    expect(ids([phase(0, 'done'), phase(1, 'done'), phase(2, 'in_progress')])).toEqual([1, 2]);
    // A phase with completion times beats one without
    expect(ids([phase(0, 'done', NOW - HOUR), phase(1, 'done'), phase(2, 'not_started')])).toEqual([0, 2]);
  });

  it('a phase of only skipped tasks counts as finished', () => {
    const skippedOnly: PhaseForecast = { ...phase(1, 'done'), total: 0, done: 0, skipped: 2 };
    expect(ids([phase(0, 'done', NOW - HOUR), skippedOnly, phase(2, 'in_progress')])).toEqual([0, 2]);
    expect(ids([skippedOnly, phase(2, 'in_progress')])).toEqual([1, 2]);
  });

  it('nothing finished: every phase; nothing unfinished: just the last one', () => {
    expect(ids([phase(0, 'in_progress'), phase(1, 'not_started')])).toEqual([0, 1]);
    expect(ids([phase(0, 'done', NOW - HOUR), phase(1, 'done', NOW)])).toEqual([1]);
    expect(ids([])).toEqual([]);
  });
});

describe('status kinds', () => {
  const vocab = resolveVocabulary({
    statuses: [
      { id: 'backlog', kind: 'todo' },
      { id: 'doing', kind: 'active' },
      { id: 'awaiting_user', kind: 'review' },
      { id: 'shipped', kind: 'done' },
      { id: 'on_hold', kind: 'blocked' },
    ],
  });
  const done = (id: string, start: string, end: string, extra: Partial<Task> = {}) =>
    t(id, 'shipped', { started_at: start, completed_at: end, ...extra });
  const history = [
    done('a', '2026-04-01T10:00:00Z', '2026-04-01T10:10:00Z'),
    done('b', '2026-04-01T11:00:00Z', '2026-04-01T11:10:00Z'),
    // Its review took 5 hours: not work, so it measures 10 minutes too
    done('c', '2026-04-01T12:00:00Z', '2026-04-01T17:10:00Z', { review_requested_at: '2026-04-01T12:10:00Z' }),
  ];

  it('measures work until the review was requested', () => {
    expect(taskDurations(history, vocab).map((d) => d.minutes)).toEqual([10, 10, 10]);
  });

  it('counts only tasks that need agent work as remaining: in review and blocked are waiting on someone', () => {
    const phase = [
      ...history,
      t('d', 'backlog'),
      t('e', 'doing'),
      t('f', 'awaiting_user'),
      t('g', 'on_hold'),
      t('h', 'mystery'),
    ];
    const [row] = forecastPhases(phase, NOW, phase, vocab).phases;
    expect(row).toMatchObject({ total: 8, done: 3, remaining: 3, blocked: 1, inReview: 1, state: 'in_progress' });
    expect(row.estimate!.minutes.likely).toBe(3 * 10);
  });

  it('a phase with only reviews left is not finished, and has nothing to estimate', () => {
    const [row] = forecastPhases([...history, t('f', 'awaiting_user')], NOW, history, vocab).phases;
    expect(row).toMatchObject({ remaining: 0, inReview: 1, state: 'in_progress' });
    expect(row.estimate).toBeUndefined();
  });
});
