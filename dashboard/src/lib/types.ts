/** Statuses the dashboard knows how to style. tasks.json may contain others; they render with fallbacks. */
export const KNOWN_STATUSES = ['todo', 'in_progress', 'done', 'blocked', 'skipped'] as const;
export type KnownStatus = (typeof KNOWN_STATUSES)[number];
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
  meta?: { project?: string; id?: string; created?: string; description?: string; lease_minutes?: number };
  tasks?: Task[];
}
