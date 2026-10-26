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
    expect(columns).toEqual(['todo', 'in_progress', 'in_review', 'blocked', 'done', 'other']);
    await expect(page.locator('.kanban-column-title')).toHaveText([
      'To Do',
      'In Progress',
      'In Review',
      'Blocked',
      'Done',
      'Other',
    ]);
    await expect(page.locator('.kanban-count')).toHaveText(['6', '3', '0', '2', '24', '1']);
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

  test("a project's git worktrees on one board: each task where it got furthest, with its branch", async ({
    page,
    tasksServer,
  }) => {
    const tasks = loadFixture('kanban').tasks;
    const copy = (id: string, fields: Record<string, unknown>) => ({ ...tasks.find((t) => t.id === id)!, ...fields });
    tasksServer.worktrees([
      { path: '/projects/fixture', branch: 'main', main: true },
      {
        path: '/projects/fixture-2',
        branch: 'agent-2',
        main: false,
        tasks: [
          copy('T-029', { status: 'in_progress', started_at: '2026-01-02T00:00:00Z' }),
          copy('T-027', { status: 'done', completed_at: '2026-04-05T00:00:00Z' }), // the newest, so the first shown
          copy('T-024', { status: 'todo' }), // behind the main worktree: not shown
          { id: 'T-099', name: 'Only on the branch', phase: 1, type: 'feature', description: '', status: 'todo' },
        ],
      },
    ]);
    await openKanban(page, tasksServer, 'kanban');
    await expect(column(page, 'in_progress').locator('.kanban-card[data-id="T-029"]')).toBeVisible();
    await expect(column(page, 'done').locator('.kanban-card[data-id="T-027"]')).toBeVisible();
    await expect(column(page, 'todo').locator('.kanban-card[data-id="T-099"]')).toBeVisible();
    for (const id of ['T-029', 'T-027', 'T-099']) {
      await expect(card(page, id).locator('.branch-chip')).toHaveText('agent-2');
    }
    await expect(card(page, 'T-024').locator('.branch-chip')).toHaveCount(0);
    await expect(column(page, 'done').locator('.kanban-card[data-id="T-024"]')).toBeVisible();
    await card(page, 'T-027').click();
    await expect(page.locator('#detail-overlay.open .branch-chip')).toHaveText('agent-2');
    await page.keyboard.press('Escape');

    // The branch merged and its worktree was removed: the board shows the main worktree's tasks again
    tasksServer.worktrees([{ path: '/projects/fixture', branch: 'main', main: true }]);
    await page.locator('#reload-btn').click();
    await expect(page.locator('.branch-chip')).toHaveCount(0);
    await expect(card(page, 'T-099')).toHaveCount(0);
    await expect(column(page, 'todo').locator('.kanban-card[data-id="T-029"]')).toBeVisible();
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

  test("a project's own statuses make the columns, by kind", async ({ page, tasksServer }) => {
    const data = loadFixture('kanban');
    data.meta = {
      ...data.meta,
      statuses: [
        { id: 'todo', label: 'Backlog', kind: 'todo' },
        { id: 'in_progress', label: 'Doing', kind: 'active' },
        { id: 'awaiting_user', label: 'Awaiting you', kind: 'review' },
        { id: 'done', label: 'Shipped', kind: 'done' },
      ],
    };
    data.tasks.find((t) => t.id === 'T-025')!.status = 'awaiting_user';
    await openKanban(page, tasksServer, data);
    await expect(page.locator('.kanban-column-title')).toHaveText([
      'Backlog',
      'Doing',
      'Awaiting you',
      'Shipped',
      'Other',
    ]);
    expect(await cardIds(page, 'awaiting_user')).toEqual(['T-025']);
    // blocked is no longer one of its statuses: those tasks show under Other
    expect(await cardIds(page, 'other')).toContain('T-035');
  });

  test('In Review: its own column; cards and the detail panel say how long it has waited', async ({
    page,
    tasksServer,
  }) => {
    await page.clock.setFixedTime(new Date('2026-04-03T13:30:00Z'));
    const data = loadFixture('kanban');
    Object.assign(
      data.tasks.find((t) => t.id === 'T-025')!,
      {
        status: 'in_review',
        review_requested_at: '2026-04-03T11:00:00Z',
        notes: [{ at: '2026-04-03T11:00:00Z', kind: 'review', text: 'Check the column order' }],
      },
    );
    await openKanban(page, tasksServer, data);
    expect(await cardIds(page, 'in_review')).toEqual(['T-025']);
    await expect(card(page, 'T-025').locator('.review-wait')).toHaveText('Waiting for review · 2 h 30 m');
    await card(page, 'T-025').click();
    await expect(page.locator('#detail-review')).toContainText('Waiting for review · 2 h 30 m');
    await expect(page.locator('#detail-review .review-note')).toHaveText('Check the column order');
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
    await expect(page.locator('.kanban-count')).toHaveText(['3', '1', '0', '1', '0', '1']);
    await expect(column(page, 'done').locator('.kanban-empty')).toHaveText('No tasks');
    await filterButton(page, 'phase', 'all').click();
    await filterButton(page, 'status', 'done').click();
    await filterButton(page, 'status', 'blocked').click();
    const columns = await page
      .locator('.kanban-column')
      .evaluateAll((cols) => cols.map((c) => (c as HTMLElement).dataset.status));
    expect(columns).toEqual(['blocked', 'done']);
  });

  test('a ring shows the completion of the tasks shown, skipped ones apart', async ({ page, tasksServer }) => {
    await openKanban(page, tasksServer, 'kanban');
    const completion = page.locator('#kanban-completion');
    // 24 done of 36 that count (6 + 3 + 2 + 24 + 1); the 2 skipped are apart
    await expect(page.locator('#kanban-completion-text')).toHaveText('67% · 24 of 36 done · 2 skipped');
    await expect(completion.locator('svg.ring')).toHaveAttribute('aria-label', 'Tasks shown 67% done');
    await expect(completion).toHaveAttribute('title', 'Tasks shown: 24 of 36 done, 2 skipped');
    await openFilters(page);
    await filterButton(page, 'phase', '2').click();
    await expect(page.locator('#kanban-completion-text')).toHaveText(/^0% · 0 of 6 done/);
    await expect(completion.locator('svg.ring')).toHaveAttribute('aria-label', 'Tasks shown 0% done');
    await filterButton(page, 'phase', '1').click();
    await expect(completion.locator('.kanban-completion-pct')).not.toHaveText('0%');
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
        'To Do',
        'In Progress',
        'In Review',
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
