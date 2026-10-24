import { loadClaims, type ClaimMap } from './claims';
import { DEFAULT_PROJECT_NAME, loadTasks, type LoadedTasks } from './load';
import { getPref, setPref } from './prefs';
import { emptyFilters, filtersFrom, filterTasks, toggleFilter, type FilterGroup, type Filters } from './filters';
import { hasViewHash, parseViewHash, withViewHash, type ViewId } from './tabs';
import type { Task } from './types';
import { clearView, defaultView, projectKey, readView, sanitizeView, writeView, type SavedView } from './view-store';

const RELOAD_SPIN_MS = 400;

export class DashboardState {
  tasks = $state.raw<Task[]>([]);
  // Never mutated, only replaced on (re)load, so a plain Map in $state.raw is reactive enough
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  taskMap = $state.raw<ReadonlyMap<string, Task>>(new Map());
  projectName = $state(DEFAULT_PROJECT_NAME);
  /** Live claims by task ID (who works on what), from the optional claims.json; empty without it. */
  // Replaced on every (re)load, never mutated (like taskMap)
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  claims = $state.raw<ClaimMap>(new Map());
  /** When the data was last loaded; "12 m ago" labels are relative to it. */
  loadedAt = $state(Date.now());
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
  /** The selected view tab; mirrored in the URL hash ("#view=kanban") */
  tab = $state<ViewId>(parseViewHash(location.hash));
  kanbanGroupByPhase = $state(false);
  kanbanShowSkipped = $state(false);
  /** The phase the Progress tab focuses on; null for all phases */
  progressPhase = $state<number | null>(null);
  /** The graph's zoom and position once the user moved it; null while it is the automatic view */
  graphView = $state.raw<{ k: number; x: number; y: number } | null>(null);
  /** Where this project's view is saved; set once the first load says which project this is */
  viewKey = $state<string | null>(null);

  whatsNewOpen = $state(false);

  // On by default (FR-6.1); the user's choice is remembered per browser (FR-6.2)
  autoRefresh = $state(getPref('autoRefresh', true));
  autoRefreshSeconds = $state(getPref('autoRefreshSeconds', 5));

  async load() {
    try {
      this.apply(...(await Promise.all([loadTasks(), loadClaims()])));
      if (!this.loaded) this.restoreView();
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
      this.apply(...(await Promise.all([loadTasks(), loadClaims()])));
      if (!this.loaded) this.restoreView();
      this.loaded = true;
      this.loadError = null;
    } catch (e) {
      console.error('Reload failed:', e);
    }
    setTimeout(() => (this.reloading = false), RELOAD_SPIN_MS);
  }

  setAutoRefresh(on: boolean) {
    this.autoRefresh = on;
    setPref('autoRefresh', on);
  }

  setAutoRefreshSeconds(seconds: number) {
    this.autoRefreshSeconds = seconds;
    setPref('autoRefreshSeconds', seconds);
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

  openWhatsNew() {
    this.whatsNewOpen = true;
  }

  closeWhatsNew() {
    this.whatsNewOpen = false;
  }

  selectTab(tab: ViewId) {
    if (tab !== this.tab) location.hash = withViewHash(location.hash, tab);
    this.tab = tab;
  }

  /** The current view, as saved per project. */
  currentView(): SavedView {
    return {
      filters: { phase: [...this.filters.phase], type: [...this.filters.type], status: [...this.filters.status] },
      tab: this.tab,
      graphCollapsed: this.graphCollapsed,
      kanban: { groupByPhase: this.kanbanGroupByPhase, showSkipped: this.kanbanShowSkipped },
      progressPhase: this.progressPhase,
      graph: this.graphView,
    };
  }

  saveView() {
    const view = this.currentView(); // read first, so an $effect calling this tracks every field
    if (this.viewKey) writeView(this.viewKey, view);
  }

  /** Forget this project's saved view and return to the defaults. */
  resetView() {
    if (this.viewKey) clearView(this.viewKey);
    this.applyView(defaultView(), true);
  }

  /** After the first load: bring back this project's view. A #view= in the URL wins over the saved tab. */
  private restoreView() {
    this.viewKey = projectKey(this.meta);
    this.applyView(sanitizeView(readView(this.viewKey), this.tasks), !hasViewHash(location.hash));
  }

  private applyView(view: SavedView, includeTab: boolean) {
    this.filters = filtersFrom(view.filters);
    this.graphCollapsed = view.graphCollapsed;
    this.kanbanGroupByPhase = view.kanban.groupByPhase;
    this.kanbanShowSkipped = view.kanban.showSkipped;
    this.progressPhase = view.progressPhase;
    this.graphView = view.graph;
    if (includeTab && view.tab !== this.tab) {
      history.replaceState(null, '', withViewHash(location.hash, view.tab));
      this.tab = view.tab;
    }
  }

  private meta: LoadedTasks['meta'] = undefined;

  private apply(loaded: LoadedTasks, claims: ClaimMap) {
    this.meta = loaded.meta;
    this.tasks = loaded.tasks;
    this.taskMap = loaded.taskMap;
    this.projectName = loaded.projectName;
    this.claims = claims;
    this.loadedAt = Date.now();
  }
}

export const dashboard = new DashboardState();
