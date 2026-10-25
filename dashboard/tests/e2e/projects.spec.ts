// Several projects (docs/multi-project-dashboard-proposal.md 3.2, 3.5): the landing page, #project= links, switching
// between projects with their own saved views, and a project the server doesn't list.
import { expect, openDashboard, summary, test } from './helpers';

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

  test('the selector lists All projects and the projects, with progress; choosing one opens it', async ({
    page,
    tasksServer,
  }) => {
    tasksServer.addProject('second', 'minimal', 'Second Project', summary({ percent: 75 }));
    tasksServer.use('standard');
    await page.goto(`tasks-dashboard.html#project=second`);
    await page.locator('#project-selector').click();
    await expect(page.locator('#project-filter')).toBeFocused();
    await expect(page.locator('#project-options [role=option]')).toHaveText([
      'All projects',
      'Standard Project',
      'Second Project',
    ]);
    await expect(page.locator('[data-id="second"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-id="second"] .project-option-fill')).toHaveAttribute('style', /width: 75%/);
    await page.locator(`.project-option[data-id="${tasksServer.projectId}"]`).click();
    await expect(page.locator('#dashboard-title')).toHaveText('Standard Project — Task Dashboard');
    await expect(page.locator('#project-menu')).toHaveCount(0);
  });

  test('the selector by keyboard: type to filter, arrows, Enter; Escape closes', async ({ page, tasksServer }) => {
    tasksServer.addProject('second', 'minimal', 'Second Project').addProject('third', 'minimal', 'Third Project');
    await openDashboard(page, tasksServer, 'standard');
    await page.locator('.project-item[data-id="second"] a').click();
    await page.locator('#project-selector').click();
    await page.keyboard.type('thi');
    await expect(page.locator('#project-options [role=option]')).toHaveText(['Third Project']);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#project=third$/);

    await page.locator('#project-selector').click();
    await page.keyboard.press('Home');
    await expect(page.locator('#project-filter')).toHaveAttribute('aria-activedescendant', 'project-option-overview');
    await page.keyboard.press('Escape');
    await expect(page.locator('#project-menu')).toHaveCount(0);
    await expect(page.locator('#project-selector')).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    await expect(page.locator('#landing')).toHaveAttribute('data-page', 'overview');
  });

  test('a badge on the selector counts what needs you in the other projects', async ({ page, tasksServer }) => {
    tasksServer.addProject('second', 'minimal', 'Second', summary({ needs_you: { review: 2, blocked_on_user: 1 } }));
    tasksServer.addProject('third', 'minimal', 'Third', summary());
    await openDashboard(page, tasksServer, 'standard');
    await page.locator('.project-item[data-id="third"] a').click();
    await expect(page.locator('#other-projects-need')).toHaveText('3');
    await page.locator('#project-selector').click();
    await expect(page.locator('[data-id="second"] .project-option-dot')).toHaveCount(1);
    await expect(page.locator('[data-id="third"] .project-option-dot')).toHaveCount(0);
    await page.locator('.project-option[data-id="second"]').click();
    await expect(page.locator('#other-projects-need')).toHaveCount(0);
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
