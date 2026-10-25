import { loadClaims, type ClaimMap } from './claims';
import { DEFAULT_PROJECT_NAME, loadTasks, type LoadedTasks } from './load';
import { compareVersions } from './changelog';
import { getPref, setPref, storageAvailable } from './prefs';
import { dashboardVersion } from './release-notes';
import { isModePref, knownTheme, resolveMode, type Mode, type ModePref } from './appearance';
import {
  emptyFilters,
  filtersFrom,
  filterTasks,
  searchTasks,
  toggleFilter,
  type FilterGroup,
  type Filters,
  type ListSort,
} from './filters';
import { parseDialogHash, withDialogHash, type DialogId } from './dialogs';
import { hasViewHash, parseViewHash, withViewHash, type ViewId } from './tabs';
import type { ActivityRange } from './insights';
import type { ViewWindow } from './time-window';
import type { Task } from './types';
import { DEFAULT_VOCABULARY, resolveVocabulary, type Vocabulary } from './vocab';
import { clearView, defaultView, projectKey, readView, sanitizeView, writeView, type SavedView } from './view-store';

const RELOAD_SPIN_MS = 400;

function releaseNotesUnseen(): boolean {
  const version = dashboardVersion();
  const lastSeen = getPref('lastSeenVersion', '');
  return !!version && storageAvailable() && (lastSeen === '' || compareVersions(version, lastSeen) > 0);
}

export class DashboardState {
  tasks = $state.raw<Task[]>([]);
  // Never mutated, only replaced on (re)load, so a plain Map in $state.raw is reactive enough
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  taskMap = $state.raw<ReadonlyMap<string, Task>>(new Map());
  projectName = $state(DEFAULT_PROJECT_NAME);
  /** tasks.json's meta, as loaded */
  meta = $state.raw<LoadedTasks['meta']>(undefined);
  /** The project's vocabularies (statuses with kinds, types, priorities, phase names), defaults where meta has none */
  vocab = $state.raw<Vocabulary>(DEFAULT_VOCABULARY);
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
  /** Keyword search over ID, name, description and type; part of the saved view */
  query = $state('');
  /** Tasks matching the search, before the phase/type/status filters (the filter counts are based on these) */
  searched = $derived(searchTasks(this.tasks, this.query));
  filtered = $derived(filterTasks(this.searched, this.filters, this.vocab));

  /** Task shown in the detail panel; the panel keeps its last content while closed. */
  detailId = $state<string | null>(null);
  detailOpen = $state(false);

  /** The selected view tab; mirrored in the URL hash ("#view=kanban") */
  tab = $state<ViewId>(parseViewHash(location.hash));
  kanbanGroupByPhase = $state(false);
  kanbanShowSkipped = $state(false);
  /** The Kanban done column shows every card, not just the most recent */
  kanbanShowAllDone = $state(false);
  /** The List tab's order: as in the file, or by priority */
  listSort = $state<ListSort>('file');
  /** The phase the Progress tab focuses on; null for all phases */
  progressPhase = $state<number | null>(null);
  /** Tasks outside the search and filters: left out of the graph, or greyed out in it */
  graphFiltered = $state<'hide' | 'dim'>('hide');
  /** The graph's zoom and position once the user moved it; null while it is the automatic view */
  graphView = $state.raw<{ k: number; x: number; y: number } | null>(null);
  /** The Agents tab's zoomed time range; null shows everything */
  agentsWindow = $state.raw<ViewWindow | null>(null);
  /** The Agents timeline runs up to now and moves with time */
  agentsLive = $state(false);
  /** The period the Activity panel shows */
  activityRange = $state.raw<ActivityRange>({ preset: 'all' });
  /** Where this project's view is saved; set once the first load says which project this is */
  viewKey = $state<string | null>(null);

