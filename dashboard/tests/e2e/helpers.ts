import { readFileSync } from 'node:fs';
import { test as base, expect, type Page } from '@playwright/test';
import { PREFS_KEY } from '../../src/lib/prefs';
import type { ViewId } from '../../src/lib/tabs';

export { expect };

export type TasksData = { meta?: Record<string, unknown>; tasks: Record<string, unknown>[] };

const TASKS_JSON = /\/tasks\.json(\?.*)?$/;
const CLAIMS_JSON = /\/claims\.json(\?.*)?$/;

export function loadFixture(name: string): TasksData {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'));
}

/** Controls what the dashboard gets when it fetches tasks.json (and the optional claims.json, a 404 by default). */
export class TasksServer {
  private body: string | null = null;
  private status = 200;
  private claimsBody: string | null = null;
  requests = 0;

  constructor(private page: Page) {}

  async install() {
    await this.page.route(TASKS_JSON, (route) => {
      this.requests++;
      return route.fulfill({ status: this.status, contentType: 'application/json', body: this.body ?? '' });
    });
    await this.page.route(CLAIMS_JSON, (route) =>
      this.claimsBody === null
        ? route.fulfill({ status: 404, body: 'not found' })
        : route.fulfill({ status: 200, contentType: 'application/json', body: this.claimsBody }),
    );
  }

  /** Serve claims.json (the `atm` claims snapshot); null makes it a 404 again. */
  claims(claims: Record<string, unknown>[] | null) {
    this.claimsBody = claims === null ? null : JSON.stringify({ generated_at: '2026-01-01T00:00:00Z', claims });
    return this;
  }

  /** Serve a fixture by name (tests/fixtures/<name>.json) or an inline object. */
  use(data: string | TasksData) {
    this.body = JSON.stringify(typeof data === 'string' ? loadFixture(data) : data);
    this.status = 200;
    return this;
  }

  fail(status = 404) {
    this.status = status;
    this.body = 'not found';
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

export function filterButton(page: Page, group: 'phase' | 'type' | 'status', value: string) {
  return page.locator(`.filter-btn[data-filter="${group}"][data-value="${value}"]`);
}

/** IDs of the task cards currently shown, in display order. */
export function visibleCardIds(page: Page) {
  return page.locator('.task-card').evaluateAll((cards) => cards.map((c) => (c as HTMLElement).dataset.id));
}
