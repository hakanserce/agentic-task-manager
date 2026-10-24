import type { Page } from '@playwright/test';
import { expect, filterButton, loadFixture, openDashboard, openFilters, test } from './helpers';

const column = (page: Page, status: string) => page.locator(`.kanban-column[data-status="${status}"]`);
const cardIds = (page: Page, status: string) =>
  column(page, status)
    .locator('.kanban-card')
    .evaluateAll((cards) => cards.map((c) => (c as HTMLElement).dataset.id));
const card = (page: Page, id: string) => page.locator(`.kanban-card[data-id="${id}"]`);

async function openKanban(
  page: Page,
  tasksServer: Parameters<typeof openDashboard>[1],
  data: Parameters<typeof openDashboard>[2],
) {
  await openDashboard(page, tasksServer, data);
  await page.locator('#tab-kanban').click();
  await expect(page.locator('#kanban')).toBeVisible();
}

test.describe('Kanban board', () => {
  test('status columns with counts; Other only for unknown statuses', async ({ page, tasksServer }) => {
    await openKanban(page, tasksServer, 'kanban');
    const columns = await page
      .locator('.kanban-column')
      .evaluateAll((cols) => cols.map((c) => (c as HTMLElement).dataset.status));
    expect(columns).toEqual(['todo', 'in_progress', 'blocked', 'done', 'other']);
    await expect(page.locator('.kanban-column-title')).toHaveText(['Todo', 'In Progress', 'Blocked', 'Done', 'Other']);
    await expect(page.locator('.kanban-count')).toHaveText(['6', '3', '2', '24', '1']);
  });

  test('cards are ordered like the loop works', async ({ page, tasksServer }) => {
    await openKanban(page, tasksServer, 'kanban');
    // Todo: ready first (by phase, then ID), then waiting
    expect(await cardIds(page, 'todo')).toEqual(['T-029', 'T-028', 'T-032', 'T-030', 'T-031', 'T-033']);
    // In progress: most recently started first
    expect(await cardIds(page, 'in_progress')).toEqual(['T-027', 'T-025', 'T-026']);
    // Done: most recently completed first
    expect((await cardIds(page, 'done')).slice(0, 3)).toEqual(['T-024', 'T-023', 'T-022']);
    expect(await cardIds(page, 'blocked')).toEqual(['T-035', 'T-034']);
  });

  test('todo cards show readiness', async ({ page, tasksServer }) => {
    await openKanban(page, tasksServer, 'kanban');
    await expect(card(page, 'T-029').locator('.kanban-readiness')).toHaveText('Ready');
    await expect(card(page, 'T-030').locator('.kanban-readiness')).toHaveText('Waiting on T-025, T-026');
    await expect(card(page, 'T-031').locator('.kanban-readiness')).toHaveText('Waiting on T-999');
    await expect(card(page, 'T-025').locator('.kanban-readiness')).toHaveCount(0);
  });

  test('Next up marks the task the loop would pick, and moves when it is done', async ({ page, tasksServer }) => {
    await openKanban(page, tasksServer, 'kanban');
    await expect(page.locator('.kanban-card.next-up')).toHaveCount(1);
    await expect(card(page, 'T-029')).toHaveClass(/next-up/);
    await expect(card(page, 'T-029').locator('.kanban-next-up')).toHaveText('Next up');

    const data = loadFixture('kanban');
    data.tasks.find((t) => t.id === 'T-029')!.status = 'done';
    tasksServer.use(data);
    await page.locator('#reload-btn').click();
    await expect(card(page, 'T-028')).toHaveClass(/next-up/);
    await expect(page.locator('.kanban-card.next-up')).toHaveCount(1);
  });

  test('Next up for the standard fixture', async ({ page, tasksServer }) => {
    await openKanban(page, tasksServer, 'standard');
    await expect(page.locator('.kanban-card.next-up')).toHaveAttribute('data-id', 'T-006');
  });

  test('clicking a card or pressing Enter on it opens its details', async ({ page, tasksServer }) => {
    await openKanban(page, tasksServer, 'kanban');
    await card(page, 'T-030').click();
    await expect(page.locator('#detail-panel h3')).toHaveText('T-030 Waiting on work in progress');
    await page.keyboard.press('Escape');
    await card(page, 'T-025').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#detail-panel h3')).toHaveText('T-025 Build the board');
  });

  test('skipped tasks are hidden behind a toggle', async ({ page, tasksServer }) => {
    await openKanban(page, tasksServer, 'kanban');
    await expect(column(page, 'skipped')).toHaveCount(0);
    await page.locator('#kanban-show-skipped').check();
    await expect(column(page, 'skipped').locator('.kanban-card')).toHaveCount(2);
  });

  test('Done shows the 20 most recent tasks until "Show all"', async ({ page, tasksServer }) => {
    await openKanban(page, tasksServer, 'kanban');
    await expect(column(page, 'done').locator('.kanban-card')).toHaveCount(20);
    await column(page, 'done').getByRole('button', { name: 'Show all (24)' }).click();
    await expect(column(page, 'done').locator('.kanban-card')).toHaveCount(24);
    await expect(column(page, 'done').getByRole('button', { name: /Show all/ })).toHaveCount(0);
    await column(page, 'done').getByRole('button', { name: 'Show the latest 20' }).click();
    await expect(column(page, 'done').locator('.kanban-card')).toHaveCount(20);
  });

  test('filters apply; a status filter limits the columns', async ({ page, tasksServer }) => {
    await openKanban(page, tasksServer, 'kanban');
    await openFilters(page);
    await filterButton(page, 'phase', '2').click();
    await expect(page.locator('.kanban-count')).toHaveText(['3', '1', '1', '0', '1']);
    await expect(column(page, 'done').locator('.kanban-empty')).toHaveText('No tasks');
    await filterButton(page, 'phase', 'all').click();
    await filterButton(page, 'status', 'done').click();
    await filterButton(page, 'status', 'blocked').click();
    const columns = await page
      .locator('.kanban-column')
      .evaluateAll((cols) => cols.map((c) => (c as HTMLElement).dataset.status));
    expect(columns).toEqual(['blocked', 'done']);
  });
});

test.describe('Kanban: group by phase', () => {
  const lanes = (page: Page) => page.locator('.kanban-lane');

  test('one swimlane per phase, with progress and aligned columns; remembered', async ({ page, tasksServer }) => {
    await openKanban(page, tasksServer, 'kanban');
    await page.locator('#kanban-group-by-phase').check();
    await expect(lanes(page)).toHaveCount(3);
    await expect(page.locator('.kanban-lane-header')).toHaveText([
      /Phase 0\s*16\/16 done/,
      /Phase 1\s*8\/15 done/,
      /Phase 2\s*0\/7 done/,
    ]);
    for (const lane of await lanes(page).all()) {
      await expect(lane.locator('.kanban-column-title')).toHaveText([
        'Todo',
        'In Progress',
        'Blocked',
        'Done',
        'Other',
      ]);
    }
    await expect(
      page.locator('.kanban-lane[data-phase="1"] .kanban-column[data-status="todo"] .kanban-card'),
    ).toHaveCount(3);

    await page.reload();
    await page.locator('#tab-kanban').click();
    await expect(page.locator('#kanban-group-by-phase')).toBeChecked();
    await expect(lanes(page)).toHaveCount(3);
  });
});
