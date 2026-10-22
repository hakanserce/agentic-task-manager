import { expect, filterButton, openDashboard, test, visibleCardIds } from './helpers';

test.describe('filters', () => {
  test.beforeEach(async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
  });

  test('buttons are generated from the data', async ({ page }) => {
    const labels = (group: string) => page.locator(`.filter-btn[data-filter="${group}"]`).allTextContents();
    expect(await labels('phase')).toEqual(['All', '0', '1', '2']);
    expect(await labels('type')).toEqual(['All', 'Bugfix', 'Docs', 'Feature', 'Infra', 'Polish', 'Refactor', 'Test']);
    expect(await labels('status')).toEqual(['All', 'Todo', 'In progress', 'Done', 'Blocked', 'Skipped']);
    await expect(page.locator('.filter-btn.active')).toHaveCount(3);
  });

  test('selecting a value filters cards and updates the count', async ({ page }) => {
    await filterButton(page, 'phase', '1').click();
    expect(await visibleCardIds(page)).toEqual(['T-004', 'T-005', 'T-006', 'T-007']);
    await expect(page.locator('.phase-count')).toHaveText('4 of 12 shown');
  });

  test('values within a group are OR-ed', async ({ page }) => {
    await filterButton(page, 'phase', '1').click();
    await filterButton(page, 'phase', '2').click();
    await expect(page.locator('.phase-count')).toHaveText('8 of 12 shown');
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
    await expect(page.locator('.phase-count')).toHaveText('5 of 12 shown');
    await filterButton(page, 'status', 'done').click();
    await expect(page.locator('.phase-count')).toHaveText('12 of 12 shown');
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
    await expect(page.locator('#dep-graph g')).toHaveCount(4);
    await expect(page.locator('#graph-badge')).toHaveText('4 tasks');
  });

  test('no matches shows a message in the grid and the graph', async ({ page }) => {
    await filterButton(page, 'status', 'blocked').click();
    await filterButton(page, 'type', 'docs').click();
    await expect(page.locator('.task-card')).toHaveCount(0);
    await expect(page.locator('#phases')).toContainText('No tasks match current filters');
    await expect(page.locator('.phase-count')).toHaveText('0 of 12 shown');
    await expect(page.locator('#dep-graph')).toContainText('No tasks match current filters');
    await expect(page.locator('#graph-badge')).toHaveText('0 tasks');
  });
});

test('unknown statuses sort after the known ones', async ({ page, tasksServer }) => {
  await openDashboard(page, tasksServer, 'edge-cases');
  const labels = await page.locator('.filter-btn[data-filter="status"]').allTextContents();
  expect(labels).toEqual(['All', 'Todo', 'Done', 'Review']);
});
