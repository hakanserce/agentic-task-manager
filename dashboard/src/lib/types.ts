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
