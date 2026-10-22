import type { Task } from './types';

export interface Stats {
  total: number;
  done: number;
  inProgress: number;
  todo: number;
  blocked: number;
  /** Rounded percentage of done tasks; 0 when there are none. */
  pct: number;
  /** [type, count] sorted by type name */
  typeCounts: [string, number][];
}

export function computeStats(tasks: Task[]): Stats {
  const count = (status: string) => tasks.filter((t) => t.status === status).length;
  const total = tasks.length;
  const done = count('done');

  const typeCounts = new Map<string, number>();
  for (const t of tasks) typeCounts.set(t.type, (typeCounts.get(t.type) ?? 0) + 1);

  return {
    total,
    done,
    inProgress: count('in_progress'),
    todo: count('todo'),
    blocked: count('blocked'),
    pct: total > 0 ? Math.round((done / total) * 100) : 0,
    typeCounts: [...typeCounts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  };
}
