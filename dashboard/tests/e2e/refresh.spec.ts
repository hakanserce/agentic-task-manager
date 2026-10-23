import { expect, filterButton, loadFixture, openDashboard, statNumber, test } from './helpers';

/** standard.json with T-005 marked done. */
function standardWithT005Done() {
  const data = loadFixture('standard');
  data.tasks.find((t) => t.id === 'T-005')!.status = 'done';
  return data;
}

test.describe('reload', () => {
  test('the Reload button re-fetches and re-renders', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    await expect(statNumber(page, 'Done')).toHaveText('5');
    tasksServer.use(standardWithT005Done());
    await page.locator('#reload-btn').click();
    await expect(statNumber(page, 'Done')).toHaveText('6');
    await expect(page.locator('.task-card[data-id="T-005"]')).toHaveClass(/status-done/);
    expect(tasksServer.requests).toBe(2);
  });

  test('active filters survive a reload', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    await filterButton(page, 'phase', '1').click();
    tasksServer.use(standardWithT005Done());
    await page.locator('#reload-btn').click();
    await expect(page.locator('.task-card[data-id="T-005"]')).toHaveClass(/status-done/);
    await expect(page.locator('.phase-count')).toHaveText('4 of 12 shown');
    await expect(filterButton(page, 'phase', '1')).toHaveClass(/active/);
  });
});

test.describe('auto-refresh', () => {
  const requests = (tasksServer: { requests: number }) => expect.poll(() => tasksServer.requests);
  const toggle = (page: import('@playwright/test').Page) => page.locator('.auto-refresh-toggle');
  const check = (page: import('@playwright/test').Page) => page.locator('#auto-refresh-check');
  const interval = (page: import('@playwright/test').Page) => page.locator('#auto-refresh-interval');

  test.beforeEach(async ({ page, tasksServer }) => {
    await page.clock.install();
    // A fresh browser profile: no stored preferences, so the dashboard's defaults apply
    await openDashboard(page, tasksServer, 'standard', { autoRefresh: true });
  });

  test('is on by default and polls every 5 seconds', async ({ page, tasksServer }) => {
    await expect(check(page)).toBeChecked();
    await expect(interval(page)).toHaveValue('5');
    await page.clock.runFor(5_000);
    await requests(tasksServer).toBe(2);
    await page.clock.runFor(5_000);
    await requests(tasksServer).toBe(3);
  });

  test('stops polling when switched off', async ({ page, tasksServer }) => {
    await toggle(page).click();
    await expect(check(page)).not.toBeChecked();
    await page.clock.runFor(30_000);
    await requests(tasksServer).toBe(1);
  });

  test('switching it off is remembered across reloads', async ({ page, tasksServer }) => {
    await toggle(page).click();
    await page.reload();
    await expect(check(page)).not.toBeChecked();
    const afterReload = tasksServer.requests;
    await page.clock.runFor(30_000);
    expect(tasksServer.requests).toBe(afterReload);
  });

  test('picks up changes on the next tick', async ({ page, tasksServer }) => {
    tasksServer.use(standardWithT005Done());
    await page.clock.runFor(5_000);
    await expect(statNumber(page, 'Done')).toHaveText('6');
  });

  test('a changed interval applies immediately and is remembered', async ({ page, tasksServer }) => {
    await interval(page).fill('2');
    await interval(page).press('Tab');
    await page.clock.runFor(2_000);
    await requests(tasksServer).toBe(2);
    await page.clock.runFor(2_000);
    await requests(tasksServer).toBe(3);
    await page.reload();
    await expect(interval(page)).toHaveValue('2');
    await expect(check(page)).toBeChecked();
  });
});
