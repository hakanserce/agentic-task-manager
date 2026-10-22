import { KNOWN_STATUSES, type Task } from './types';

export type FilterGroup = 'phase' | 'type' | 'status';
export const FILTER_GROUPS: FilterGroup[] = ['phase', 'type', 'status'];

/** Selected values per group; an empty set means "All". */
export type Filters = Record<FilterGroup, ReadonlySet<string>>;

export interface FilterOption {
  value: string;
  label: string;
}

export function emptyFilters(): Filters {
  return { phase: new Set(), type: new Set(), status: new Set() };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function statusRank(status: string): number {
  const i = (KNOWN_STATUSES as readonly string[]).indexOf(status);
  return i === -1 ? 99 : i;
}

/** Filter buttons generated from the data: phases numerically, types alphabetically, statuses in workflow order. */
export function filterOptions(tasks: Task[]): Record<FilterGroup, FilterOption[]> {
  const phases = [...new Set(tasks.map((t) => t.phase))].sort((a, b) => a - b);
  const types = [...new Set(tasks.map((t) => t.type))].sort();
  const statuses = [...new Set(tasks.map((t) => t.status))].sort((a, b) => statusRank(a) - statusRank(b));
  return {
    phase: phases.map((p) => ({ value: String(p), label: String(p) })),
    type: types.map((t) => ({ value: t, label: capitalize(t) })),
    status: statuses.map((s) => ({ value: s, label: capitalize(s.replace(/_/g, ' ')) })),
  };
}

/** OR within a group, AND across groups. */
export function filterTasks(tasks: Task[], filters: Filters): Task[] {
  return tasks.filter(
    (t) =>
      (filters.phase.size === 0 || filters.phase.has(String(t.phase))) &&
      (filters.type.size === 0 || filters.type.has(t.type)) &&
      (filters.status.size === 0 || filters.status.has(t.status)),
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
