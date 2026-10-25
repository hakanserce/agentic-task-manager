import { readFileSync } from 'node:fs';
import { test as base, expect, type Page } from '@playwright/test';
import type { FilterGroup } from '../../src/lib/filters';
import { PREFS_KEY } from '../../src/lib/prefs';
import type { ViewId } from '../../src/lib/tabs';

export { expect };

export type TasksData = { meta?: Record<string, unknown>; tasks: Record<string, unknown>[] };

// atm serve's API (docs/multi-project-api.md): the project list, and each project's files under p/<id>/
const PROJECTS_JSON = /\/api\/projects(\?.*)?$/;
const TASKS_JSON = /\/p\/([^/]+)\/tasks\.json(\?.*)?$/;
const CLAIMS_JSON = /\/p\/([^/]+)\/claims\.json(\?.*)?$/;
const ARCHIVE_JSON = /\/p\/([^/]+)\/tasks-archive\.json(\?.*)?$/;
/** The id of the project the fixture serves by default */
export const FIXTURE_PROJECT = 'fixture';

export function loadFixture(name: string): TasksData {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'));
}

const toBody = (data: string | TasksData) => JSON.stringify(typeof data === 'string' ? loadFixture(data) : data);

/**
 * Plays atm serve for the dashboard: api/projects lists one project (FIXTURE_PROJECT) by default, more with
 * addProject(), and each project's tasks.json, claims.json (a 404 by default) and tasks-archive.json (a 404 by default)
 * are served under p/<id>/.
 */
export class TasksServer {
  private body: string | null = null;
  private status = 200;
  private claimsBody: string | null = null;
  private archiveBody: string | null = null;
  /** Projects besides the default one: their tasks.json, by id */
  private others = new Map<string, { name: string; body: string }>();
  private listed = true;
  /** How many times tasks-archive.json was fetched (it is loaded only when a view needs it) */
  archiveRequests = 0;
  // Like atm serve: each version of the file has an ETag, and a request that already has it gets a 304 (D-5.1)
  private version = 0;
  requests = 0;
  /** How many requests were answered 304 Not Modified */
  notModified = 0;

  constructor(private page: Page) {}

  /** The project list api/projects answers with (summaries are null until a test needs them) */
  projectList() {
    if (!this.listed) return [];
    const meta = (this.body && this.status === 200 ? (JSON.parse(this.body) as TasksData).meta : undefined) ?? {};
    const project = (id: string, name: string) => ({
      id,
      name,
      path: `/projects/${id}`,
      missing: false,
      summary: null,
    });
    return [
      project(FIXTURE_PROJECT, typeof meta.project === 'string' ? meta.project : FIXTURE_PROJECT),
      ...[...this.others].map(([id, p]) => project(id, p.name)),
    ];
  }

  async install() {
    await this.page.route(PROJECTS_JSON, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ generated_at: '2026-01-01T00:00:00Z', projects: this.projectList() }),
      }),
    );
    await this.page.route(TASKS_JSON, (route) => {
      const id = decodeURIComponent(TASKS_JSON.exec(route.request().url())![1]);
      if (id !== FIXTURE_PROJECT) {
        const other = this.others.get(id);
        return other
          ? route.fulfill({ status: 200, contentType: 'application/json', body: other.body })
          : route.fulfill({ status: 404, contentType: 'application/json', body: '{"error": "unknown project"}' });
      }
      this.requests++;
      const etag = `"v${this.version}"`;
      if (this.status === 200 && route.request().headers()['if-none-match'] === etag) {
        this.notModified++;
        return route.fulfill({ status: 304, headers: { ETag: etag } });
      }
      const headers = this.status === 200 ? { ETag: etag } : undefined;
      return route.fulfill({ status: this.status, contentType: 'application/json', body: this.body ?? '', headers });
    });
    const isDefault = (url: string, pattern: RegExp) => decodeURIComponent(pattern.exec(url)![1]) === FIXTURE_PROJECT;
    await this.page.route(ARCHIVE_JSON, (route) => {
      const mine = isDefault(route.request().url(), ARCHIVE_JSON);
      if (mine) this.archiveRequests++;
      return this.archiveBody === null || !mine
        ? route.fulfill({ status: 404, body: 'not found' })
        : route.fulfill({ status: 200, contentType: 'application/json', body: this.archiveBody });
    });
    await this.page.route(CLAIMS_JSON, (route) =>
      this.claimsBody === null || !isDefault(route.request().url(), CLAIMS_JSON)
        ? route.fulfill({ status: 404, body: 'not found' })
        : route.fulfill({ status: 200, contentType: 'application/json', body: this.claimsBody }),
    );
  }

  /** Register another project, served under p/<id>/ (a fixture by name or inline tasks). */
  addProject(id: string, data: string | TasksData, name = id) {
    this.others.set(id, { name, body: toBody(data) });
    return this;
  }

  /** api/projects lists nothing, as for a user who hasn't registered a project yet. */
  noProjects() {
    this.listed = false;
    return this;
  }

  /** Serve claims.json (the `atm` claims snapshot); null makes it a 404 again. */
  claims(claims: Record<string, unknown>[] | null) {
    this.claimsBody = claims === null ? null : JSON.stringify({ generated_at: '2026-01-01T00:00:00Z', claims });
    return this;
  }

  /** Serve tasks-archive.json (a fixture by name or inline tasks); null makes it a 404 (no archive) again. */
  archive(data: string | TasksData | null) {
    this.archiveBody = data === null ? null : toBody(data);
    return this;
  }

  /** Serve a fixture by name (tests/fixtures/<name>.json) or an inline object, as the default project's tasks.json. */
  use(data: string | TasksData) {
    this.body = toBody(data);
    this.status = 200;
    this.version++;
    return this;
  }

  fail(status = 404) {
    this.status = status;
    this.body = 'not found';
    this.version++;
    return this;
  }
}

