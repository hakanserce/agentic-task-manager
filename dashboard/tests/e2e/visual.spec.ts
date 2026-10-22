import { expect, openDashboard, test } from './helpers';

// Baselines are recorded from the legacy project and shared with the svelte project (see snapshotPathTemplate).
// Regenerate deliberately: npx playwright test --project=legacy visual --update-snapshots

for (const fixture of ['standard', 'large-90', 'empty', 'edge-cases']) {
  test.describe(`visual: ${fixture}`, () => {
    test.beforeEach(async ({ page, tasksServer }) => {
      await openDashboard(page, tasksServer, fixture);
      await expect(page.locator('#subtitle')).toContainText('loaded from tasks.json');
    });

    // edge-cases T-006 has HTML in its name, which legacy renders as markup and the port escapes
    const mask = (page: import('@playwright/test').Page) =>
      fixture === 'edge-cases'
        ? [page.locator('.task-card[data-id="T-006"]'), page.locator('#dep-graph g', { hasText: 'T-006' })]
        : [];

    test('full page', async ({ page }) => {
      await expect(page).toHaveScreenshot(`${fixture}-page.png`, { fullPage: true, mask: mask(page) });
    });

    test('dependency graph', async ({ page }) => {
      await expect(page.locator('#graph-section')).toHaveScreenshot(`${fixture}-graph.png`, { mask: mask(page) });
    });
  });
}

test('visual: detail panel', async ({ page, tasksServer }) => {
  await openDashboard(page, tasksServer, 'standard');
  await page.locator('.task-card[data-id="T-004"] .task-name').click();
  await expect(page.locator('#detail-panel')).toHaveScreenshot('standard-detail.png');
});
