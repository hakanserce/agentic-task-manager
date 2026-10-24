import { expect, filterButton, loadFixture, openDashboard, test } from './helpers';

// FR-5: the dashboard remembers each project's view (filters, tab, panel, Kanban options, Progress focus) and
// restores it when the dashboard is opened again. Projects are told apart by meta.id (else meta.project).
const project = (id: string) => {
  const data = loadFixture('standard');
  data.meta = { ...data.meta, id };
  return data;
};

test.describe('saved view', () => {
  test('filters, tab, Kanban options and the collapsed panel come back after a reload', async ({
    page,
    tasksServer,
  }) => {
    await openDashboard(page, tasksServer, project('p1'));
    await filterButton(page, 'phase', '1').click();
    await filterButton(page, 'type', 'feature').click();
    await page.locator('#tab-kanban').click();
    await page.locator('#kanban-group-by-phase').check();
    await page.locator('#kanban-show-skipped').check();

    await page.goto('tasks-dashboard.html'); // no #view=: the saved tab applies
    await expect(filterButton(page, 'phase', '1')).toHaveClass(/\bactive\b/);
    await expect(filterButton(page, 'type', 'feature')).toHaveClass(/\bactive\b/);
    await expect(page.locator('.phase-count')).toHaveText('2 of 12 shown');
    await expect(page.locator('#tab-kanban')).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/#view=kanban$/);
    await expect(page.locator('#kanban-group-by-phase')).toBeChecked();
    await expect(page.locator('#kanban-show-skipped')).toBeChecked();

    await page.locator('.view-header .chevron').click();
    await page.reload();
    await expect(page.locator('.view-panels')).toBeHidden();
  });

  test('the focused phase on the Progress tab is remembered', async ({ page, tasksServer }) => {
    await page.clock.setFixedTime(new Date('2026-04-06T12:00:00Z'));
    const data = loadFixture('progress');
    data.meta = { ...data.meta, id: 'prog' };
    await openDashboard(page, tasksServer, data);
    await page.locator('#tab-progress').click();
    await page.locator('#phase-table tbody tr').nth(1).click();
    const focused = await page.locator('#burndown-focus').textContent();
    expect(focused).toMatch(/^Phase \d+$/);
    await page.reload();
    await expect(page.locator('#burndown-focus')).toHaveText(focused!);
  });

  test('each project keeps its own view on the same origin', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, project('p1'));
    await filterButton(page, 'phase', '2').click();
    tasksServer.use(project('p2'));
    await page.reload();
    await expect(page.locator('.filter-btn.active')).toHaveCount(3); // the three "All" buttons
    tasksServer.use(project('p1'));
    await page.reload();
    await expect(filterButton(page, 'phase', '2')).toHaveClass(/\bactive\b/);
  });

  test('a #view= link wins over the saved tab', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, project('p1'));
    await page.locator('#tab-progress').click();
    await page.goto('tasks-dashboard.html#view=kanban');
    await page.reload();
    await expect(page.locator('#tab-kanban')).toHaveAttribute('aria-selected', 'true');
  });

  test('values that no longer exist are dropped quietly', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, project('p1'));
    await filterButton(page, 'type', 'polish').click();
    await filterButton(page, 'phase', '2').click();
    const data = project('p1');
    data.tasks = data.tasks.filter((t) => t.type !== 'polish');
    tasksServer.use(data);
    await page.reload();
    await expect(filterButton(page, 'phase', '2')).toHaveClass(/\bactive\b/);
    await expect(filterButton(page, 'type', 'all')).toHaveClass(/\bactive\b/);
    await expect(page.locator('.phase-count')).toHaveText('3 of 11 shown');
  });

  test('Reset view forgets the saved view', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, project('p1'));
    await filterButton(page, 'status', 'todo').click();
    await page.locator('#tab-kanban').click();
    await page.locator('#reset-view').click();
    await expect(page.locator('.filter-btn.active')).toHaveCount(3);
    await expect(page.locator('#tab-graph')).toHaveAttribute('aria-selected', 'true');
    await page.goto('tasks-dashboard.html');
    await expect(page.locator('.phase-count')).toHaveText('12 of 12 shown');
  });

  test('a task file without meta.id falls back to the project name', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    await filterButton(page, 'phase', '0').click();
    const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes(':view:')));
    expect(stored).toEqual(['atm-dashboard:view:project:Standard Project']);
  });
});
