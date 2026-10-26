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
  /** Free-form tags that group tasks across phases and types, e.g. ["spike-2", "ux"] (DM-4.6) */
  labels?: string[];
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
  /** ISO 8601 UTC; set when the task is skipped (atm skip) */
  skipped_at?: string;
  /** Before v4: the agent that started the task. Now started_by (read both: work.ts startedBy) */
  agent?: string;
  /** Who created, last changed, started and completed the task (docs/v4/data-model.md §4.1) */
  created_by?: string;
  updated_by?: string;
  started_by?: string;
  completed_by?: string;
  /** The SHA of the task's commit */
  commit?: string;
  /** The PR that contains the task (`atm pr`): the task is In PR until merged_at (DM-4.3) */
  pr?: { number: number; url?: string };
  /** ISO 8601 UTC; when that PR was merged (`atm merged`) */
  merged_at?: string;
  /** ISO 8601 UTC; when the task asked for a review (`atm review`). Its work ended here; review time isn't work */
  review_requested_at?: string;
  /** A blocked task waits on a decision by the user or by an agent (`atm block --on`) */
  waiting_on?: string;
  /** The open questions of a blocked task */
  questions?: string[];
  /** ISO 8601 UTC; when it was blocked */
  blocked_at?: string;
  /** Handoffs, outcomes, review requests, answers, rejections (docs/v4/data-model.md §4) */
  notes?: Note[];
  /** Before v4: the last failed attempt (now a `failure` note; still read, see notes.ts) */
  last_failure?: { at?: string; reason?: string };
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
    /** The repository's web address (atm repository), for commit and PR links (lib/repo.ts) */
    repository?: string;
    lease_minutes?: number;
    // Project vocabularies (docs/v4/data-model.md §2); validated by vocab.ts, so typed loosely here
    statuses?: unknown;
    phases?: unknown;
    types?: unknown;
    priorities?: unknown;
    default_priority?: unknown;
    labels?: unknown;
    workflow?: unknown;
    /** How many tasks are in tasks-archive.json (written by atm archive / unarchive) */
    archived?: number;
    /** Archive settings: threshold_kb, threshold_tasks, keep_days, auto (docs/v4/data-model.md §5) */
    archive?: unknown;
  };
  tasks?: Task[];
}
