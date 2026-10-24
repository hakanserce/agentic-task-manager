import { describe, expect, it } from 'vitest';
import type { Task } from '../../src/lib/types';
import { resolveVocabulary } from '../../src/lib/vocab';
import { latestNote, reviewSummary, reviewWait } from '../../src/lib/waiting';

const M = 60_000;
const T0 = Date.parse('2026-04-01T08:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');
const task = (status: string, fields: Partial<Task> = {}): Task => ({
  id: 'T-1',
  name: 'x',
  phase: 0,
  type: 'feature',
  description: '',
  status,
  ...fields,
});

describe('reviewWait', () => {
  it('measures from the review request, with the latest review note', () => {
    const t = task('in_review', {
      review_requested_at: iso(T0),
      notes: [
        { at: iso(T0 - 90 * M), kind: 'review', text: 'first try' },
        { at: iso(T0), by: 'claude:1', kind: 'review', text: 'please check the API names' },
        { at: iso(T0 + M), kind: 'note', text: 'unrelated' },
      ],
    });
    expect(reviewWait(t, T0 + 130 * M)).toEqual({
      since: T0,
      minutes: 130,
      note: { at: iso(T0), by: 'claude:1', kind: 'review', text: 'please check the API names' },
    });
  });

  it('falls back to the last update for a task set to review by hand, and is null for other kinds', () => {
    expect(reviewWait(task('in_review', { updated_at: iso(T0) }), T0 + 5 * M)).toEqual({ since: T0, minutes: 5 });
    expect(reviewWait(task('in_review'), T0)).toBeNull();
    expect(reviewWait(task('in_progress', { review_requested_at: iso(T0) }), T0)).toBeNull();
  });

  it("follows a project's statuses by kind", () => {
    const vocab = resolveVocabulary({
      statuses: [
        { id: 'todo', kind: 'todo' },
        { id: 'doing', kind: 'active' },
        { id: 'awaiting_user', kind: 'review' },
        { id: 'done', kind: 'done' },
      ],
    });
    expect(reviewWait(task('awaiting_user', { review_requested_at: iso(T0) }), T0, vocab)?.minutes).toBe(0);
  });
});

describe('summaries', () => {
  it('says how long', () => {
    expect(reviewSummary({ since: T0, minutes: 130 })).toBe('Waiting for review · 2 h 10 m');
    expect(reviewSummary({ since: T0, minutes: 0.2 })).toBe('Waiting for review · just now');
  });

  it('finds no note when there is none of that kind', () => {
    expect(latestNote(task('todo'), 'review')).toBeUndefined();
  });
});
