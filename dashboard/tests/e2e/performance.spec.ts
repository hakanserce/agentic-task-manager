import type { Page } from '@playwright/test';
import { expect, loadFixture, openDashboard, test } from './helpers';

// NFR-2: with 500 tasks, switching tabs and refreshing data render within 200 ms. Measured inside the page from the
// action until two animation frames later (so layout and paint are included). Shared CI runners are slower and
// noisier, so the budget is doubled there.
const BUDGET_MS = 200 * (process.env.CI ? 2 : 1);

/** Click `selector`, then wait until `done()` holds and two frames have been painted; returns elapsed ms. */
function timeAction(page: Page, selector: string, done: string) {
  return page.evaluate(
    async ([selector, done]) => {
      const check = new Function(`return (${done})`) as () => boolean;
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const start = performance.now();
      (document.querySelector(selector) as HTMLElement).click();
      while (!check()) await frame();
      await frame();
      await frame();
      return performance.now() - start;
    },
    [selector, done],
  );
}

test.describe('performance with 500 tasks', () => {
  test.beforeEach(async ({ page, tasksServer }) => {
    await page.clock.setFixedTime(new Date('2026-04-20T12:00:00Z'));
    await openDashboard(page, tasksServer, 'large-500');
    await expect(page.locator('.task-card')).toHaveCount(500);
  });

  test('switching tabs', async ({ page }) => {
    const timings = {
      kanban: await timeAction(page, '#tab-kanban', "document.querySelector('#kanban .kanban-card')?.offsetParent"),
      progress: await timeAction(page, '#tab-progress', "document.querySelector('#burndown svg')?.isConnected"),
      // Mounted when selected: the timeline is built from scratch
      agents: await timeAction(page, '#tab-agents', "document.querySelector('#panel-agents .agents-grid')"),
      graph: await timeAction(page, '#tab-graph', "document.querySelector('#panel-graph:not([hidden]) #dep-graph')"),
    };
    console.log('tab switch (ms):', JSON.stringify(timings));
    for (const [tab, ms] of Object.entries(timings)) expect(ms, tab).toBeLessThan(BUDGET_MS);
  });

  test('a reload that changes the data, on every tab', async ({ page, tasksServer }) => {
    const data = loadFixture('large-500');
    const changed = "document.querySelector('.task-card[data-id=\"T-301\"]')?.classList.contains('status-done')";
    const timings: Record<string, number> = {};
    for (const tab of ['graph', 'kanban', 'progress']) {
      await page.locator(`#tab-${tab}`).click();
      // Alternate the data so every reload really changes something
      const status = tab === 'kanban' ? 'in_progress' : 'done';
      data.tasks.find((t) => t.id === 'T-301')!.status = status;
      tasksServer.use(data);
      timings[tab] = await timeAction(page, '#reload-btn', changed.replace("'status-done'", `'status-${status}'`));
    }
    console.log('reload (ms):', JSON.stringify(timings));
    for (const [tab, ms] of Object.entries(timings)) expect(ms, tab).toBeLessThan(BUDGET_MS);
  });
});
