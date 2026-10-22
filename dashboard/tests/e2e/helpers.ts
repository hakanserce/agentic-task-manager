import { readFileSync } from 'node:fs';
import { test as base, expect, type Page } from '@playwright/test';

export { expect };

export type TasksData = { meta?: Record<string, unknown>; tasks: Record<string, unknown>[] };

const TASKS_JSON = /\/tasks\.json(\?.*)?$/;

export function loadFixture(name: string): TasksData {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'));
}

/** Controls what the dashboard gets when it fetches tasks.json. */
export class TasksServer {
  private body: string | null = null;
  private status = 200;
  requests = 0;

  constructor(private page: Page) {}

  async install() {
    await this.page.route(TASKS_JSON, (route) => {
      this.requests++;
      return route.fulfill({ status: this.status, contentType: 'application/json', body: this.body ?? '' });
    });
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

/** Serve `data` as tasks.json and open the dashboard. */
export async function openDashboard(page: Page, tasksServer: TasksServer, data: string | TasksData) {
  tasksServer.use(data);
  await page.goto('tasks-dashboard.html');
}
