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
  return `Waiting for review · ${since(wait.minutes)}`;
}

const since = (minutes: number) => (minutes < 1 ? 'just now' : formatMinutes(minutes));

export interface BlockWait {
  /** Who decides: the user, an agent, or nobody said (a task set to blocked by hand) */
  on: 'user' | 'agent' | null;
  /** Minutes since blocked_at, when known */
  minutes: number | null;
  /** The open questions */
  questions: string[];
}

/**
 * What a blocked-kind task waits on (`atm block`); null for other tasks, and for a task blocked by hand with nothing
 * more to say (its status badge already says Blocked).
 */
export function blockWait(task: Task, now: number, vocab: Vocabulary = DEFAULT_VOCABULARY): BlockWait | null {
  if (kindOf(vocab, task.status) !== 'blocked') return null;
  const on = task.waiting_on === 'user' || task.waiting_on === 'agent' ? task.waiting_on : null;
  const at = Date.parse(task.blocked_at ?? '');
  const minutes = Number.isNaN(at) ? null : Math.max(0, (now - at) / 60_000);
  const questions = Array.isArray(task.questions) ? task.questions.filter((q) => typeof q === 'string') : [];
  if (on === null && minutes === null && questions.length === 0) return null;
  return { on, minutes, questions };
}

/** "Waiting on you · 2 h · 2 questions"; "Blocked · 3 d" for a task blocked by hand */
export function blockSummary(wait: BlockWait): string {
  const parts = [wait.on === 'user' ? 'Waiting on you' : wait.on === 'agent' ? 'Waiting on an agent' : 'Blocked'];
  if (wait.minutes !== null) parts.push(since(wait.minutes));
  const n = wait.questions.length;
  if (n) parts.push(`${n} question${n === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

/** Tasks that need the user (D-3.3): in review, or blocked waiting on the user. */
export function needingUser(tasks: Task[], vocab: Vocabulary = DEFAULT_VOCABULARY): Task[] {
  return tasks.filter((t) => {
    const kind = kindOf(vocab, t.status);
    return kind === 'review' || (kind === 'blocked' && t.waiting_on === 'user');
  });
}
