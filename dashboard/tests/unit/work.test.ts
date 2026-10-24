import { describe, expect, it } from 'vitest';
import type { Task } from '../../src/lib/types';
import { resolveVocabulary } from '../../src/lib/vocab';
import { isDone, workSpan } from '../../src/lib/work';

const H = 3_600_000;
const T0 = Date.parse('2026-04-01T08:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
const task = (status: string, fields: Partial<Task> = {}): Task => ({
  id: 'T-1',
  name: 'x',
  phase: 0,
  type: 'feature',
  description: '',
  status,
  started_at: iso(T0),
  ...fields,
});
const NOW = T0 + 10 * H;

describe('workSpan', () => {
  it('runs from start to completion for a done task, and to now while active', () => {
    expect(workSpan(task('done', { completed_at: iso(T0 + 2 * H) }), NOW)).toEqual({
      start: T0,
      end: T0 + 2 * H,
      live: false,
    });
    expect(workSpan(task('in_progress'), NOW)).toEqual({ start: T0, end: NOW, live: true });
  });

  it('ends when the task asked for a review: the review is not work', () => {
    const reviewed = { review_requested_at: iso(T0 + H), completed_at: iso(T0 + 5 * H) };
    expect(workSpan(task('done', reviewed), NOW)).toEqual({ start: T0, end: T0 + H, live: false });
    expect(workSpan(task('in_review', { review_requested_at: iso(T0 + H) }), NOW)).toEqual({
      start: T0,
      end: T0 + H,
      live: false,
    });
    // An in-review task without the timestamp falls back to its last update
    expect(workSpan(task('in_review', { updated_at: iso(T0 + 3 * H) }), NOW)?.end).toBe(T0 + 3 * H);
  });

  it('holds no work when not started, or todo, blocked, skipped or unknown', () => {
    expect(workSpan(task('done', { started_at: undefined }), NOW)).toBeNull();
    for (const status of ['todo', 'blocked', 'skipped', 'weird']) expect(workSpan(task(status), NOW)).toBeNull();
  });

  it('gives a finished task without a known end a zero-length span', () => {
    expect(workSpan(task('done'), NOW)).toEqual({ start: T0, end: T0, live: false });
  });

  it("follows a project's statuses by kind", () => {
    const vocab = resolveVocabulary({
      statuses: [
        { id: 'backlog', kind: 'todo' },
        { id: 'doing', kind: 'active' },
        { id: 'shipped', kind: 'done' },
      ],
    });
    expect(workSpan(task('doing'), NOW, vocab)?.live).toBe(true);
    expect(workSpan(task('shipped', { completed_at: iso(T0 + H) }), NOW, vocab)?.end).toBe(T0 + H);
    expect(isDone(task('shipped'), vocab)).toBe(true);
    expect(isDone(task('shipped'))).toBe(false);
  });
});