  whatsNewOpen = $state(false);
  /** The open About or Help dialog; mirrored in the URL hash ("#about") so it can be linked */
  dialog = $state<DialogId | null>(parseDialogHash(location.hash));
  /** "New" on the version until this version's release notes are opened once (FR-1.5). Without working storage
   * it could never be cleared, so it is not shown at all. */
  releaseNotesUnseen = $state(releaseNotesUnseen());

  // Light/dark mode and theme, per browser (FR-2.3, FR-3.2). "System" follows the OS setting, live.
  modePref = $state<ModePref>(
    isModePref(getPref('mode', 'system')) ? (getPref('mode', 'system') as ModePref) : 'system',
  );
  theme = $state(knownTheme(getPref('theme', 'default')));
  systemPrefersLight = $state(prefersLight());
  mode = $derived<Mode>(resolveMode(this.modePref, this.systemPrefersLight));

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

  setModePref(pref: ModePref) {
    this.modePref = pref;
    setPref('mode', pref);
  }

  setTheme(id: string) {
    this.theme = knownTheme(id);
    setPref('theme', this.theme);
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
    const version = dashboardVersion();
    if (version) setPref('lastSeenVersion', version);
    this.releaseNotesUnseen = false;
  }

  closeWhatsNew() {
    this.whatsNewOpen = false;
  }

  openDialog(id: DialogId) {
    this.dialog = id;
    location.hash = withDialogHash(location.hash, id);
  }

  /** Closes the dialog without a new history entry, so Back doesn't reopen it. */
  closeDialog() {
    this.dialog = null;
    history.replaceState(null, '', withDialogHash(location.hash, null));
  }

  selectTab(tab: ViewId) {
    if (tab !== this.tab) location.hash = withViewHash(location.hash, tab);
    this.tab = tab;
  }

  /** The current view, as saved per project. */
  currentView(): SavedView {
    return {
      filters: {
        phase: [...this.filters.phase],
        type: [...this.filters.type],
        status: [...this.filters.status],
        priority: [...this.filters.priority],
        label: [...this.filters.label],
        agent: [...this.filters.agent],
      },
      query: this.query,
      tab: this.tab,
      kanban: {
        groupByPhase: this.kanbanGroupByPhase,
        showSkipped: this.kanbanShowSkipped,
        showAllDone: this.kanbanShowAllDone,
      },
      listSort: this.listSort,
      progressPhase: this.progressPhase,
      graphFiltered: this.graphFiltered,
      graph: this.graphView,
      agents: this.agentsWindow,
      agentsLive: this.agentsLive,
      activity: this.activityRange,
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
    this.applyView(sanitizeView(readView(this.viewKey), this.tasks, this.vocab), !hasViewHash(location.hash));
  }

  private applyView(view: SavedView, includeTab: boolean) {
    this.filters = filtersFrom(view.filters);
    this.query = view.query;
    this.kanbanGroupByPhase = view.kanban.groupByPhase;
    this.kanbanShowSkipped = view.kanban.showSkipped;
    this.kanbanShowAllDone = view.kanban.showAllDone;
    this.listSort = view.listSort;
    this.progressPhase = view.progressPhase;
    this.graphFiltered = view.graphFiltered;
    this.graphView = view.graph;
    this.agentsWindow = view.agents;
    this.agentsLive = view.agentsLive;
    this.activityRange = view.activity;
    if (includeTab && view.tab !== this.tab) {
      history.replaceState(null, '', withViewHash(location.hash, view.tab));
      this.tab = view.tab;
    }
  }

  private apply(loaded: LoadedTasks, claims: ClaimMap) {
    this.meta = loaded.meta;
    this.vocab = resolveVocabulary(loaded.meta);
    this.tasks = loaded.tasks;
    this.taskMap = loaded.taskMap;
    this.projectName = loaded.projectName;
    this.claims = claims;
    this.loadedAt = Date.now();
  }
}

function prefersLight(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches;
}

export const dashboard = new DashboardState();
