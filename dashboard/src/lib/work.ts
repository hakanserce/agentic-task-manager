// What counts as agent work (docs/v4/data-model.md DM-4.1, dashboard D-2.2, D-3.4): a task's work runs from
// started_at until it asked for a review or was completed, or until now while an agent works on it. Time in review or
// blocked is not work. Every chart that measures work (agents, utilisation, activity, forecast) uses this.
import type { Task } from './types';
import { DEFAULT_VOCABULARY, kindOf, type Vocabulary } from './vocab';

export interface WorkSpan {
  start: number;
  end: number;
  /** An agent is still working on it (active kind): the span runs to now */
  live: boolean;
}

export const ms = (iso: string | undefined): number | null => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? null : t;
};

export function isDone(task: Task, vocab: Vocabulary = DEFAULT_VOCABULARY): boolean {
  return kindOf(vocab, task.status) === 'done';
}

/**
 * The task's work, or null if it holds none (not started, or todo/blocked/skipped again). A finished task without a
 * known end gets a zero-length span at its start.
 */
export function workSpan(task: Task, now: number, vocab: Vocabulary = DEFAULT_VOCABULARY): WorkSpan | null {
  const start = ms(task.started_at);
  if (start === null) return null;
  const kind = kindOf(vocab, task.status);
  if (kind === 'active') return { start, end: Math.max(now, start), live: true };
  if (kind !== 'done' && kind !== 'review') return null;
  const end = ms(task.review_requested_at) ?? ms(kind === 'done' ? task.completed_at : task.updated_at) ?? start;
  return { start, end: Math.max(end, start), live: false };
}
