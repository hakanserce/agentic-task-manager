// Several projects (docs/multi-project-dashboard-proposal.md 3.2, 3.5): the landing page, #project= links, switching
// between projects with their own saved views, and a project the server doesn't list.
import { expect, openDashboard, test } from './helpers';

test.describe('projects', () => {
  test('with several projects, the dashboard lands on the overview; a project opens from it', async ({
    page,
    tasksServer,
  }) => {
    tasksServer.addProject('second', 'minimal', 'Second Project');
    await openDashboard(page, tasksServer, 'standard');
    await expect(page.locator('#landing')).toHaveAttribute('data-page', 'overview');
    await expect(page).toHaveTitle('All projects — Task Dashboard');
    await expect(page.locator('#project-list .project-item')).toHaveCount(2);
    await page.locator('.project-item[data-id="second"] a').click();
    await expect(page).toHaveURL(/#project=second$/);
    await expect(page.locator('#dashboard-title')).toHaveText('Minimal Project — Task Dashboard');
    await page.goBack();
    await expect(page.locator('#landing')).toHaveAttribute('data-page', 'overview');
  });

  test('with one project, the dashboard opens it right away', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    await expect(page.locator('#dashboard-title')).toHaveText('Standard Project — Task Dashboard');
    await expect(page.locator('#landing')).toHaveCount(0);
  });

  test('#project= links to a project; switching keeps each project’s own view', async ({ page, tasksServer }) => {
    tasksServer.addProject('second', 'minimal', 'Second Project');
    tasksServer.use('standard');
    await page.goto('tasks-dashboard.html#project=second');
    await expect(page.locator('#dashboard-title')).toHaveText('Minimal Project — Task Dashboard');
    await page.locator('#task-search').fill('nothing matches this');
    await expect(page.locator('.task-card')).toHaveCount(0);

    await page.evaluate((id) => (location.hash = `#project=${id}`), tasksServer.projectId);
    await expect(page.locator('#dashboard-title')).toHaveText('Standard Project — Task Dashboard');
    await expect(page.locator('#task-search')).toHaveValue('');

    await page.evaluate(() => (location.hash = '#project=second'));
    await expect(page.locator('#dashboard-title')).toHaveText('Minimal Project — Task Dashboard');
    await expect(page.locator('#task-search')).toHaveValue('nothing matches this');
  });

  test('a project the server doesn’t list has its own page, with a way back to all projects', async ({
    page,
    tasksServer,
  }) => {
    tasksServer.use('standard');
    await page.goto('tasks-dashboard.html#project=gone123');
    await expect(page.locator('#unknown-project')).toContainText('No project “gone123”');
    await page.locator('#unknown-project a').click();
    await expect(page.locator('#landing')).toHaveAttribute('data-page', 'overview');
  });
});
