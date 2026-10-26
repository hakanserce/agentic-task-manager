import { loadClaims, type ClaimMap } from './claims';
import { DEFAULT_ACTIVE_DAYS } from './forecast';
import {
  DEFAULT_PROJECT_NAME,
  loadArchive,
  loadProjects,
  loadTasks,
  newBuildReady,
  serverBuild,
  type LoadedTasks,
  type ProjectEntry,
  type Validators,
} from './load';
import { compareVersions } from './changelog';
import { getPref, setPref, storageAvailable } from './prefs';
import { dashboardBuild, dashboardVersion } from './release-notes';
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
import { routeFor, withProjectHash, type Route } from './routes';
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
  /** The projects the server lists (api/projects) */
  projects = $state.raw<ProjectEntry[]>([]);
  /** True once the project list has loaded */
  projectsLoaded = $state(false);
  /** The page shown: a project, the overview, how to add a project, or an unknown project (lib/routes.ts) */
  route = $state.raw<Route>({ page: 'project', id: '' });
  /** The project whose files are loaded, by id; null until one is shown */
  projectId = $state<string | null>(null);
  /** The server holds a newer dashboard than this page (after a plugin update): a bar offers to reload */
  newVersionReady = $state(false);
  /** The overview shows only active projects (open work, or activity lately); remembered per browser */
  overviewActiveOnly = $state(getPref('overviewActiveOnly', true));
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

  /** tasks.json's size (characters), for the archive notice */
  tasksBytes = $state(0);
  /**
   * tasks-archive.json's tasks (DM-5), loaded only once a view needs history (D-5.2: wantArchive); empty until then,
   * and when there is no archive. A task in both files is shown from tasks.json (DM-5.2).
   */
  archive = $state.raw<Task[]>([]);
  archiveLoaded = $state(false);
  /** Search, the lists and the graph include archived tasks ("Include archived") */
  includeArchived = $state(false);
  /** tasks.json's tasks, then the archived ones it doesn't have: the history views use these */
  history = $derived(
    this.archive.length ? [...this.tasks, ...this.archive.filter((t) => !this.taskMap.has(t.id))] : this.tasks,
  );
  // Archived tasks by ID, for dependency stubs in the detail panel
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  archiveMap = $derived<ReadonlyMap<string, Task>>(new Map(this.archive.map((t) => [t.id, t])));
  /** How many tasks are archived: meta.archived (written by atm archive), else the loaded archive's size */
  archivedCount = $derived(
    typeof this.meta?.archived === 'number' ? this.meta.archived : this.archiveLoaded ? this.archive.length : 0,
  );

  filters = $state.raw<Filters>(emptyFilters());
  /** Keyword search over ID, name, description and type; part of the saved view */
  query = $state('');
  /** Tasks matching the search, before the phase/type/status filters (the filter counts are based on these) */
  /** The tasks the lists, the board and the graph start from: tasks.json's, plus the archive's with Include archived */
  base = $derived(this.includeArchived ? this.history : this.tasks);
  searched = $derived(searchTasks(this.base, this.query));
  filtered = $derived(filterTasks(this.searched, this.filters, this.vocab));
  /** History (archived tasks too, once loaded) matching the search and filters: for the Progress tab */
  historyFiltered = $derived(
    this.includeArchived ? this.filtered : filterTasks(searchTasks(this.history, this.query), this.filters, this.vocab),
  );

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
  /** The Progress tab lists only active phases (unfinished, or finished within the last `days` days) */
  progressActive = $state.raw<{ only: boolean; days: number }>({ only: false, days: DEFAULT_ACTIVE_DAYS });
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

  // The last tasks.json's ETag / Last-Modified: polls ask whether it changed, and skip the work when it hasn't
  #validators: Validators | undefined;
  #projectsValidators: Validators | undefined;
  #pendingNeedsYou = false;
  #newVersionDismissed = false;
  #archiveValidators: Validators | undefined;
  #archiveWanted = false;

  /**
   * A view needs history (D-5.2): load the archive now, and keep it current with the polls from then on. Failures
   * are logged only; the views then show tasks.json alone.
   */
  wantArchive() {
    if (this.#archiveWanted) return;
    this.#archiveWanted = true;
    void this.refreshArchive().catch((e) => console.error('Loading the archive failed:', e));
  }

  setIncludeArchived(on: boolean) {
    this.includeArchived = on;
    if (on) this.wantArchive();
  }

  private async refreshArchive() {
    if (!this.projectId) return;
    const result = await loadArchive(this.projectId, fetch, this.archiveLoaded ? this.#archiveValidators : undefined);
    if (!result.unchanged) {
      this.#archiveValidators = result.validators;
      this.archive = result.tasks;
    }
    this.archiveLoaded = true;
  }

  async load() {
    try {
      await this.fetchAndApply();
      this.loadError = null;
    } catch (e) {
      this.loadError = (e as Error).message;
    }
  }

  /** Re-fetch the project list and the project's files. Failures keep the current data (logged only). */
  async reload() {
    this.reloading = true;
    try {
      await this.fetchAndApply();
      this.loadError = null;
    } catch (e) {
      console.error('Reload failed:', e);
    }
    setTimeout(() => (this.reloading = false), RELOAD_SPIN_MS);
  }

  /** Re-fetch the project list and decide the page from the URL; returns the project to load, or null for a page
   * without one (the overview, how to add a project, an unknown project). */
  private async refreshProjects(): Promise<string | null> {
    const result = await loadProjects(fetch, this.#projectsValidators);
    if (!result.unchanged) {
      this.#projectsValidators = result.validators;
      this.projects = result.projects;
    }
    this.projectsLoaded = true;
    this.route = routeFor(this.projects, location.hash);
    if (this.route.page !== 'project') return null;
    if (this.route.id !== this.projectId) this.switchProject(this.route.id);
    // The project page wasn't shown, so nothing followed a #view= in the link that opened it
    if (hasViewHash(location.hash)) this.tab = parseViewHash(location.hash);
    return this.route.id;
  }

  /** Forget the shown project's data and view state, so the next load brings in `id`'s files and saved view. */
  private switchProject(id: string) {
    this.projectId = id;
    this.loaded = false;
    this.loadError = null;
    this.#validators = undefined;
    this.#archiveValidators = undefined;
    this.#archiveWanted = false;
    this.archive = [];
    this.archiveLoaded = false;
    this.includeArchived = false;
    this.tasks = [];
    // Replaced whole, never mutated (like on a load)
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    this.taskMap = new Map();
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    this.claims = new Map();
    this.meta = undefined;
    this.vocab = DEFAULT_VOCABULARY;
    this.projectName = DEFAULT_PROJECT_NAME;
    this.detailOpen = false;
    this.detailId = null;
    this.viewKey = null;
  }

  /** Show project `id`, or the overview for null (a new history entry, so Back returns). With `needsYou`, the project
   * opens on the Kanban board filtered to the tasks in review and blocked. */
  openProject(id: string | null, { needsYou = false } = {}) {
    let hash = withProjectHash(location.hash, id);
    if (id !== null && needsYou) {
      hash = withViewHash(hash, 'kanban');
      this.#pendingNeedsYou = true;
    }
    location.hash = hash;
  }

  /** The URL changed (a link, Back): pick up the dialog, and the page when it names another one. */
  onHashChange() {
    this.dialog = parseDialogHash(location.hash);
    const route = routeFor(this.projects, location.hash);
    if (JSON.stringify(route) !== JSON.stringify(this.route)) void this.reload();
  }

  /** Whether the server now holds a newer dashboard than this page (the plugin was updated): offer a reload */
  private async checkServerBuild() {
    if (!this.#newVersionDismissed && newBuildReady(dashboardBuild(), await serverBuild())) this.newVersionReady = true;
  }

  /** "Not now": the bar stays away until the page is reloaded */
  dismissNewVersion() {
    this.#newVersionDismissed = true;
    this.newVersionReady = false;
  }

  private async fetchAndApply() {
    const project = await this.refreshProjects();
    void this.checkServerBuild(); // the server answered: ask which dashboard it holds now
    if (project === null) {
      this.loadedAt = Date.now();
      return;
    }
    const [result, claims] = await Promise.all([
      loadTasks(project, fetch, this.loaded ? this.#validators : undefined),
      loadClaims(project),
      this.#archiveWanted
        ? this.refreshArchive().catch((e) => console.error('Reloading the archive failed:', e))
        : undefined,
    ]);
    if (result.unchanged) {
      // tasks.json is as it was: keep the tasks (no re-parse, no re-render); claims and the clock still move
      this.claims = claims;
      this.loadedAt = Date.now();
    } else {
      this.#validators = result.validators;
      this.apply(result.loaded, claims);
    }
    if (!this.loaded) this.restoreView();
    if (this.#pendingNeedsYou) {
      // Opened from an overview card's "needs you": only what waits for a review or a decision
      this.#pendingNeedsYou = false;
      const status = this.vocab.statuses.filter((s) => s.kind === 'review' || s.kind === 'blocked').map((s) => s.id);
      this.filters = filtersFrom({ phase: [], type: [], status, priority: [], stage: [], label: [], agent: [] });
    }
    this.loaded = true;
  }

  setOverviewActiveOnly(on: boolean) {
    this.overviewActiveOnly = on;
    setPref('overviewActiveOnly', on);
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
    if (!this.taskMap.has(id) && !this.archiveMap.has(id)) return;
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
        stage: [...this.filters.stage],
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
      progressActive: this.progressActive,
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
    // The server's project id is meta.id (or stands in for it), so views saved before 0.15.0 are found again
    this.viewKey = projectKey(this.projectId ? { id: this.projectId } : this.meta);
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
    this.progressActive = view.progressActive;
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
    this.tasksBytes = loaded.bytes;
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
