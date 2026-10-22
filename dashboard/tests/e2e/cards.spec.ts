import { expect, loadFixture, openDashboard, test, visibleCardIds } from './helpers';

const card = (page: import('@playwright/test').Page, id: string) => page.locator(`.task-card[data-id="${id}"]`);

test.describe('task cards', () => {
  test('one card per task, in file order', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    expect(await visibleCardIds(page)).toEqual([
      'T-001',
      'T-002',
      'T-003',
      'T-004',
      'T-005',
      'T-006',
      'T-007',
      'T-008',
      'T-009',
      'T-010',
      'T-011',
      'T-012',
    ]);
    await expect(page.locator('.phase-count')).toHaveText('12 of 12 shown');
  });

  test('card content: id, name, badges, dependencies and tags', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    const c = card(page, 'T-004');
    await expect(c).toHaveAttribute('id', 'task-T-004');
    await expect(c).toHaveClass(/status-done/);
    await expect(c.locator('.task-id')).toHaveText('T-004');
    await expect(c.locator('.task-name')).toHaveText('User login');
    await expect(c.locator('.task-meta .badge')).toHaveText(['P1', 'feature', 'done']);
    await expect(c.locator('.deps-label')).toHaveText('needs:');
    await expect(c.locator('.dep-link')).toHaveText(['T-002', 'T-003']);
    await expect(c.locator('.dep-link').first()).toHaveAttribute('title', 'Write contributing guide');
    await expect(c.locator('.uc-badge')).toHaveText(['UC-001']);
    await expect(c.locator('.req-badge')).toHaveText(['FR-1.1', 'FR-1.2']);
  });

  test('status classes and labels', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    const expected = { 'T-005': 'in_progress', 'T-006': 'todo', 'T-007': 'blocked', 'T-010': 'skipped' };
    for (const [id, status] of Object.entries(expected)) {
      await expect(card(page, id)).toHaveClass(new RegExp(`status-${status}`));
      await expect(card(page, id).locator('.task-meta .badge').nth(2)).toHaveText(status.replace('_', ' '));
    }
  });

  test('tasks without dependencies have no "needs:" label', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    await expect(card(page, 'T-001').locator('.deps-label')).toHaveCount(0);
    await expect(card(page, 'T-001').locator('.task-tags')).toBeEmpty();
  });

  test('dependency link scrolls to and briefly highlights the target', async ({ page, tasksServer }) => {
    // Make the last card depend on the first so the link has to scroll the page
    const data = loadFixture('large-90');
    data.tasks[89].dependencies = ['T-001'];
    await openDashboard(page, tasksServer, data);

    const target = card(page, 'T-001');
    await card(page, 'T-090').scrollIntoViewIfNeeded();
    await expect(target).not.toBeInViewport();

    await card(page, 'T-090').locator('.dep-link', { hasText: 'T-001' }).click();
    await expect(target).toBeInViewport();
    await expect(target).toHaveCSS('border-top-color', 'rgb(210, 153, 34)');
    // Real time on purpose: page.clock would also freeze the smooth scroll and the border-color transition
    await expect(target).not.toHaveCSS('border-top-color', 'rgb(210, 153, 34)', { timeout: 4000 });
  });
});
