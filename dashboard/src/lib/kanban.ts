import { BACKLOG } from './filters';
import { activeSprint, NO_SPRINTS, type SprintModel } from './sprints';
import type { Task } from './types';
import { DEFAULT_VOCABULARY, kindOf, priorityOf, priorityRank, type StatusKind, type Vocabulary } from './vocab';

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
  /** The dashboard's status filter (empty means all statuses): only shows a skipped-kind column it names */
  statusFilter: ReadonlySet<string>;
  /** The project's vocabularies; the defaults when absent */
  vocab?: Vocabulary;
  /** The project's sprints: Next up is taken from the active one, as `atm next` does */
  sprints?: SprintModel;
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

/** The loop's order: lowest phase first (none counts as 0: a project with sprints has none), then the most urgent
 * priority, then lowest ID (atm next) */
const loopOrder = (vocab: Vocabulary) => (a: Task, b: Task) =>
  (a.phase ?? 0) - (b.phase ?? 0) ||
  priorityRank(vocab, priorityOf(vocab, a)) - priorityRank(vocab, priorityOf(vocab, b)) ||
  byId(a, b);

/**
 * The task /atm:loop-tasks picks next (`atm next` with its default selection): a todo-kind status, all dependencies
 * done, in the loop's order; in a project with sprints, from the active sprint only (none when no sprint is active).
 * Uses all tasks, not just the filtered ones.
 */
export function nextUp(allTasks: Task[], vocab = DEFAULT_VOCABULARY, sprints = NO_SPRINTS): Task | undefined {
  const taskMap = new Map(allTasks.map((t) => [t.id, t]));
  // Phases read as sprints (an unmigrated project) aren't a selection: atm next takes every task there
  const selected = sprints.derived || !sprints.sprints.length ? undefined : (activeSprint(sprints)?.id ?? null);
  if (selected === null) return undefined;
  return allTasks
    .filter(
      (t) =>
        (selected === undefined || sprints.sprintOf(t) === selected) &&
        kindOf(vocab, t.status) === 'todo' &&
        readiness(t, taskMap, vocab).ready,
    )
    .sort(loopOrder(vocab))[0];
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
  { showSkipped, statusFilter, vocab = DEFAULT_VOCABULARY, sprints = NO_SPRINTS }: BoardOptions,
  columns?: ColumnId[],
): KanbanColumn[] {
  const taskMap = new Map(allTasks.map((t) => [t.id, t]));
  const next = nextUp(allTasks, vocab, sprints)?.id;
  const known = new Map(vocab.statuses.map((s) => [s.id, s]));
  const columnOf = (status: string) => (known.has(status) ? status : OTHER_COLUMN);
  const grouped = new Map<ColumnId, Task[]>();
  for (const t of tasks) grouped.set(columnOf(t.status), [...(grouped.get(columnOf(t.status)) ?? []), t]);

  // The columns stay put whatever the filters (a status filter empties columns, it doesn't remove them); a
  // skipped-kind column shows behind its toggle, or when the status filter asks for it
  const wanted = (id: ColumnId): boolean => {
    if (id === OTHER_COLUMN) return (grouped.get(OTHER_COLUMN) ?? []).length > 0;
    return known.get(id)!.kind !== 'skipped' || showSkipped || statusFilter.has(id);
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
    // To Do in the loop's order (ready first, see below), so the column reads like the loop works
    const order = kind === 'todo' ? loopOrder(vocab) : ((kind && ORDER[kind]) ?? byPhaseThenId);
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
  /** The sprint's ID, or BACKLOG */
  key: string;
  /** Its place in the project's sprints (for its colour); -1 for the backlog */
  index: number;
  done: number;
  total: number;
  columns: KanbanColumn[];
}

/** One swimlane per sprint with tasks, in the project's order, the backlog last (FR-3.7, SR-7.3); all with the
 * same columns as the ungrouped board so they line up. */
export function buildLanes(tasks: Task[], allTasks: Task[], options: BoardOptions): KanbanLane[] {
  const vocab = options.vocab ?? DEFAULT_VOCABULARY;
  const model = options.sprints ?? NO_SPRINTS;
  const columns = buildBoard(tasks, allTasks, options).map((c) => c.id);
  const keyOf = (t: Task) => model.sprintOf(t) ?? BACKLOG;
  const present = new Set(tasks.map(keyOf));
  const keys = [...model.sprints.map((s) => s.id), BACKLOG].filter((key) => present.has(key));
  return keys.map((key) => {
    const own = tasks.filter((t) => keyOf(t) === key);
    return {
      key,
      index: model.sprints.findIndex((s) => s.id === key),
      done: own.filter((t) => kindOf(vocab, t.status) === 'done').length,
      total: own.length,
      columns: buildBoard(own, allTasks, options, columns),
    };
  });
}
