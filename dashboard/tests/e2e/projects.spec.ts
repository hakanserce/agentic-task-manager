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
    await expect(page.locator('#projects-grid .project-card')).toHaveCount(2);
    await page.locator('.project-card[data-id="second"] .project-card-open').click();
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
    await page.locator('.project-card[data-id="second"] .project-card-open').click();
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
    await page.locator('.project-card[data-id="third"] .project-card-open').click();
    await expect(page.locator('#other-projects-need')).toHaveText('3');
    await page.locator('#project-selector').click();
    await expect(page.locator('[data-id="second"] .project-option-dot')).toHaveCount(1);
    await expect(page.locator('[data-id="third"] .project-option-dot')).toHaveCount(0);
    await page.locator('.project-option[data-id="second"]').click();
    await expect(page.locator('#other-projects-need')).toHaveCount(0);
  });

  test('overview cards: progress, current phase, agents, last activity; needs you first', async ({
    page,
    tasksServer,
  }) => {
    await page.clock.setFixedTime(new Date('2026-01-01T12:00:00Z'));
    tasksServer
      .addProject(
        'busy',
        'minimal',
        'Busy',
        summary({
          total: 20,
          done: 9,
          skipped: 2,
          percent: 50,
          current_phase: { id: 3, name: 'Polish', done: 1, total: 4 },
          agents_working: 2,
          last_activity: '2026-01-01T11:48:00Z',
        }),
      )
      .addProject('asks', 'minimal', 'Asks', summary({ needs_you: { review: 1, blocked_on_user: 1 } }));
    await openDashboard(page, tasksServer, 'standard');
    const cards = page.locator('.project-card');
    await expect(cards.locator('.project-card-name')).toHaveText(['Asks', 'Busy', 'Standard Project']);
    const busy = page.locator('.project-card[data-id="busy"]');
    await expect(busy.locator('.project-card-counts')).toHaveText(/9 \/ 18\s*· 2 skipped\s*50%/);
    await expect(busy.locator('.project-card-phase')).toHaveText('Phase 3 · Polish — 1 / 4');
    await expect(busy.locator('.project-card-agents')).toHaveText('2 agents working');
    await expect(busy.locator('.project-card-last')).toHaveText('12 m ago');
    await expect(page.locator('.project-card[data-id="asks"] .project-card-need')).toHaveText('2 need you');
  });

  test('“needs you” opens the project’s Kanban, filtered to review and blocked', async ({ page, tasksServer }) => {
    tasksServer.addProject('asks', 'v4', 'Asks', summary({ needs_you: { review: 1, blocked_on_user: 1 } }));
    await openDashboard(page, tasksServer, 'standard');
    await page.locator('.project-card[data-id="asks"] .project-card-need').click();
    await expect(page).toHaveURL(/project=asks/);
    await expect(page.locator('#tab-kanban')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.filter-chip')).toHaveText(['Status: In Review, Blocked']);
  });

  test('Active only hides projects with nothing open and nothing done lately; remembered', async ({
    page,
    tasksServer,
  }) => {
    await page.clock.setFixedTime(new Date('2026-03-01T12:00:00Z'));
    const idle = summary({
      total: 5,
      done: 5,
      percent: 100,
      current_phase: null,
      last_activity: '2026-01-01T00:00:00Z',
    });
    tasksServer.addProject('idle', 'minimal', 'Idle', idle).addProject('open', 'minimal', 'Open', summary());
    await openDashboard(page, tasksServer, 'standard');
    await expect(page.locator('#active-projects-only')).toBeChecked();
    await expect(page.locator('.project-card[data-id="idle"]')).toHaveCount(0);
    await expect(page.locator('#projects-hidden')).toHaveText('1 inactive project hidden');
    await page.locator('#active-projects-only').uncheck();
    await expect(page.locator('.project-card[data-id="idle"] .project-card-phase')).toHaveText(
      'Every phase is finished',
    );
    await page.reload();
    await expect(page.locator('#active-projects-only')).not.toBeChecked();
  });

  test('a project whose folder is gone says how to remove it', async ({ page, tasksServer }) => {
    tasksServer.addProject('open', 'minimal', 'Open', summary()).goneProject('old1234', 'Old Project');
    await openDashboard(page, tasksServer, 'standard');
    await expect(page.locator('.project-card[data-id="old1234"]')).toContainText('atm projects remove old1234');
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
