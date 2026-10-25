import { describe, expect, it } from 'vitest';
import { burndown } from '../../src/lib/burndown';
import { forecastPhases } from '../../src/lib/forecast';
import type { Task } from '../../src/lib/types';
import { resolveVocabulary } from '../../src/lib/vocab';
import progress from '../fixtures/progress.json';

// Expected numbers: tests/fixtures/progress.md
const NOW = Date.parse('2026-04-06T12:00:00Z');
const tasks = progress.tasks as Task[];
const at = (iso: string) => Date.parse(iso);
const series = (b: ReturnType<typeof burndown>) =>
  b.points.map((p) => [new Date(p.t).toISOString().slice(5, 16), p.scope, p.remaining]);

describe('burndown', () => {
  it('steps scope and remaining at every creation and completion, ending now', () => {
    const b = burndown(tasks, forecastPhases(tasks, NOW), NOW);
    expect(series(b)).toEqual([
      ['04-01T08:00', 10, 10],
      ['04-01T09:06', 10, 9],
      ['04-01T09:14', 10, 8],
      ['04-01T09:24', 10, 7],
      ['04-01T09:30', 10, 6],
      ['04-02T14:12', 10, 5],
      ['04-02T14:20', 10, 4],
      ['04-02T14:29', 10, 3],
      ['04-02T15:00', 15, 8],
      ['04-03T10:00', 15, 7],
      ['04-06T12:00', 15, 7],
    ]);
  });

  it('forecasts from now to the estimated finish; blocked work stays', () => {
    const b = burndown(tasks, forecastPhases(tasks, NOW), NOW);
    expect(b.forecast).toEqual({
      from: { t: NOW, remaining: 7 },
      to: { t: at('2026-04-06T12:51:00Z'), remaining: 1 },
      range: { low: at('2026-04-06T12:45:00Z'), high: at('2026-04-06T13:03:00Z') },
    });
  });

  it('can focus on one phase', () => {
    const f = forecastPhases(tasks, NOW);
    const p1 = burndown(tasks, f, NOW, 1);
    expect(p1.points[0]).toMatchObject({ scope: 6, remaining: 6 });
    expect(p1.points.at(-1)).toMatchObject({ scope: 6, remaining: 2 });
    // Phase 1's estimate (8.5 min) only covers T-009; T-010 is blocked
    expect(p1.forecast!.to).toEqual({ t: NOW + 8.5 * 60_000, remaining: 1 });
    const p0 = burndown(tasks, f, NOW, 0);
    expect(p0.points.at(-1)!.remaining).toBe(0);
    expect(p0.forecast).toBeUndefined();
  });

  it('uses the earliest known time for tasks without created_at', () => {
    const t = (id: string, status: string, extra: Partial<Task> = {}): Task => ({
      id,
      name: id,
      phase: 0,
      type: 'feature',
      description: '',
      status,
      ...extra,
    });
    const old = [t('a', 'done', { updated_at: '2026-04-02T10:00:00Z' }), t('b', 'todo')];
    const b = burndown(old, forecastPhases(old, NOW), NOW);
    expect(series(b)).toEqual([
      ['04-02T10:00', 2, 1],
      ['04-06T12:00', 2, 1],
    ]);
  });

  it('is empty without tasks', () => {
    expect(burndown([], forecastPhases([], NOW), NOW)).toEqual({ points: [] });
  });

  it("follows a project's kinds: skipped-kind out of scope; review and blocked left for the forecast's end", () => {
    const vocab = resolveVocabulary({
      statuses: [
        { id: 'backlog', kind: 'todo' },
        { id: 'doing', kind: 'active' },
        { id: 'awaiting_user', kind: 'review' },
        { id: 'shipped', kind: 'done' },
        { id: 'dropped', kind: 'skipped' },
      ],
    });
    const t = (id: string, status: string, extra: Partial<Task> = {}): Task => ({
      id,
      name: id,
      phase: 0,
      type: 'feature',
      description: '',
      status,
      ...extra,
    });
    const created = { created_at: '2026-04-01T09:00:00Z' };
    const shipped = (id: string, h: number) =>
      t(id, 'shipped', {
        ...created,
        started_at: `2026-04-01T${h}:00:00Z`,
        completed_at: `2026-04-01T${h}:10:00Z`,
      });
    const all = [
      shipped('a', 10),
      shipped('b', 11),
      shipped('c', 12),
      t('d', 'backlog', created),
      t('e', 'awaiting_user', created),
      t('f', 'dropped', created),
    ];
    const b = burndown(all, forecastPhases(all, NOW, all, vocab), NOW, undefined, vocab);
    expect(b.points.at(-1)).toMatchObject({ scope: 5, remaining: 2 });
    expect(b.forecast!.to.remaining).toBe(1);
  });
});
