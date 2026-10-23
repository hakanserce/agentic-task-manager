// Burndown series (FR-4.1): remaining tasks and total scope over time, plus a forecast from now to the estimated
// finish. Skipped tasks are not part of the scope; blocked tasks stay "remaining" (they are not done).
import type { Forecast } from './forecast';
import { completedAt } from './timeline';
import type { Task } from './types';

export interface BurndownPoint {
  t: number;
  scope: number;
  remaining: number;
}

export interface BurndownForecast {
  from: { t: number; remaining: number };
  /** Likely finish; `remaining` there is what the estimate doesn't cover (blocked tasks) */
  to: { t: number; remaining: number };
  range: { low: number; high: number };
}

export interface Burndown {
  /** Step series, oldest first; the last point is "now" */
  points: BurndownPoint[];
  forecast?: BurndownForecast;
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

export function burndown(allTasks: Task[], forecast: Forecast, now: number, phase?: number): Burndown {
  const tasks = allTasks.filter((t) => t.status !== 'skipped' && (phase === undefined || t.phase === phase));
  if (tasks.length === 0) return { points: [] };

  const fallback = earliest(allTasks, now);
  const created = tasks.map((t) => time(t.created_at) ?? fallback);
  const completed = tasks.filter((t) => t.status === 'done').map((t) => time(completedAt(t)) ?? fallback);

  const times = [...new Set([...created, ...completed])].filter((t) => t <= now).sort((a, b) => a - b);
  const at = (t: number): BurndownPoint => {
    const scope = created.filter((c) => c <= t).length;
    return { t, scope, remaining: scope - completed.filter((c) => c <= t).length };
  };
  const points = [...times, now].map(at);

  const phases = forecast.phases.filter((p) => p.estimate && (phase === undefined || p.phase === phase));
  const last = phases.at(-1)?.estimate;
  const current = points[points.length - 1];
  const blocked = tasks.filter((t) => t.status === 'blocked').length;
  return {
    points,
    ...(last && current.remaining > blocked
      ? {
          forecast: {
            from: { t: now, remaining: current.remaining },
            to: { t: last.finishAt.likely, remaining: blocked },
            range: { low: last.finishAt.low, high: last.finishAt.high },
          },
        }
      : {}),
  };
}
