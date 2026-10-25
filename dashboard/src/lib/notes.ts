// A task's notes for the detail panel (D-4.1): handoffs, outcomes, review requests, answers, rejections, failures.
import type { Note, Task } from './types';

/** How each kind of note is introduced */
export const NOTE_KIND_LABELS: Record<string, string> = {
  handoff: 'Handoff',
  outcome: 'Outcome',
  review: 'Review request',
  rejection: 'Rejected',
  failure: 'Failure',
  answer: 'Answers',
  note: 'Note',
};

export function noteKindLabel(kind: string): string {
  return NOTE_KIND_LABELS[kind] ?? kind;
}

/**
 * The task's notes, newest first. A legacy `last_failure` ({at, reason}, written before notes existed) shows as a
 * failure note, unless a failure note at the same time already says so.
 */
export function taskNotes(task: Task): Note[] {
  const notes = (Array.isArray(task.notes) ? task.notes : []).filter(
    (n): n is Note => typeof n === 'object' && n !== null && typeof n.text === 'string',
  );
  const legacy = task.last_failure;
  if (legacy && typeof legacy.reason === 'string' && !notes.some((n) => n.kind === 'failure' && n.at === legacy.at)) {
    notes.push({ at: legacy.at ?? '', kind: 'failure', text: legacy.reason });
  }
  return notes.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
}

/** The first 7 characters of a commit SHA, as git shows it */
export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}
