// The archive (D-5.2 to D-5.4): tasks-archive.json is loaded only when a view needs history.
import { expect, loadFixture, matchCount, openDashboard, test, type TasksData } from './helpers';

/** standard.json after `atm archive` moved three tasks: meta.archived says so, and T-001 depends on one of them */
function archivedProject(): TasksData {
  const data = loadFixture('standard');
  data.meta = { ...data.meta, archived: 3 };
  data.tasks.find((t) => t.id === 'T-001')!.dependencies = ['T-090'];
  return data;
}

test.describe('archive', () => {
  test('is not loaded by the lists; the header counts it from meta', async ({ page, tasksServer }) => {
    tasksServer.archive('archive');
    await openDashboard(page, tasksServer, archivedProject(), { tab: 'list' });
    await expect(page.locator('#archived-count')).toHaveText('3 archived');
    await expect(page.locator('#subtitle')).toContainText('12 tasks across 3 phases · 3 archived — loaded');
    await expect(page.locator('.task-card')).toHaveCount(12);
    await page.getByRole('tab', { name: 'Kanban Board' }).click();
    await page.getByRole('tab', { name: 'Dependency Graph' }).click();
    expect(tasksServer.archiveRequests).toBe(0);
  });

  test('"Include archived" loads it: search, lists and the graph show archived tasks', async ({
    page,
    tasksServer,
  }) => {
    tasksServer.archive('archive');
    await openDashboard(page, tasksServer, archivedProject(), { tab: 'list' });
    await page.locator('#include-archived').check();
    await expect(page.locator('.task-card')).toHaveCount(15);
    await expect(matchCount(page)).toHaveText('15 of 15 tasks');
    expect(tasksServer.archiveRequests).toBe(1);
    await page.locator('#task-search').fill('guidelines');
    await expect(page.locator('.task-card')).toHaveCount(1);
    await page.locator('.task-card[data-id="T-091"] .task-name').click();
    await expect(page.locator('#detail-archived')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('#task-search').fill('');
    await page.getByRole('tab', { name: 'Dependency Graph' }).click();
    await expect(page.locator('#dep-graph [data-id="T-090"]')).toHaveCount(1);
  });

  test('the Progress tab loads it and counts archived tasks', async ({ page, tasksServer }) => {
    tasksServer.archive('archive');
    await openDashboard(page, tasksServer, archivedProject(), { tab: 'progress' });
    await expect.poll(() => tasksServer.archiveRequests).toBe(1);
  });

  test('a dependency on an archived task is a stub in the detail panel', async ({ page, tasksServer }) => {
    tasksServer.archive('archive');
    await openDashboard(page, tasksServer, archivedProject(), { tab: 'list' });
    await page.locator('.task-card[data-id="T-001"] .task-name').click();
    await expect(page.locator('.detail-dep-item[data-archived="T-090"]')).toHaveText(/T-090\s*· archived, done/);
  });

  test('without an archive: no count, no toggle, nothing fetched', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard', { tab: 'progress' });
    await expect(page.locator('#progress')).toBeVisible();
    await expect(page.locator('#archived-count')).toHaveCount(0);
    await expect(page.locator('#include-archived')).toHaveCount(0);
    expect(tasksServer.archiveRequests).toBe(0);
  });

  test('the footer says when tasks.json has grown past the archive threshold', async ({ page, tasksServer }) => {
    const data = loadFixture('standard');
    data.meta = { ...data.meta, archive: { threshold_tasks: 2, keep_days: 0 } };
    await openDashboard(page, tasksServer, data);
    await expect(page.locator('#archive-notice')).toContainText('`atm archive` would move 6 finished tasks');
  });
});
