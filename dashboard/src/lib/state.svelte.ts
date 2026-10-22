import { DEFAULT_PROJECT_NAME, loadTasks } from './load';
import { emptyFilters, filterTasks, toggleFilter, type FilterGroup, type Filters } from './filters';
import type { Task } from './types';

const RELOAD_SPIN_MS = 400;

export class DashboardState {
  tasks = $state.raw<Task[]>([]);
  // Never mutated, only replaced on (re)load, so a plain Map in $state.raw is reactive enough
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  taskMap = $state.raw<ReadonlyMap<string, Task>>(new Map());
  projectName = $state(DEFAULT_PROJECT_NAME);
  /** True once tasks.json has loaded successfully at least once. */
  loaded = $state(false);
  /** Message from a failed initial load; shown instead of the task grid. */
  loadError = $state<string | null>(null);
  reloading = $state(false);

  filters = $state.raw<Filters>(emptyFilters());
  filtered = $derived(filterTasks(this.tasks, this.filters));

  /** Task shown in the detail panel; the panel keeps its last content while closed. */
  detailId = $state<string | null>(null);
  detailOpen = $state(false);

  graphCollapsed = $state(false);

  autoRefresh = $state(false);
  autoRefreshSeconds = $state(5);

  async load() {
    try {
      this.apply(await loadTasks());
      this.loaded = true;
      this.loadError = null;
    } catch (e) {
      this.loadError = (e as Error).message;
    }
  }

  /** Re-fetch tasks.json. Failures keep the current data (logged only), like the legacy dashboard. */
  async reload() {
    this.reloading = true;
    try {
      this.apply(await loadTasks());
      this.loaded = true;
      this.loadError = null;
    } catch (e) {
      console.error('Reload failed:', e);
    }
    setTimeout(() => (this.reloading = false), RELOAD_SPIN_MS);
  }

  toggleFilter(group: FilterGroup, value: string) {
    this.filters = toggleFilter(this.filters, group, value);
  }

  showDetail(id: string) {
    if (!this.taskMap.has(id)) return;
    this.detailId = id;
    this.detailOpen = true;
  }

  closeDetail() {
    this.detailOpen = false;
  }

  private apply(loaded: { tasks: Task[]; taskMap: ReadonlyMap<string, Task>; projectName: string }) {
    this.tasks = loaded.tasks;
    this.taskMap = loaded.taskMap;
    this.projectName = loaded.projectName;
  }
}

export const dashboard = new DashboardState();
