// Completion estimates (docs/dashboard-v2-requirements.md, section 3). Agent work is bursty, so the model measures
// working time per task instead of calendar throughput, and accumulates remaining work in the loop's phase order.
import { completedAt } from './timeline';
import type { Task } from './types';
import { DEFAULT_VOCABULARY, kindOf, type StatusKind, type Vocabulary } from './vocab';

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
  /** Tasks in this phase that still need agent work (todo, active, unknown statuses); not blocked, in review or skipped */
  remaining: number;
  blocked: number;
  /** Unfinished, but waiting for a reviewer rather than for agent work */
  inReview: number;
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
 * Duration of each completed task, oldest first: its work, started_at until it asked for a review or was completed,
 * when known; otherwise the gap since the previous completion, capped. The first completion without a start has
 * nothing to measure from and is left out.
 */
export function taskDurations(tasks: Task[], vocab: Vocabulary = DEFAULT_VOCABULARY): TimedCompletion[] {
  const finished = tasks
    .filter((t) => kindOf(vocab, t.status) === 'done')
    .map((t) => ({ task: t, end: time(completedAt(t)) }))
    .filter((x): x is { task: Task; end: number } => x.end !== undefined)
    .sort((a, b) => a.end - b.end);

  const result: TimedCompletion[] = [];
  finished.forEach(({ task, end }, i) => {
    const start = time(task.started_at);
    const workEnd = time(task.review_requested_at) ?? end;
    let minutes: number | undefined;
    if (start !== undefined && start <= workEnd) minutes = (workEnd - start) / MINUTE;
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

/** Kinds that need no more agent work: finished, or waiting on someone else */
const NO_AGENT_WORK = new Set<StatusKind | undefined>(['done', 'skipped', 'blocked', 'review']);

/**
 * Per-phase progress and estimates; phases are worked in ascending order, like /atm:loop-tasks.
 * `history` is what the pace is measured on (all tasks), so filtering the view doesn't change the pace.
 */
export function forecastPhases(
  tasks: Task[],
  now: number,
  history: Task[] = tasks,
  vocab: Vocabulary = DEFAULT_VOCABULARY,
): Forecast {
  const p = pace(taskDurations(history, vocab));
  const phases = [...new Set(tasks.map((t) => t.phase))].sort((a, b) => a - b);
  const kind = (t: Task) => kindOf(vocab, t.status);
  let cumulative = 0;

  return {
    pace: p,
    phases: phases.map((phase) => {
      const inPhase = tasks.filter((t) => t.phase === phase);
      const done = inPhase.filter((t) => kind(t) === 'done');
      const remaining = inPhase.filter((t) => !NO_AGENT_WORK.has(kind(t))).length;
      const blocked = inPhase.filter((t) => kind(t) === 'blocked').length;
      const inReview = inPhase.filter((t) => kind(t) === 'review').length;
      cumulative += remaining;

      const finished = inPhase.every((t) => kind(t) === 'done' || kind(t) === 'skipped');
      // Started once something moved: done, active, in review or an unknown status. Blocked work hasn't begun.
      const started = inPhase.some((t) => !['todo', 'skipped', 'blocked'].includes(kind(t) ?? 'unknown'));
      const state: PhaseState = finished ? 'done' : started ? 'in_progress' : 'not_started';

      const result: PhaseForecast = {
        phase,
        total: inPhase.length,
        done: done.length,
        remaining,
        blocked,
        inReview,
        state,
      };
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

export const DEFAULT_ACTIVE_DAYS = 7;

/**
 * The phases worth showing with "Active phases only": every unfinished phase, and a finished one whose last
 * completion is within the last `days` days. A finished phase without completion times is left out.
 */
export function activePhases(phases: PhaseForecast[], now: number, days = DEFAULT_ACTIVE_DAYS): PhaseForecast[] {
  const since = now - days * 86_400_000;
  return phases.filter((p) => p.state !== 'done' || (p.completedAt !== undefined && p.completedAt >= since));
}
