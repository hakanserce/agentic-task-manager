// After a plugin update the server restarts with a new dashboard build; the open page offers a reload
// (docs/multi-project-dashboard-proposal.md 3.3).
import { expect, openDashboard, test } from './helpers';

const pageBuild = (page: import('@playwright/test').Page) =>
  page.locator('meta[name="atm-dashboard-build"]').getAttribute('content');

test.describe('new version notice', () => {
  test('appears once the server holds another build, and Reload reloads', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    await tasksServer.serverBuild((await pageBuild(page))!);
    await page.locator('#reload-btn').click();
    await expect(page.locator('#dashboard-title')).toHaveText('Standard Project — Task Dashboard');
    await expect(page.locator('#update-notice')).toHaveCount(0);

    await tasksServer.serverBuild('newer-build');
    await page.locator('#reload-btn').click();
    await expect(page.locator('#update-notice')).toContainText('A new version of the dashboard is ready');
    const reloaded = page.waitForEvent('load');
    await page.locator('#update-reload').click();
    await reloaded;
  });

  test('“Not now” hides it until the page is reloaded', async ({ page, tasksServer }) => {
    await tasksServer.serverBuild('newer-build');
    await openDashboard(page, tasksServer, 'standard');
    await expect(page.locator('#update-notice')).toBeVisible();
    await page.getByRole('button', { name: 'Not now' }).click();
    await page.locator('#reload-btn').click();
    await expect(page.locator('#dashboard-title')).toBeVisible();
    await expect(page.locator('#update-notice')).toHaveCount(0);
  });

  test('a server that doesn’t say its build never shows it', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    await page.locator('#reload-btn').click();
    await expect(page.locator('#update-notice')).toHaveCount(0);
  });
});
