// Burndown series (FR-4.1): remaining tasks and total scope over time, plus a forecast from now to the estimated
// finish. Skipped-kind tasks are not part of the scope; blocked and in-review tasks stay "remaining" (they are not
// done), and the forecast doesn't cover them (they wait on someone, not on agent work).
import type { Forecast } from './forecast';
import { completedAt } from './timeline';
import type { Task } from './types';
import { DEFAULT_VOCABULARY, kindOf, type Vocabulary } from './vocab';

export interface BurndownPoint {
  t: number;
  scope: number;
  remaining: number;
}

export interface BurndownForecast {
  from: { t: number; remaining: number };
  /** Likely finish; `remaining` there is what the estimate doesn't cover (blocked and in-review tasks) */
  to: { t: number; remaining: number };
  range: { low: number; high: number };
}

export interface Burndown {
  /** Step series, oldest first; the last point is "now" */
  points: BurndownPoint[];
  forecast?: BurndownForecast;
  /** No task has any time: there is no timeline to draw yet */
  untimed?: boolean;
}

const time = (iso: string | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? undefined : t;
};

/** Earliest timestamp anywhere in the tasks: the fallback creation time for tasks without created_at. */
function earliest(tasks: Task[], now: number): number {
  const all = tasks.flatMap((t) => [t.created_at, t.updated_at, t.started_at, t.completed_at].map(time));
  const known = all.filter((t): t is number => t !== undefined);
  return known.length ? Math.min(...known) : now;
}

/**
 * The burndown's time range (T-240): since the focused phase, or else the first unfinished one, started (the default:
 * on a long project, all time squeezes the forecast into a sliver), the last 14 days, or all time.
 */
export type BurndownRange = 'phase' | '14d' | 'all';
export const BURNDOWN_RANGES: BurndownRange[] = ['phase', '14d', 'all'];
const DAY = 24 * 60 * 60_000;

/** Where the range starts, or undefined for all time (also when the phase has no times to start from) */
export function rangeStart(
  range: BurndownRange,
  tasks: Task[],
  forecast: Forecast,
  now: number,
  focus?: number,
): number | undefined {
  if (range === 'all') return undefined;
  if (range === '14d') return now - 14 * DAY;
  const phase = focus ?? forecast.phases.find((p) => p.state !== 'done')?.phase;
  const inPhase = tasks.filter((t) => t.phase === phase);
  const starts = inPhase.map((t) => time(t.started_at)).filter((t): t is number => t !== undefined);
  const created = inPhase.map((t) => time(t.created_at)).filter((t): t is number => t !== undefined);
  const from = starts.length ? Math.min(...starts) : created.length ? Math.min(...created) : undefined;
  return from !== undefined && from < now ? from : undefined;
}

export function burndown(
  allTasks: Task[],
  forecast: Forecast,
  now: number,
  phase?: number,
  vocab: Vocabulary = DEFAULT_VOCABULARY,
  from?: number,
): Burndown {
  const kind = (t: Task) => kindOf(vocab, t.status);
  const tasks = allTasks.filter((t) => kind(t) !== 'skipped' && (phase === undefined || t.phase === phase));
  if (tasks.length === 0) return { points: [] };
  const untimed = !allTasks.some((t) =>
    [t.created_at, t.started_at, t.completed_at].some((x) => time(x) !== undefined),
  );

  const fallback = earliest(allTasks, now);
  const created = tasks.map((t) => time(t.created_at) ?? fallback);
  const completed = tasks.filter((t) => kind(t) === 'done').map((t) => time(completedAt(t)) ?? fallback);

  // With a range, the chart starts at `from` with the state then, and shows the changes after it
  const times = [...new Set([...created, ...completed])]
    .filter((t) => t <= now && (from === undefined || t > from))
    .sort((a, b) => a - b);
  const at = (t: number): BurndownPoint => {
    const scope = created.filter((c) => c <= t).length;
    return { t, scope, remaining: scope - completed.filter((c) => c <= t).length };
  };
  const points = [...(from === undefined ? [] : [from]), ...times, now].map(at);

  const phases = forecast.phases.filter((p) => p.estimate && (phase === undefined || p.phase === phase));
  const last = phases.at(-1)?.estimate;
  const current = points[points.length - 1];
  // What the estimate doesn't cover: tasks waiting on someone rather than on agent work
  const waiting = tasks.filter((t) => kind(t) === 'blocked' || kind(t) === 'review').length;
  return {
    points,
    ...(untimed ? { untimed } : {}),
    ...(last && current.remaining > waiting
      ? {
          forecast: {
            from: { t: now, remaining: current.remaining },
            to: { t: last.finishAt.likely, remaining: waiting },
            range: { low: last.finishAt.low, high: last.finishAt.high },
          },
        }
      : {}),
  };
}
