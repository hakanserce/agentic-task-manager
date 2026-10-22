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
  test.beforeEach(async ({ page, tasksServer }) => {
    await page.clock.install();
    await openDashboard(page, tasksServer, 'standard');
  });

  const requests = (tasksServer: { requests: number }) => expect.poll(() => tasksServer.requests);

  test('is off by default', async ({ page, tasksServer }) => {
    await expect(page.locator('#auto-refresh-check')).not.toBeChecked();
    await expect(page.locator('#auto-refresh-interval')).toHaveValue('5');
    await page.clock.runFor(30_000);
    expect(tasksServer.requests).toBe(1);
  });

  test('polls every 5 seconds when enabled and stops when disabled', async ({ page, tasksServer }) => {
    await page.locator('.auto-refresh-toggle').click();
    await expect(page.locator('#auto-refresh-check')).toBeChecked();
    await page.clock.runFor(5_000);
    await requests(tasksServer).toBe(2);
    await page.clock.runFor(5_000);
    await requests(tasksServer).toBe(3);

    await page.locator('.auto-refresh-toggle').click();
    await page.clock.runFor(30_000);
    await requests(tasksServer).toBe(3);
  });

  test('picks up changes on the next tick', async ({ page, tasksServer }) => {
    await page.locator('.auto-refresh-toggle').click();
    tasksServer.use(standardWithT005Done());
    await page.clock.runFor(5_000);
    await expect(statNumber(page, 'Done')).toHaveText('6');
  });

  test('changing the interval while enabled reschedules polling', async ({ page, tasksServer }) => {
    await page.locator('.auto-refresh-toggle').click();
    await page.locator('#auto-refresh-interval').fill('2');
    await page.locator('#auto-refresh-interval').press('Tab');
    await page.clock.runFor(2_000);
    await requests(tasksServer).toBe(2);
    await page.clock.runFor(2_000);
    await requests(tasksServer).toBe(3);
  });
});
