import type { Task } from './types';

export interface Completion {
  id: string;
  name: string;
  time: number;
}

export interface TimelineBucket {
  start: number;
  end: number;
  completions: Completion[];
  /** Bar height in px: 0 when empty, otherwise 4–40 relative to the fullest bucket. */
  height: number;
}

export interface Timeline {
  minT: number;
  maxT: number;
  buckets: TimelineBucket[];
}

export const MIN_BUCKETS = 4;
export const MAX_BUCKETS = 16;
const MAX_BAR_HEIGHT = 40;
const MIN_BAR_HEIGHT = 4;

/** When a done task was finished: completed_at, or updated_at for files written before completed_at existed. */
export function completedAt(task: Task): string | undefined {
  return task.completed_at ?? task.updated_at;
}

/** Done tasks with a valid completion time, oldest first. */
export function completions(tasks: Task[]): Completion[] {
  return tasks
    .filter((t) => t.status === 'done' && completedAt(t))
    .map((t) => ({ id: t.id, name: t.name, time: new Date(completedAt(t)!).getTime() }))
    .filter((c) => !isNaN(c.time))
    .sort((a, b) => a.time - b.time);
}

/** Completion activity bucketed over time, or null when there are fewer than two completions. */
export function computeTimeline(tasks: Task[]): Timeline | null {
  const done = completions(tasks);
  if (done.length < 2) return null;

  const minT = done[0].time;
  const maxT = done[done.length - 1].time;
  const count = Math.min(MAX_BUCKETS, Math.max(MIN_BUCKETS, done.length));
  const size = (maxT - minT || 1) / count;

  const groups: Completion[][] = Array.from({ length: count }, () => []);
  for (const c of done) groups[Math.min(count - 1, Math.floor((c.time - minT) / size))].push(c);

  const fullest = Math.max(...groups.map((g) => g.length));
  return {
    minT,
    maxT,
    buckets: groups.map((g, i) => ({
      start: minT + i * size,
      end: minT + (i + 1) * size,
      completions: g,
      height: g.length > 0 ? Math.max(MIN_BAR_HEIGHT, Math.round((g.length / fullest) * MAX_BAR_HEIGHT)) : 0,
    })),
  };
}

/** "Apr 3" in the viewer's locale */
export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "Apr 3 11:00 AM" in the viewer's locale */
export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}