type Fixtures = { tasksServer: TasksServer; externalRequestGuard: void };

export const test = base.extend<Fixtures>({
  tasksServer: async ({ page }, use) => {
    const server = new TasksServer(page);
    await server.install();
    await use(server);
  },

  // The dashboard promises zero external dependencies: any non-localhost request fails the test.
  externalRequestGuard: [
    async ({ page }, use) => {
      const external: string[] = [];
      page.on('request', (req) => {
        const { protocol, hostname } = new URL(req.url());
        if ((protocol === 'http:' || protocol === 'https:') && hostname !== 'localhost') external.push(req.url());
      });
      await use();
      expect(external, 'external requests').toEqual([]);
    },
    { auto: true },
  ],
});

/**
 * Serve `data` as tasks.json and open the dashboard.
 * Auto-refresh is switched off (unless `autoRefresh: true`) so background reloads can't interfere with what a
 * test checks. It is only set when no preference is stored yet, so a test that changes it and reloads keeps its choice.
 */
export async function openDashboard(
  page: Page,
  tasksServer: TasksServer,
  data: string | TasksData,
  { autoRefresh = false, tab }: { autoRefresh?: boolean; tab?: ViewId } = {},
) {
  if (!autoRefresh) {
    await page.addInitScript((key) => {
      try {
        const prefs = JSON.parse(localStorage.getItem(key) || '{}');
        if (!('autoRefresh' in prefs)) localStorage.setItem(key, JSON.stringify({ ...prefs, autoRefresh: false }));
      } catch {
        // storage unavailable: the dashboard falls back to its defaults
      }
    }, PREFS_KEY);
  }
  tasksServer.use(data);
  await page.goto('tasks-dashboard.html' + (tab ? `#view=${tab}` : ''));
}

/** Open the filter panel (Phase, Type and Status buttons) under the search line, if it isn't open yet. */
export async function openFilters(page: Page) {
  const toggle = page.locator('#filters-toggle');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(page.locator('#filter-panel')).toBeVisible();
}

/** "N of M tasks": how many tasks the search and filters leave, next to the search box. */
export function matchCount(page: Page) {
  return page.locator('#match-count');
}

/** Open a menu in the top bar (refresh, appearance) unless it is open already. */
export async function openMenu(page: Page, button: string) {
  const b = page.locator(button);
  if ((await b.getAttribute('aria-expanded')) !== 'true') await b.click();
}

export function filterButton(page: Page, group: FilterGroup, value: string) {
  return page.locator(`.filter-btn[data-filter="${group}"][data-value="${value}"]`);
}

/** IDs of the task cards currently shown, in display order. */
export function visibleCardIds(page: Page) {
  return page.locator('.task-card').evaluateAll((cards) => cards.map((c) => (c as HTMLElement).dataset.id));
}
