import { shortAgent } from './claims';
import { STAGE_LABELS, STAGES, stageOf, type Stage } from './stages';
import type { Task } from './types';
import { startedBy } from './work';
import {
  DEFAULT_VOCABULARY,
  labelOrder,
  labelsOf,
  labelText,
  priorityLabel,
  priorityOf,
  priorityRank,
  statusLabel,
  statusRank,
  typeLabel,
  type Vocabulary,
} from './vocab';

export type FilterGroup = 'phase' | 'type' | 'status' | 'priority' | 'stage' | 'label' | 'agent';
export const FILTER_GROUPS: FilterGroup[] = ['phase', 'type', 'status', 'priority', 'stage', 'label', 'agent'];

/** Selected values per group; an empty set means "All". */
export type Filters = Record<FilterGroup, ReadonlySet<string>>;

export interface FilterOption {
  value: string;
  label: string;
}

export function emptyFilters(): Filters {
  return {
    phase: new Set(),
    type: new Set(),
    status: new Set(),
    priority: new Set(),
    stage: new Set(),
    label: new Set(),
    agent: new Set(),
  };
}

/** Filters from plain lists of values (as saved per project). */
export function filtersFrom(values: Record<FilterGroup, string[]>): Filters {
  return {
    phase: new Set(values.phase),
    type: new Set(values.type),
    status: new Set(values.status),
    priority: new Set(values.priority),
    stage: new Set(values.stage),
    label: new Set(values.label),
    agent: new Set(values.agent),
  };
}

/** Position in a vocabulary list; values it doesn't list come after, alphabetically. */
function byVocabulary(ids: string[]) {
  const rank = (v: string) => (ids.includes(v) ? ids.indexOf(v) : ids.length);
  return (a: string, b: string) => rank(a) - rank(b) || a.localeCompare(b);
}

/**
 * The values a task has in each group: one, except labels (none or several). A task's priority is its effective one
 * (missing or unknown: the default).
 */
function valuesOf(group: FilterGroup, t: Task, vocab: Vocabulary): string[] {
  if (group === 'label') return labelsOf(vocab, t);
  if (group === 'stage') {
    const stage = stageOf(t, vocab);
    return stage ? [stage] : [];
  }
  if (group === 'agent') {
    const actor = startedBy(t);
    return actor ? [actor] : [];
  }
  if (group === 'phase') return [String(t.phase)];
  if (group === 'priority') return [priorityOf(vocab, t)];
  return [group === 'type' ? t.type : t.status];
}

/**
 * Filter buttons for the values in the data: phases numerically (with their names), types, statuses and priorities
 * in the vocabulary's order and with its labels.
 */
export function filterOptions(
  tasks: Task[],
  vocab: Vocabulary = DEFAULT_VOCABULARY,
): Record<FilterGroup, FilterOption[]> {
  const phases = [...new Set(tasks.map((t) => t.phase))].sort((a, b) => a - b);
  const types = [...new Set(tasks.map((t) => t.type))].sort(byVocabulary(vocab.types.map((t) => t.id)));
  const statuses = [...new Set(tasks.map((t) => t.status))].sort(
    (a, b) => statusRank(vocab, a) - statusRank(vocab, b) || a.localeCompare(b),
  );
  const priorities = [...new Set(tasks.map((t) => priorityOf(vocab, t)))].sort(
    (a, b) => priorityRank(vocab, a) - priorityRank(vocab, b),
  );
  const labels = [...new Set(tasks.flatMap((t) => labelsOf(vocab, t)))].sort(labelOrder(vocab));
  const agents = [...new Set(tasks.flatMap((t) => valuesOf('agent', t, vocab)))].sort((a, b) => a.localeCompare(b));
  const stages = new Set(tasks.flatMap((t) => valuesOf('stage', t, vocab)));
  return {
    phase: phases.map((p) => {
      const name = vocab.phaseNames.get(p);
      return { value: String(p), label: name ? `${p} · ${name}` : String(p) };
    }),
    type: types.map((t) => ({ value: t, label: typeLabel(vocab, t) })),
    status: statuses.map((s) => ({ value: s, label: statusLabel(vocab, s) })),
    priority: priorities.map((p) => ({ value: p, label: `${p} ${priorityLabel(vocab, p)}` })),
    stage: STAGES.filter((s: Stage) => stages.has(s)).map((s) => ({ value: s, label: STAGE_LABELS[s] })),
    label: labels.map((l) => ({ value: l, label: labelText(vocab, l) })),
    agent: agents.map((a) => ({ value: a, label: shortAgent(a) })),
  };
}

/** OR within a group (for labels: any of the selected ones), AND across groups. */
export function filterTasks(tasks: Task[], filters: Filters, vocab: Vocabulary = DEFAULT_VOCABULARY): Task[] {
  return tasks.filter((t) =>
    FILTER_GROUPS.every(
      (group) => filters[group].size === 0 || valuesOf(group, t, vocab).some((v) => filters[group].has(v)),
    ),
  );
}

/** "all" clears the group; any other value toggles. Returns a new Filters object. */
export function toggleFilter(filters: Filters, group: FilterGroup, value: string): Filters {
  const next = new Set(filters[group]);
  if (value === 'all') next.clear();
  else if (next.has(value)) next.delete(value);
  else next.add(value);
  return { ...filters, [group]: next };
}

export function isActive(filters: Filters, group: FilterGroup, value: string): boolean {
  return value === 'all' ? filters[group].size === 0 : filters[group].has(value);
}

export interface FacetCounts {
  /** Tasks matching the other groups' selections: what "All" in this group would show. */
  all: number;
  /** Per value of this group, among those tasks. Values with no tasks are absent (count 0). */
  values: ReadonlyMap<string, number>;
}

/**
 * Faceted counts for the filter buttons: for each group, how many tasks each value would show given the selections
 * in the other groups (the group's own selection is ignored, so a count says what clicking that value adds).
 */
export function facetCounts(
  tasks: Task[],
  filters: Filters,
  vocab: Vocabulary = DEFAULT_VOCABULARY,
): Record<FilterGroup, FacetCounts> {
  const result = {} as Record<FilterGroup, FacetCounts>;
  for (const group of FILTER_GROUPS) {
    const others = filterTasks(tasks, { ...filters, [group]: new Set<string>() }, vocab);
    const values = new Map<string, number>();
    for (const t of others) {
      for (const v of valuesOf(group, t, vocab)) values.set(v, (values.get(v) ?? 0) + 1);
    }
    result[group] = { all: others.length, values };
  }
  return result;
}

/**
 * Keyword search: every word of `query` must appear (case-insensitively) in the task's ID, name, description, type
 * or labels. An empty query matches everything.
 */
export function searchTasks(tasks: Task[], query: string): Task[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return tasks;
  return tasks.filter((t) => {
    const labels = Array.isArray(t.labels) ? t.labels.join(' ') : '';
    const text = `${t.id} ${t.name} ${t.description ?? ''} ${t.type} ${labels}`.toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

export type ListSort = 'file' | 'priority';

/**
 * The List tab's order: as in the file, or by priority (most urgent first), then phase, then ID — the order agents
 * pick tasks in within a phase.
 */
export function sortTasks(tasks: Task[], sort: ListSort, vocab: Vocabulary = DEFAULT_VOCABULARY): Task[] {
  if (sort === 'file') return tasks;
  return [...tasks].sort(
    (a, b) =>
      priorityRank(vocab, priorityOf(vocab, a)) - priorityRank(vocab, priorityOf(vocab, b)) ||
      a.phase - b.phase ||
      a.id.localeCompare(b.id, undefined, { numeric: true }),
  );
}
