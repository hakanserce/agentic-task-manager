// Review modes and states (docs/sprints-and-releases-design.md SR-2.6, SR-6.1): how a task is reviewed, as atm
// decides it, and the words the cards and the detail panel use.
import type { Task, TasksFile } from './types';

export const REVIEW_MODES = ['blocker', 'async', 'batch', 'none'] as const;
export type ReviewMode = (typeof REVIEW_MODES)[number];

const isMode = (v: unknown): v is ReviewMode => REVIEW_MODES.includes(v as ReviewMode);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** A task's review mode: its own, else its first component's that has one, else the project's, else none */
export function effectiveReview(meta: TasksFile['meta'], task: Task): ReviewMode {
  if (isMode(task.review)) return task.review;
  const components = isRecord(meta) && Array.isArray(meta.components) ? meta.components.filter(isRecord) : [];
  for (const id of task.components ?? []) {
    const mode = components.find((c) => c.id === id)?.review;
    if (isMode(mode)) return mode;
  }
  return isRecord(meta) && isMode(meta.review) ? meta.review : 'none';
}

/** The review state as a short label: "Changes requested", "Approved", "Waiting for review" */
export const REVIEW_STATE_LABELS: Record<string, string> = {
  waiting: 'Waiting for review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
};
