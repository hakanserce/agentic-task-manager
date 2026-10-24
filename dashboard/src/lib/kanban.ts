import type { Task } from './types';
import { DEFAULT_VOCABULARY, kindOf, type StatusKind, type Vocabulary } from './vocab';

/** A column per status of the vocabulary, plus "other" for statuses nobody defines. */
export type ColumnId = string;
export const OTHER_COLUMN = 'other';

export type Readiness = { ready: true } | { ready: false; waitingOn: string[] };

export interface KanbanCard {
  task: Task;
  /** Only for todo-kind tasks */
  readiness?: Readiness;
  /** The task /atm:loop-tasks would pick next */
  nextUp: boolean;
}

export interface KanbanColumn {
  id: ColumnId;
  label: string;
  /** undefined for the Other column */
  kind: StatusKind | undefined;
  cards: KanbanCard[];
}

export interface BoardOptions {
  showSkipped: boolean;
  /** The dashboard's status filter; empty means all statuses */
  statusFilter: ReadonlySet<string>;
  /** The project's vocabularies; the defaults when absent */
  vocab?: Vocabulary;
}

const byId = (a: Task, b: Task) => a.id.localeCompare(b.id, undefined, { numeric: true });
const byPhaseThenId = (a: Task, b: Task) => a.phase - b.phase || byId(a, b);
const time = (iso: string | undefined) => (iso ? Date.parse(iso) || 0 : 0);
const newestFirst = (when: (t: Task) => string | undefined) => (a: Task, b: Task) =>
  time(when(b)) - time(when(a)) || byId(a, b);

/** Ready if every dependency is done (a done-kind status); dependencies on tasks that don't exist count as unfinished. */
export function readiness(task: Task, taskMap: ReadonlyMap<string, Task>, vocab = DEFAULT_VOCABULARY): Readiness {
  const waitingOn = (task.dependencies ?? []).filter((d) => {
    const dep = taskMap.get(d);
    return !dep || kindOf(vocab, dep.status) !== 'done';
  });
  return waitingOn.length ? { ready: false, waitingOn } : { ready: true };
}

/**
 * The task /atm:loop-tasks picks next (its "FIND the next available task" rule): a todo-kind status, all dependencies
 * done, lowest phase first, then lowest task ID. Uses all tasks, not just the filtered ones.
 */
export function nextUp(allTasks: Task[], vocab = DEFAULT_VOCABULARY): Task | undefined {
  const taskMap = new Map(allTasks.map((t) => [t.id, t]));
  return allTasks
    .filter((t) => kindOf(vocab, t.status) === 'todo' && readiness(t, taskMap, vocab).ready)
    .sort(byPhaseThenId)[0];
}

const ORDER: Partial<Record<StatusKind, (a: Task, b: Task) => number>> = {
  // todo: ready-first is applied on top, see buildBoard
  active: newestFirst((t) => t.started_at ?? t.updated_at),
  done: newestFirst((t) => t.completed_at ?? t.updated_at),
};

/**
 * Columns for the visible (filtered) tasks, in the vocabulary's status order; readiness and next-up are judged
 * against all tasks. `columns` forces a column set (used to keep swimlanes aligned).
 */
export function buildBoard(
  tasks: Task[],
  allTasks: Task[],
  { showSkipped, statusFilter, vocab = DEFAULT_VOCABULARY }: BoardOptions,
  columns?: ColumnId[],
): KanbanColumn[] {
  const taskMap = new Map(allTasks.map((t) => [t.id, t]));
  const next = nextUp(allTasks, vocab)?.id;
  const known = new Map(vocab.statuses.map((s) => [s.id, s]));
  const columnOf = (status: string) => (known.has(status) ? status : OTHER_COLUMN);
  const grouped = new Map<ColumnId, Task[]>();
  for (const t of tasks) grouped.set(columnOf(t.status), [...(grouped.get(columnOf(t.status)) ?? []), t]);

  const filtered = statusFilter.size > 0;
  const wanted = (id: ColumnId): boolean => {
    if (id === OTHER_COLUMN) return (grouped.get(OTHER_COLUMN) ?? []).length > 0;
    if (filtered) return statusFilter.has(id);
    return known.get(id)!.kind !== 'skipped' || showSkipped;
  };

  const ids = columns ?? [...vocab.statuses.map((s) => s.id), OTHER_COLUMN].filter(wanted);
  return ids.map((id) => {
    const def = known.get(id);
    const kind = def?.kind;
    const cards = (grouped.get(id) ?? []).map((task) => ({
      task,
      ...(kind === 'todo' ? { readiness: readiness(task, taskMap, vocab) } : {}),
      nextUp: task.id === next,
    }));
    const order = (kind && ORDER[kind]) ?? byPhaseThenId;
    cards.sort((a, b) => {
      if (kind === 'todo') {
        const ready = Number(b.readiness!.ready) - Number(a.readiness!.ready);
        if (ready) return ready;
      }
      return order(a.task, b.task);
    });
    return { id, label: def?.label ?? 'Other', kind, cards };
  });
}

export interface KanbanLane {
  phase: number;
  done: number;
  total: number;
  columns: KanbanColumn[];
}

/** One swimlane per phase (FR-3.7), all with the same columns as the ungrouped board so they line up. */
export function buildLanes(tasks: Task[], allTasks: Task[], options: BoardOptions): KanbanLane[] {
  const vocab = options.vocab ?? DEFAULT_VOCABULARY;
  const columns = buildBoard(tasks, allTasks, options).map((c) => c.id);
  const phases = [...new Set(tasks.map((t) => t.phase))].sort((a, b) => a - b);
  return phases.map((phase) => {
    const inPhase = tasks.filter((t) => t.phase === phase);
    return {
      phase,
      done: inPhase.filter((t) => kindOf(vocab, t.status) === 'done').length,
      total: inPhase.length,
      columns: buildBoard(inPhase, allTasks, options, columns),
    };
  });
}
