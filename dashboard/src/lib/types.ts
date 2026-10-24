/** The default statuses; a project may define its own in meta.statuses (see vocab.ts). */
export type KnownStatus = 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done' | 'skipped';
export type Status = KnownStatus | (string & {});

export type KnownTaskType = 'feature' | 'bugfix' | 'bug' | 'test' | 'infra' | 'docs' | 'refactor' | 'polish';
export type TaskType = KnownTaskType | (string & {});

export interface Task {
  id: string;
  name: string;
  phase: number;
  type: TaskType;
  description: string;
  status: Status;
  /** A priority ID from the vocabulary ("P0"…"P3" by default); missing means the default priority */
  priority?: string;
  dependencies?: string[];
  requirements?: string[];
  use_cases?: string[];
  files?: string[];
  /** ISO 8601 UTC */
  created_at?: string;
  /** ISO 8601 UTC */
  updated_at?: string;
  /** ISO 8601 UTC; set when the task moves to in_progress */
  started_at?: string;
  /** ISO 8601 UTC; set when the task moves to done */
  completed_at?: string;
  /** The agent that started the task (written by `atm start`; kept when it is done) */
  agent?: string;
  /** ISO 8601 UTC; when the task asked for a review (`atm review`). Its work ended here; review time isn't work */
  review_requested_at?: string;
  /** Handoffs, outcomes, review requests, answers, rejections (docs/v4/data-model.md §4) */
  notes?: Note[];
}

export interface Note {
  /** ISO 8601 UTC */
  at: string;
  /** Who wrote it */
  by?: string;
  /** handoff, outcome, review, rejection, failure, answer or note */
  kind: string;
  text: string;
}

export interface TasksFile {
  meta?: {
    project?: string;
    id?: string;
    created?: string;
    description?: string;
    lease_minutes?: number;
    // Project vocabularies (docs/v4/data-model.md §2); validated by vocab.ts, so typed loosely here
    statuses?: unknown;
    phases?: unknown;
    types?: unknown;
    priorities?: unknown;
    default_priority?: unknown;
    workflow?: unknown;
  };
  tasks?: Task[];
}
