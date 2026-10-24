// Who did what, when: one lane per agent with a bar per task, from start to completion (or to now while in
// progress). The agent comes from the task (written by `atm start`) or, for work in progress, from its live claim.
import type { ClaimMap } from './claims';
import { median } from './insights';
import type { Task } from './types';

export const UNATTRIBUTED = '';

export interface AgentBar {
  task: Task;
  start: number;
  end: number;
  /** Still in progress: the bar runs to now */
  live: boolean;
}

export interface AgentLane {
  /** The agent's identity, or UNATTRIBUTED for tasks from before agents were recorded */
  agent: string;
  bars: AgentBar[];
  /** Whether any of its tasks matches the search and filters */
  matches: boolean;
  done: number;
  medianMinutes: number | null;
  /** Tasks the agent is working on now */
  current: Task[];
  /** When the agent last started or finished something */
  lastActive: number;
}

export interface AgentTimeline {
  start: number;
  end: number;
  lanes: AgentLane[];
}

const ms = (iso: string | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? null : t;
};

/**
 * The timeline of all `tasks`. With `matching`, the tasks outside it stay on the timeline (to be greyed out) but the
 * lane stats count only matching tasks.
 */
export function agentTimeline(
  tasks: Task[],
  claims: ClaimMap,
  now: number,
  matching?: ReadonlySet<string>,
): AgentTimeline | null {
  const byAgent = new Map<string, AgentBar[]>();
  for (const task of tasks) {
    const start = ms(task.started_at);
    if (start === null || (task.status !== 'done' && task.status !== 'in_progress')) continue;
    const live = task.status === 'in_progress';
    const end = live ? Math.max(now, start) : (ms(task.completed_at) ?? start);
    const agent = (live ? claims.get(task.id)?.agent : undefined) ?? task.agent ?? UNATTRIBUTED;
    byAgent.set(agent, [...(byAgent.get(agent) ?? []), { task, start, end: Math.max(end, start), live }]);
  }
  if (byAgent.size === 0) return null;

  const lanes: AgentLane[] = [...byAgent].map(([agent, all]) => {
    const bars = matching ? all.filter((b) => matching.has(b.task.id)) : all;
    const finished = bars.filter((b) => !b.live);
    return {
      agent,
      bars: all.sort((a, b) => a.start - b.start),
      matches: bars.length > 0,
      done: finished.length,
      medianMinutes: median(finished.map((b) => (b.end - b.start) / 60_000)),
      current: bars.filter((b) => b.live).map((b) => b.task),
      lastActive: Math.max(...all.map((b) => b.end)),
    };
  });
  // Most recently active first; tasks without an agent last
  lanes.sort(
    (a, b) => Number(a.agent === UNATTRIBUTED) - Number(b.agent === UNATTRIBUTED) || b.lastActive - a.lastActive,
  );
  const all = lanes.flatMap((l) => l.bars);
  return { start: Math.min(...all.map((b) => b.start)), end: Math.max(...all.map((b) => b.end)), lanes };
}

/** About `count` evenly spaced tick times on round minutes, hours or days across [start, end]. */
export function timeTicks(start: number, end: number, count = 6): number[] {
  const span = Math.max(1, end - start);
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440, 2880, 10080].map((m) => m * 60_000);
  const step = steps.find((s) => span / s <= count) ?? steps[steps.length - 1];
  const offset = new Date(start).getTimezoneOffset() * 60_000;
  const first = Math.ceil((start - offset) / step) * step + offset;
  const ticks = [];
  for (let t = first; t <= end; t += step) ticks.push(t);
  return ticks;
}
