import path from 'node:path';
import { expect, openDashboard, test } from './helpers';

// The version chip is masked: it shows the version (and a "new" marker) and would otherwise change every page
// baseline on each release; whats-new.spec covers it. It also gets a fixed width for the screenshot, so a longer
// version number (0.9.0 -> 0.10.0) doesn't move the mask's edge.
// The auto-refresh interval box is masked too: headless Chromium places the text inside a number input at a
// slightly different sub-pixel position from run to run. refresh.spec covers its value and behaviour.
// Baselines are per platform (-darwin locally, -linux in CI). Regenerate deliberately after an intended UI change:
//   npx playwright test visual --update-snapshots   (then delete the stale -linux.png files; CI regenerates them)

for (const fixture of ['standard', 'large-90', 'empty', 'edge-cases']) {
  test.describe(`visual: ${fixture}`, () => {
    test.beforeEach(async ({ page, tasksServer }) => {
      await openDashboard(page, tasksServer, fixture);
      await expect(page.locator('#subtitle')).toContainText('loaded from tasks.json');
    });

    test('full page', async ({ page }) => {
      await expect(page).toHaveScreenshot(`${fixture}-page.png`, {
        fullPage: true,
        mask: [page.locator('#version-chip'), page.locator('#auto-refresh-interval')],
        stylePath: path.join(import.meta.dirname, 'screenshot.css'),
      });
    });

    test('dependency graph', async ({ page }) => {
      await expect(page.locator('#graph-section')).toHaveScreenshot(`${fixture}-graph.png`);
    });
  });
}

test('visual: detail panel', async ({ page, tasksServer }) => {
  await openDashboard(page, tasksServer, 'standard');
  await page.locator('.task-card[data-id="T-004"] .task-name').click();
  await expect(page.locator('#detail-panel')).toHaveScreenshot('standard-detail.png');
});

for (const fixture of ['standard', 'kanban']) {
  test(`visual: kanban board (${fixture})`, async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, fixture);
    await page.locator('#tab-kanban').click();
    await expect(page.locator('#kanban .kanban-card').first()).toBeVisible();
    await expect(page.locator('#graph-section')).toHaveScreenshot(`${fixture}-kanban.png`);
  });
}

test('visual: progress tab', async ({ page, tasksServer }) => {
  await page.clock.setFixedTime(new Date('2026-04-06T12:00:00Z'));
  await openDashboard(page, tasksServer, 'progress');
  await page.locator('#tab-progress').click();
  await expect(page.locator('#burndown svg')).toBeVisible();
  await expect(page.locator('#graph-section')).toHaveScreenshot('progress-progress.png');
});
