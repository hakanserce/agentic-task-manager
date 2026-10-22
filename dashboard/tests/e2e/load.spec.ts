import { expect, openDashboard, test } from './helpers';

test.describe('loading tasks.json', () => {
  test('uses meta.project for the page and heading titles', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    await expect(page).toHaveTitle('Standard Project — Task Dashboard');
    await expect(page.locator('#dashboard-title')).toHaveText('Standard Project — Task Dashboard');
  });

  test('subtitle counts tasks and phases', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    await expect(page.locator('#subtitle')).toHaveText('12 tasks across 3 phases — loaded from tasks.json');
  });

  test('subtitle uses singular "phase" (but always "tasks")', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'minimal');
    await expect(page.locator('#subtitle')).toHaveText('1 tasks across 1 phase — loaded from tasks.json');
  });

  test('falls back to "Task Dashboard" without meta', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'no-meta');
    await expect(page).toHaveTitle('Task Dashboard — Task Dashboard');
    await expect(page.locator('#dashboard-title')).toHaveText('Task Dashboard — Task Dashboard');
  });

  test('fetches tasks.json with a cache-busting query', async ({ page, tasksServer }) => {
    const request = page.waitForRequest(/\/tasks\.json\?\d+$/);
    await openDashboard(page, tasksServer, 'minimal');
    await request;
  });

  test('shows server instructions when tasks.json is missing', async ({ page, tasksServer }) => {
    tasksServer.fail(404);
    await page.goto('tasks-dashboard.html');
    const error = page.locator('#phases');
    await expect(error).toContainText('Failed to load tasks.json');
    await expect(error).toContainText('HTTP 404');
    await expect(error).toContainText('python3 -m http.server 8000');
    await expect(error).toContainText('http://localhost:8000/tasks-dashboard.html');
  });

  test('shows the error box for invalid JSON', async ({ page }) => {
    await page.route(/\/tasks\.json(\?.*)?$/, (route) => route.fulfill({ body: '{ not json' }));
    await page.goto('tasks-dashboard.html');
    await expect(page.locator('#phases')).toContainText('Failed to load tasks.json');
  });
});
