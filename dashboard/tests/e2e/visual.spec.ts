import { expect, openDashboard, test } from './helpers';

// Baselines are per platform (-darwin locally, -linux in CI). Regenerate deliberately after an intended UI change:
//   npx playwright test visual --update-snapshots   (then delete the stale -linux.png files; CI regenerates them)

for (const fixture of ['standard', 'large-90', 'empty', 'edge-cases']) {
  test.describe(`visual: ${fixture}`, () => {
    test.beforeEach(async ({ page, tasksServer }) => {
      await openDashboard(page, tasksServer, fixture);
      await expect(page.locator('#subtitle')).toContainText('loaded from tasks.json');
    });

    test('full page', async ({ page }) => {
      await expect(page).toHaveScreenshot(`${fixture}-page.png`, { fullPage: true });
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
