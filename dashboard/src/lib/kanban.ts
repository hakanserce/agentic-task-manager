import { KNOWN_STATUSES, type Task } from './types';

export type ColumnId = 'todo' | 'in_progress' | 'blocked' | 'done' | 'skipped' | 'other';

export const COLUMN_LABELS: Record<ColumnId, string> = {
  todo: 'Todo',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
  skipped: 'Skipped',
  other: 'Other',
};

export type Readiness = { ready: true } | { ready: false; waitingOn: string[] };

export interface KanbanCard {
  task: Task;
  /** Only for todo tasks */
  readiness?: Readiness;
  /** The task /atm:loop-tasks would pick next */
  nextUp: boolean;
}

export interface KanbanColumn {
  id: ColumnId;
  label: string;
  cards: KanbanCard[];
}

export interface BoardOptions {
  showSkipped: boolean;
  /** The dashboard's status filter; empty means all statuses */
  statusFilter: ReadonlySet<string>;
}

const byId = (a: Task, b: Task) => a.id.localeCompare(b.id, undefined, { numeric: true });
const byPhaseThenId = (a: Task, b: Task) => a.phase - b.phase || byId(a, b);
const time = (iso: string | undefined) => (iso ? Date.parse(iso) || 0 : 0);
const newestFirst = (when: (t: Task) => string | undefined) => (a: Task, b: Task) =>
  time(when(b)) - time(when(a)) || byId(a, b);

function columnOf(status: string): ColumnId {
  return (KNOWN_STATUSES as readonly string[]).includes(status) ? (status as ColumnId) : 'other';
}

/** Ready if every dependency is done; dependencies on tasks that don't exist count as unfinished. */
export function readiness(task: Task, taskMap: ReadonlyMap<string, Task>): Readiness {
  const waitingOn = (task.dependencies ?? []).filter((d) => taskMap.get(d)?.status !== 'done');
  return waitingOn.length ? { ready: false, waitingOn } : { ready: true };
}

/**
 * The task /atm:loop-tasks picks next (its "FIND the next available task" rule): status todo, all dependencies
 * done, lowest phase first, then lowest task ID. Uses all tasks, not just the filtered ones.
 */
export function nextUp(allTasks: Task[]): Task | undefined {
  const taskMap = new Map(allTasks.map((t) => [t.id, t]));
  return allTasks.filter((t) => t.status === 'todo' && readiness(t, taskMap).ready).sort(byPhaseThenId)[0];
}

const ORDER: Record<ColumnId, (a: Task, b: Task) => number> = {
  todo: byPhaseThenId, // ready-first is applied on top, see buildBoard
  in_progress: newestFirst((t) => t.started_at ?? t.updated_at),
  done: newestFirst((t) => t.completed_at ?? t.updated_at),
  blocked: byPhaseThenId,
  skipped: byPhaseThenId,
  other: byPhaseThenId,
};

/** Columns for the visible (filtered) tasks; readiness and next-up are judged against all tasks. */
export function buildBoard(
  tasks: Task[],
  allTasks: Task[],
  { showSkipped, statusFilter }: BoardOptions,
): KanbanColumn[] {
  const taskMap = new Map(allTasks.map((t) => [t.id, t]));
  const next = nextUp(allTasks)?.id;
  const grouped = new Map<ColumnId, Task[]>();
  for (const t of tasks) grouped.set(columnOf(t.status), [...(grouped.get(columnOf(t.status)) ?? []), t]);

  const filtered = statusFilter.size > 0;
  const wanted = (id: ColumnId): boolean => {
    if (id === 'other') return (grouped.get('other') ?? []).length > 0;
    if (filtered) return statusFilter.has(id);
    return id !== 'skipped' || showSkipped;
  };

  return (['todo', 'in_progress', 'blocked', 'done', 'skipped', 'other'] as ColumnId[]).filter(wanted).map((id) => {
    const cards = (grouped.get(id) ?? []).map((task) => ({
      task,
      ...(id === 'todo' ? { readiness: readiness(task, taskMap) } : {}),
      nextUp: task.id === next,
    }));
    cards.sort((a, b) => {
      if (id === 'todo') {
        const ready = Number(b.readiness!.ready) - Number(a.readiness!.ready);
        if (ready) return ready;
      }
      return ORDER[id](a.task, b.task);
    });
    return { id, label: COLUMN_LABELS[id], cards };
  });
}
