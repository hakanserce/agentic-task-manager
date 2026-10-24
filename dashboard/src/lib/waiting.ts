// Tasks waiting on someone rather than on agent work (docs/v4/dashboard.md section 3): how long, and what was said.
import { formatMinutes } from './format';
import type { Note, Task } from './types';
import { DEFAULT_VOCABULARY, kindOf, type Vocabulary } from './vocab';

export interface ReviewWait {
  /** When the review was asked for */
  since: number;
  minutes: number;
  /** The note left with the request, if any */
  note?: Note;
}

/** The newest note of `kind`, if any. */
export function latestNote(task: Task, kind: string): Note | undefined {
  return (task.notes ?? []).filter((n) => n.kind === kind).sort((a, b) => b.at.localeCompare(a.at))[0];
}

/**
 * How long a review-kind task has waited, from review_requested_at (else its last update, for tasks set to review by
 * hand); null for other tasks.
 */
export function reviewWait(task: Task, now: number, vocab: Vocabulary = DEFAULT_VOCABULARY): ReviewWait | null {
  if (kindOf(vocab, task.status) !== 'review') return null;
  const since = Date.parse(task.review_requested_at ?? task.updated_at ?? '');
  if (Number.isNaN(since)) return null;
  const note = latestNote(task, 'review');
  return { since, minutes: Math.max(0, (now - since) / 60_000), ...(note ? { note } : {}) };
}

/** "Waiting for review · 2 h 10 m" */
export function reviewSummary(wait: ReviewWait): string {
  return `Waiting for review · ${wait.minutes < 1 ? 'just now' : formatMinutes(wait.minutes)}`;
}
