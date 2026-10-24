// Numbers behind the Progress and Activity widgets in the top bar: completion shares (overall, per phase, per type)
// and activity over time (completions, cumulative done vs scope, cycle time, work in progress).
import { completedAt, completions, type Completion } from './timeline';
import type { Task } from './types';

export interface Share {
  key: string;
  label: string;
  done: number;
  total: number;
  /** done / total, 0–1 (0 when there are no tasks) */
  ratio: number;
}

export interface StatusCount {
  status: string;
  count: number;
}

export interface ProgressBreakdown {
  overall: Share;
  byStatus: StatusCount[];
  byPhase: Share[];
  byType: Share[];
}

const STATUS_ORDER = ['done', 'in_progress', 'todo', 'blocked', 'skipped'];

function share(key: string, label: string, tasks: Task[]): Share {
  const done = tasks.filter((t) => t.status === 'done').length;
  return { key, label, done, total: tasks.length, ratio: tasks.length ? done / tasks.length : 0 };
}

function groupBy<K>(tasks: Task[], key: (t: Task) => K): Map<K, Task[]> {
  const groups = new Map<K, Task[]>();
  for (const t of tasks) groups.set(key(t), [...(groups.get(key(t)) ?? []), t]);
  return groups;
}

export function progressBreakdown(tasks: Task[]): ProgressBreakdown {
  const statusCounts = groupBy(tasks, (t) => t.status);
  const rank = (s: string) => (STATUS_ORDER.includes(s) ? STATUS_ORDER.indexOf(s) : STATUS_ORDER.length);
  return {
    overall: share('all', 'All tasks', tasks),
    byStatus: [...statusCounts]
      .map(([status, list]) => ({ status, count: list.length }))
      .sort((a, b) => rank(a.status) - rank(b.status) || a.status.localeCompare(b.status)),
    byPhase: [...groupBy(tasks, (t) => t.phase)]
      .sort(([a], [b]) => a - b)
      .map(([phase, list]) => share(String(phase), `Phase ${phase}`, list)),
    byType: [...groupBy(tasks, (t) => t.type)]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([type, list]) => share(type, type, list)),
  };
}

// ---- activity over time ----

export interface ActivityBucket {
  start: number;
  end: number;
  completed: Completion[];
  /** Completions per task type in this bucket */
  byType: Record<string, number>;
  /** Mean completions per bucket over this and the two before it */
  average: number;
  /** Tasks done by the end of the bucket */
  cumulativeDone: number;
  /** Tasks that existed by the end of the bucket (created_at, else always) */
  scope: number;
  /** Tasks in progress at the end of the bucket (from started_at to completed_at) */
  wip: number;
}

export interface CycleTime {
  id: string;
  name: string;
  /** When it was completed (ms) */
  time: number;
  minutes: number;
}

export interface ActivitySeries {
  /** Bucket length, e.g. "1 hour", "1 day" */
  unitLabel: string;
  bucketMs: number;
  buckets: ActivityBucket[];
  cycleTimes: CycleTime[];
  medianCycleMinutes: number | null;
  totalCompleted: number;
  /** Task types that have completions, most completed first */
  types: { type: string; count: number }[];
}

const HOUR = 3_600_000;
const BUCKET_SIZES: [number, string][] = [
  [HOUR, '1 hour'],
  [3 * HOUR, '3 hours'],
  [6 * HOUR, '6 hours'],
  [12 * HOUR, '12 hours'],
  [24 * HOUR, '1 day'],
  [2 * 24 * HOUR, '2 days'],
  [7 * 24 * HOUR, '1 week'],
  [30 * 24 * HOUR, '30 days'],
];
export const MAX_ACTIVITY_BUCKETS = 36;

const ms = (iso: string | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? null : t;
};

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Activity bucketed by the smallest of a few natural lengths that fits the time span; null without completions. */
export function activitySeries(tasks: Task[]): ActivitySeries | null {
  const done = completions(tasks);
  if (done.length === 0) return null;
  const starts = tasks.map((t) => ms(t.started_at)).filter((t): t is number => t !== null);
  const first = Math.min(done[0].time, ...starts);
  const last = Math.max(done[done.length - 1].time, ...starts);

  const [bucketMs, unitLabel] =
    BUCKET_SIZES.find(([size]) => (last - first) / size < MAX_ACTIVITY_BUCKETS) ??
    BUCKET_SIZES[BUCKET_SIZES.length - 1];
  // Align buckets to local time (midnight for days)
  const offset = new Date(first).getTimezoneOffset() * 60_000;
  const origin = Math.floor((first - offset) / bucketMs) * bucketMs + offset;
  const count = Math.floor((last - origin) / bucketMs) + 1;

  const typeOf = new Map(tasks.map((t) => [t.id, t.type]));
  const buckets: ActivityBucket[] = [];
  for (let i = 0; i < count; i++) {
    const start = origin + i * bucketMs;
    const end = start + bucketMs;
    const completed = done.filter((c) => c.time >= start && c.time < end);
    const recent = [...buckets.slice(-2).map((b) => b.completed.length), completed.length];
    const byType: Record<string, number> = {};
    for (const c of completed) byType[typeOf.get(c.id) ?? '?'] = (byType[typeOf.get(c.id) ?? '?'] ?? 0) + 1;
    buckets.push({
      start,
      end,
      completed,
      byType,
      average: recent.reduce((a, b) => a + b, 0) / recent.length,
      cumulativeDone: done.filter((c) => c.time < end).length,
      scope: tasks.filter((t) => (ms(t.created_at) ?? -Infinity) < end).length,
      wip: tasks.filter((t) => {
        const s = ms(t.started_at);
        if (s === null || s >= end) return false;
        const c = t.status === 'done' ? ms(completedAt(t)) : null;
        return c === null ? t.status === 'in_progress' : c >= end;
      }).length,
    });
  }

  const cycleTimes: CycleTime[] = tasks
    .filter((t) => t.status === 'done')
    .map((t) => ({ t, s: ms(t.started_at), c: ms(t.completed_at) }))
    .filter(({ s, c }) => s !== null && c !== null && c >= s)
    .map(({ t, s, c }) => ({ id: t.id, name: t.name, time: c!, minutes: (c! - s!) / 60_000 }))
    .sort((a, b) => a.time - b.time);

  const typeTotals = new Map<string, number>();
  for (const c of done) typeTotals.set(typeOf.get(c.id) ?? '?', (typeTotals.get(typeOf.get(c.id) ?? '?') ?? 0) + 1);
  return {
    types: [...typeTotals]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    unitLabel,
    bucketMs,
    buckets,
    cycleTimes,
    medianCycleMinutes: median(cycleTimes.map((c) => c.minutes)),
    totalCompleted: done.length,
  };
}
