// Completion estimates (docs/dashboard-v2-requirements.md, section 3). Agent work is bursty, so the model measures
// working time per task instead of calendar throughput, and accumulates remaining work in the loop's phase order.
import { completedAt } from './timeline';
import type { Task } from './types';

/** A gap between completions longer than this is idle time, not work. */
export const GAP_CAP_MINUTES = 30;
/** Pace is based on this many most recent completions. */
export const HISTORY = 10;
/** Below this many timed completions there is no estimate. */
export const MIN_HISTORY = 3;

const MINUTE = 60_000;

export interface TimedCompletion {
  id: string;
  completedAt: number;
  minutes: number;
}

export interface Pace {
  /** Minutes per task */
  likely: number;
  low: number;
  high: number;
  basedOn: number;
}

export interface Estimate {
  /** Working minutes until the phase is done */
  minutes: { likely: number; low: number; high: number };
  /** Calendar time if the loop keeps running from `now` */
  finishAt: { likely: number; low: number; high: number };
}

export type PhaseState = 'done' | 'in_progress' | 'not_started';

export interface PhaseForecast {
  phase: number;
  total: number;
  done: number;
  /** Unfinished tasks in this phase (todo, in progress, unknown statuses); blocked and skipped excluded */
  remaining: number;
  blocked: number;
  state: PhaseState;
  /** Last completion, for finished phases */
  completedAt?: number;
  /** Absent when the phase is done, nothing is left to work on, or there is too little history */
  estimate?: Estimate;
}

export interface Forecast {
  pace: Pace | null;
  phases: PhaseForecast[];
}

const time = (iso: string | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? undefined : t;
};

/**
 * Duration of each completed task, oldest first: completed_at − started_at when known, otherwise the gap since the
 * previous completion, capped. The first completion without a start has nothing to measure from and is left out.
 */
export function taskDurations(tasks: Task[]): TimedCompletion[] {
  const finished = tasks
    .filter((t) => t.status === 'done')
    .map((t) => ({ task: t, end: time(completedAt(t)) }))
    .filter((x): x is { task: Task; end: number } => x.end !== undefined)
    .sort((a, b) => a.end - b.end);

  const result: TimedCompletion[] = [];
  finished.forEach(({ task, end }, i) => {
    const start = time(task.started_at);
    let minutes: number | undefined;
    if (start !== undefined && start <= end) minutes = (end - start) / MINUTE;
    else if (i > 0) minutes = Math.min((end - finished[i - 1].end) / MINUTE, GAP_CAP_MINUTES);
    if (minutes !== undefined) result.push({ id: task.id, completedAt: end, minutes });
  });
  return result;
}

/** Linear interpolation between closest ranks (p in 0..1) over a sorted array. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const rank = p * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

export function pace(durations: TimedCompletion[]): Pace | null {
  const recent = durations.slice(-HISTORY).map((d) => d.minutes);
  if (recent.length < MIN_HISTORY) return null;
  const sorted = [...recent].sort((a, b) => a - b);
  return {
    likely: percentile(sorted, 0.5),
    low: percentile(sorted, 0.25),
    high: percentile(sorted, 0.75),
    basedOn: recent.length,
  };
}

const UNFINISHED_EXCLUDED = new Set(['done', 'skipped', 'blocked']);

/** Per-phase progress and estimates; phases are worked in ascending order, like /atm:loop-tasks. */
export function forecastPhases(tasks: Task[], now: number): Forecast {
  const p = pace(taskDurations(tasks));
  const phases = [...new Set(tasks.map((t) => t.phase))].sort((a, b) => a - b);
  let cumulative = 0;

  return {
    pace: p,
    phases: phases.map((phase) => {
      const inPhase = tasks.filter((t) => t.phase === phase);
      const done = inPhase.filter((t) => t.status === 'done');
      const remaining = inPhase.filter((t) => !UNFINISHED_EXCLUDED.has(t.status)).length;
      const blocked = inPhase.filter((t) => t.status === 'blocked').length;
      cumulative += remaining;

      const finished = inPhase.every((t) => t.status === 'done' || t.status === 'skipped');
      // Started once something moved: done, in progress or an unknown status. Blocked work hasn't begun.
      const started = inPhase.some((t) => !['todo', 'skipped', 'blocked'].includes(t.status));
      const state: PhaseState = finished ? 'done' : started ? 'in_progress' : 'not_started';

      const result: PhaseForecast = { phase, total: inPhase.length, done: done.length, remaining, blocked, state };
      if (finished) {
        const ends = done.map((t) => time(completedAt(t))).filter((t): t is number => t !== undefined);
        if (ends.length) result.completedAt = Math.max(...ends);
      } else if (p && remaining > 0) {
        const minutes = { likely: cumulative * p.likely, low: cumulative * p.low, high: cumulative * p.high };
        result.estimate = {
          minutes,
          finishAt: {
            likely: now + minutes.likely * MINUTE,
            low: now + minutes.low * MINUTE,
            high: now + minutes.high * MINUTE,
          },
        };
      }
      return result;
    }),
  };
}
