import type { Task } from './types';

export interface Completion {
  id: string;
  name: string;
  time: number;
}

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
