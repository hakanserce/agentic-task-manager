// The archive notice (D-5.4): the same rule atm-cli uses to suggest `atm archive` (DM-5.3, atm-cli model.py
// archive_hint), so the dashboard and the agents agree on when tasks.json has grown too big.
import type { Task, TasksFile } from './types';
import { DEFAULT_VOCABULARY, kindOf, type Vocabulary } from './vocab';

export interface ArchiveSettings {
  thresholdKb: number;
  thresholdTasks: number;
  keepDays: number;
}

const DEFAULTS: ArchiveSettings = { thresholdKb: 1024, thresholdTasks: 500, keepDays: 14 };

/** meta.archive, with the defaults for what it doesn't set (like atm-cli) */
export function archiveSettings(meta: TasksFile['meta']): ArchiveSettings {
  const given = (typeof meta?.archive === 'object' && meta.archive !== null ? meta.archive : {}) as Record<
    string,
    unknown
  >;
  const num = (key: string, fallback: number) =>
    typeof given[key] === 'number' && (given[key] as number) >= 0 ? (given[key] as number) : fallback;
  return {
    thresholdKb: num('threshold_kb', DEFAULTS.thresholdKb),
    thresholdTasks: num('threshold_tasks', DEFAULTS.thresholdTasks),
    keepDays: num('keep_days', DEFAULTS.keepDays),
  };
}

// When a finished task finished, as atm archive dates it: completed_at (done) or skipped_at (skipped), else updated_at
// for files from before those were written
const finishedAt = (t: Task) => {
  for (const when of [t.completed_at, t.skipped_at, t.updated_at]) {
    const ms = Date.parse(when ?? '');
    if (!Number.isNaN(ms)) return ms;
  }
  return null;
};

/** How many tasks `atm archive` would move: done- and skipped-kind, finished over keep_days ago, not in an open PR */
export function archivableCount(
  tasks: Task[],
  settings: ArchiveSettings,
  now: number,
  vocab: Vocabulary = DEFAULT_VOCABULARY,
): number {
  const recent = now - settings.keepDays * 86_400_000;
  return tasks.filter((t) => {
    const kind = kindOf(vocab, t.status);
    if (kind !== 'done' && kind !== 'skipped') return false;
    if (t.pr && typeof t.pr === 'object' && !t.merged_at) return false;
    const finished = finishedAt(t);
    return finished === null || finished <= recent;
  }).length;
}

function formatSize(bytes: number): string {
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.floor(bytes / 1024)} KB`;
}

/**
 * The footer's notice when tasks.json is over meta.archive.threshold_kb, or has more archivable tasks than
 * threshold_tasks, and there is something to move; null otherwise.
 */
export function archiveNotice(
  tasks: Task[],
  meta: TasksFile['meta'],
  bytes: number,
  now: number,
  vocab: Vocabulary = DEFAULT_VOCABULARY,
): string | null {
  const settings = archiveSettings(meta);
  const movable = archivableCount(tasks, settings, now, vocab);
  if (!movable || (bytes <= settings.thresholdKb * 1024 && movable <= settings.thresholdTasks)) return null;
  return `tasks.json is ${formatSize(bytes)}: \`atm archive\` would move ${movable} finished task${movable === 1 ? '' : 's'} to tasks-archive.json`;
}
