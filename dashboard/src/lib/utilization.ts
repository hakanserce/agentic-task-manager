// Agent utilisation: how much of the calendar time agents spent working on tasks. Work is each task's work (work.ts:
// started_at until completed or handed over for review, to now while active), per agent; parallel agents add up, so
// the total can exceed 100%. Two bases: every hour of every day (24/7), and an 8-hour working day on weekdays only.
import type { ClaimMap } from './claims';
import type { Task } from './types';
import { UNATTRIBUTED } from './agents';
import { DEFAULT_VOCABULARY, type Vocabulary } from './vocab';
import { ms, startedBy, workSpan } from './work';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const WORKDAY_HOURS = 8;

export interface AgentUtilization {
  agent: string;
  workMs: number;
  /** Work / calendar time, 24 hours a day */
  daily: number;
  /** Work / working time, 8 hours a day, Monday to Friday */
  workday: number;
}

export interface Utilization {
  start: number;
  end: number;
  workMs: number;
  /** Calendar time of the period, and its working time (8 h per weekday) */
  calendarMs: number;
  workdayMs: number;
  daily: number;
  workday: number;
  /** Busiest agent first */
  agents: AgentUtilization[];
}

/** Working time between `start` and `end`: 8 of every 24 hours on Monday to Friday (local time), pro rata. */
export function workdayTime(start: number, end: number): number {
  let total = 0;
  const day = new Date(start);
  day.setHours(0, 0, 0, 0);
  for (let d = day.getTime(); d < end;) {
    const next = new Date(d);
    next.setDate(next.getDate() + 1); // DST-safe: the next local midnight
    const weekday = new Date(d).getDay();
    if (weekday !== 0 && weekday !== 6) {
      const overlap = Math.min(end, next.getTime()) - Math.max(start, d);
      total += (Math.max(0, overlap) / (next.getTime() - d)) * WORKDAY_HOURS * HOUR;
    }
    d = next.getTime();
  }
  return total;
}

/**
 * Utilisation of the `tasks`' work over the period from the first start in `periodTasks` (default: the same tasks)
 * to `now`; null when no task has been started.
 */
export function utilization(
  tasks: Task[],
  claims: ClaimMap,
  now: number,
  periodTasks: Task[] = tasks,
  vocab: Vocabulary = DEFAULT_VOCABULARY,
): Utilization | null {
  const starts = periodTasks.map((t) => ms(t.started_at)).filter((t): t is number => t !== null);
  if (starts.length === 0) return null;
  const start = Math.min(...starts);
  const end = Math.max(now, start + 1);

  const byAgent = new Map<string, number>();
  for (const t of tasks) {
    const span = workSpan(t, now, vocab);
    if (!span || span.end <= span.start) continue;
    const agent = (span.live ? claims.get(t.id)?.agent : undefined) ?? startedBy(t) ?? UNATTRIBUTED;
    byAgent.set(agent, (byAgent.get(agent) ?? 0) + (span.end - span.start));
  }

  const calendarMs = end - start;
  const workdayMs = workdayTime(start, end);
  const ratio = (work: number, base: number) => (base > 0 ? work / base : 0);
  const agents = [...byAgent]
    .map(([agent, workMs]) => ({
      agent,
      workMs,
      daily: ratio(workMs, calendarMs),
      workday: ratio(workMs, workdayMs),
    }))
    .sort((a, b) => b.workMs - a.workMs || a.agent.localeCompare(b.agent));
  const workMs = agents.reduce((n, a) => n + a.workMs, 0);
  return {
    start,
    end,
    workMs,
    calendarMs,
    workdayMs,
    daily: ratio(workMs, calendarMs),
    workday: ratio(workMs, workdayMs),
    agents,
  };
}

/** Calendar days in a duration, for labels ("over 3.5 days") */
export const days = (msSpan: number) => msSpan / DAY;
