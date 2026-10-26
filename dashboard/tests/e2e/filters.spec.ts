import { expect, filterButton, matchCount, openDashboard, openFilters, test, visibleCardIds } from './helpers';

test.describe('filters', () => {
  test.beforeEach(async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard', { tab: 'list' });
    await openFilters(page);
  });

  test("buttons are generated from the data, in the vocabulary's order and with its labels", async ({ page }) => {
    const labels = (group: string) =>
      page.locator(`.filter-btn[data-filter="${group}"] .filter-label`).allTextContents();
    expect(await labels('phase')).toEqual(['All', '0', '1', '2']);
    expect(await labels('type')).toEqual(['All', 'Feature', 'Bugfix', 'Test', 'Infra', 'Docs', 'Refactor', 'Polish']);
    expect(await labels('status')).toEqual(['All', 'To Do', 'In Progress', 'In Review', 'Blocked', 'Done', 'Skipped']);
    expect(await labels('priority')).toEqual(['All', 'P2 Medium']);
    await expect(page.locator('.filter-btn.active')).toHaveCount(4);
  });

  test('selecting a value filters cards and updates the count', async ({ page }) => {
    await filterButton(page, 'phase', '1').click();
    expect(await visibleCardIds(page)).toEqual(['T-004', 'T-005', 'T-006', 'T-007']);
    await expect(matchCount(page)).toHaveText('4 of 12 tasks');
  });

  test('values within a group are OR-ed', async ({ page }) => {
    await filterButton(page, 'phase', '1').click();
    await filterButton(page, 'phase', '2').click();
    await expect(matchCount(page)).toHaveText('8 of 12 tasks');
  });

  test('groups are AND-ed', async ({ page }) => {
    await filterButton(page, 'phase', '1').click();
    await filterButton(page, 'phase', '2').click();
    await filterButton(page, 'type', 'test').click();
    expect(await visibleCardIds(page)).toEqual(['T-009']);
  });

  test('"All" clears only its own group', async ({ page }) => {
    await filterButton(page, 'phase', '2').click();
    await filterButton(page, 'type', 'test').click();
    await filterButton(page, 'phase', 'all').click();
    expect(await visibleCardIds(page)).toEqual(['T-003', 'T-009']);
  });

  test('clicking an active value deselects it', async ({ page }) => {
    await filterButton(page, 'status', 'done').click();
    await expect(matchCount(page)).toHaveText('5 of 12 tasks');
    await filterButton(page, 'status', 'done').click();
    await expect(matchCount(page)).toHaveText('12 of 12 tasks');
    await expect(filterButton(page, 'status', 'all')).toHaveClass(/active/);
  });

  test('active state stays in sync', async ({ page }) => {
    const all = filterButton(page, 'type', 'all');
    const feature = filterButton(page, 'type', 'feature');
    await expect(all).toHaveClass(/active/);
    await feature.click();
    await expect(feature).toHaveClass(/active/);
    await expect(all).not.toHaveClass(/active/);
    await all.click();
    await expect(all).toHaveClass(/active/);
    await expect(feature).not.toHaveClass(/active/);
  });

  test('filters also apply to the dependency graph', async ({ page }) => {
    await filterButton(page, 'phase', '0').click();
    await page.locator('#tab-graph').click();
    await expect(page.locator('#dep-graph g.graph-node')).toHaveCount(4);
  });

  test('no matches shows a message in the grid and the graph', async ({ page }) => {
    await filterButton(page, 'status', 'blocked').click();
    await filterButton(page, 'type', 'docs').click();
    await expect(page.locator('.task-card')).toHaveCount(0);
    await expect(page.locator('#phases')).toContainText('No tasks match current filters');
    await expect(matchCount(page)).toHaveText('0 of 12 tasks');
    await expect(page.locator('#dep-graph')).toContainText('No tasks match current filters');
  });
});

test('unknown statuses sort after the known ones', async ({ page, tasksServer }) => {
  await openDashboard(page, tasksServer, 'edge-cases');
  await openFilters(page);
  const labels = await page.locator('.filter-btn[data-filter="status"] .filter-label').allTextContents();
  expect(labels).toEqual(['All', 'To Do', 'In Progress', 'In Review', 'Blocked', 'Done', 'Skipped', 'Review']);
});

test('the Status filter offers every status of the project, also when all tasks are done', async ({
  page,
  tasksServer,
}) => {
  const task = (id: string) => ({ id, name: id, phase: 0, type: 'feature', description: '', status: 'done' });
  await openDashboard(page, tasksServer, { meta: { project: 'Finished' }, tasks: [task('T-1'), task('T-2')] });
  await openFilters(page);
  const labels = await page.locator('.filter-btn[data-filter="status"] .filter-label').allTextContents();
  expect(labels).toEqual(['All', 'To Do', 'In Progress', 'In Review', 'Blocked', 'Done', 'Skipped']);
  await filterButton(page, 'status', 'todo').click();
  await expect(matchCount(page)).toHaveText('0 of 2 tasks');
});

test.describe('filter counts', () => {
  test.beforeEach(async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    await openFilters(page);
  });

  const count = (page: import('@playwright/test').Page, group: 'phase' | 'type' | 'status', value: string) =>
    filterButton(page, group, value).locator('.filter-count');

  test('every button shows how many tasks it would show', async ({ page }) => {
    await expect(count(page, 'phase', 'all')).toHaveText('12');
    await expect(count(page, 'phase', '1')).toHaveText('4');
    await expect(count(page, 'type', 'feature')).toHaveText('3');
    await expect(count(page, 'status', 'done')).toHaveText('5');
  });

  test('counts follow the selections in the other groups, not their own', async ({ page }) => {
    await filterButton(page, 'phase', '1').click();
    await expect(count(page, 'phase', '2')).toHaveText('4'); // its own group: unchanged
    await expect(count(page, 'type', 'all')).toHaveText('4');
    await expect(count(page, 'type', 'feature')).toHaveText('2');
    await expect(count(page, 'status', 'todo')).toHaveText('1');
  });

  test('values with no tasks are dimmed but can still be selected', async ({ page }) => {
    await filterButton(page, 'phase', '0').click();
    const feature = filterButton(page, 'type', 'feature');
    await expect(feature.locator('.filter-count')).toHaveText('0');
    await expect(feature).toHaveClass(/\bempty\b/);
    await feature.click();
    await expect(feature).toHaveClass(/\bactive\b/);
    await expect(feature).not.toHaveClass(/\bempty\b/);
    await expect(matchCount(page)).toHaveText('0 of 12 tasks');
  });

  test('screen readers hear the count', async ({ page }) => {
    await expect(filterButton(page, 'type', 'feature')).toHaveAccessibleName('Feature, 3 tasks');
    await expect(filterButton(page, 'phase', '1')).toHaveAccessibleName('Phase 1, 4 tasks');
    await expect(filterButton(page, 'status', 'all')).toHaveAccessibleName('All statuses, 12 tasks');
    await expect(filterButton(page, 'status', 'blocked')).toHaveAccessibleName('Blocked, 1 task');
    await expect(filterButton(page, 'type', 'feature')).toHaveAttribute('aria-pressed', 'false');
  });

  test('counts update on reload', async ({ page, tasksServer }) => {
    const data = (await import('./helpers')).loadFixture('standard');
    data.tasks.push({ ...data.tasks[0], id: 'T-099', type: 'feature' });
    tasksServer.use(data);
    await page.locator('#reload-btn').click();
    await expect(count(page, 'type', 'feature')).toHaveText('4');
    await expect(count(page, 'phase', 'all')).toHaveText('13');
  });
});

test.describe('compact filter line', () => {
  test.beforeEach(async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard', { tab: 'list' });
  });

  test('shows only what is selected; the toggle opens and closes the panel', async ({ page }) => {
    const toggle = page.locator('#filters-toggle');
    await expect(page.locator('#filter-panel')).toHaveCount(0);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#active-filters')).toHaveText('No filters');

    await openFilters(page);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.filter-group')).toHaveText([/^Phase/, /^Type/, /^Status/, /^Priority/]);
    await filterButton(page, 'phase', '1').click();
    await filterButton(page, 'phase', '2').click();
    await filterButton(page, 'type', 'test').click();
    await toggle.click();
    await expect(page.locator('#filter-panel')).toHaveCount(0);

    const chips = page.locator('.filter-chip');
    await expect(chips).toHaveText(['Phase: 1, 2', 'Type: Test']);
    await expect(matchCount(page)).toHaveText('1 of 12 tasks');
    await chips.filter({ hasText: 'Phase' }).getByRole('button', { name: 'Clear Phase filter' }).click();
    await expect(chips).toHaveText(['Type: Test']);
    await expect(matchCount(page)).toHaveText('2 of 12 tasks');
  });

  test('the keyword search narrows every view and the filter counts', async ({ page }) => {
    await page.locator('#task-search').fill('login');
    expect(await visibleCardIds(page)).toEqual(['T-004']);
    await expect(matchCount(page)).toHaveText('1 of 12 tasks');
    await openFilters(page);
    await expect(filterButton(page, 'type', 'feature').locator('.filter-count')).toHaveText('1');

    // Every word has to match, in the ID, name, description or type
    await page.locator('#task-search').fill('t-00 docs');
    expect(await visibleCardIds(page)).toEqual(['T-002']);

    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(page.locator('#task-search')).toHaveValue('');
    await expect(matchCount(page)).toHaveText('12 of 12 tasks');
  });
});
