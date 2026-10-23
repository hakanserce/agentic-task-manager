import type { Page } from '@playwright/test';
import { expect, filterButton, openDashboard, test, type TasksData } from './helpers';

// Expected numbers: tests/fixtures/progress.md (now = 2026-04-06 12:00 UTC; the tests run in UTC, en-US)
const NOW = new Date('2026-04-06T12:00:00Z');
const row = (page: Page, phase: number) => page.locator(`#phase-table tr[data-phase="${phase}"]`);
const cells = (page: Page, phase: number) => row(page, phase).locator('td');

async function openProgress(page: Page, tasksServer: Parameters<typeof openDashboard>[1], data: string | TasksData) {
  await page.clock.setFixedTime(NOW);
  await openDashboard(page, tasksServer, data);
  await page.locator('#tab-progress').click();
  await expect(page.locator('#progress')).toBeVisible();
}

test.describe('Progress tab: phase table', () => {
  test('says what the estimates are based on', async ({ page, tasksServer }) => {
    await openProgress(page, tasksServer, 'progress');
    await expect(page.locator('#progress-basis')).toContainText(
      'based on the last 8 completed tasks: about 9 m each (8 m – 11 m)',
    );
  });

  test('one row per phase with progress, state and estimate', async ({ page, tasksServer }) => {
    await openProgress(page, tasksServer, 'progress');
    await expect(page.locator('#phase-table tbody tr')).toHaveCount(3);

    await expect(cells(page, 0)).toHaveText(['Phase 0', '4/4', '', '0', 'Done', 'Done Apr 1, 09:30 AM']);
    await expect(row(page, 0)).toHaveAttribute('data-state', 'done');

    await expect(cells(page, 1).nth(1)).toHaveText('4/6');
    // 1 task left to work on (T-009), plus a warning for the blocked T-010, which the estimate doesn't cover
    await expect(cells(page, 1).nth(3)).toHaveText(/^1/);
    await expect(cells(page, 1).nth(3).locator('.phase-blocked')).toHaveText('1 blocked');
    await expect(cells(page, 1).nth(4)).toHaveText('In progress');
    await expect(cells(page, 1).nth(5)).toContainText('≈ 9 m of agent work (8 m – 11 m)');
    await expect(cells(page, 1).nth(5)).toContainText('If the loop keeps running: 12:08 PM');

    await expect(cells(page, 2).nth(4)).toHaveText('Not started');
    await expect(cells(page, 2).nth(5)).toContainText('≈ 51 m of agent work (45 m – 1 h 3 m)');
    await expect(cells(page, 2).nth(5)).toContainText('If the loop keeps running: 12:51 PM');
  });

  test('progress bars show each phase', async ({ page, tasksServer }) => {
    await openProgress(page, tasksServer, 'progress');
    const width = (phase: number) =>
      row(page, phase)
        .locator('.progress-fill')
        .evaluate((el) => (el as HTMLElement).style.width);
    expect([await width(0), await width(1), await width(2)]).toEqual(['100%', '67%', '0%']);
  });

  test('says when there is not enough history', async ({ page, tasksServer }) => {
    await openProgress(page, tasksServer, 'minimal');
    await expect(page.locator('#progress-basis')).toContainText('Not enough history to estimate yet');
    await expect(cells(page, 0).nth(5)).toHaveText('Not enough history to estimate');
  });

  test('idle gaps are capped when tasks have no start times', async ({ page, tasksServer }) => {
    // standard.json only has updated_at, with hours between completions: every measured duration is the 30 min cap
    await openProgress(page, tasksServer, 'standard');
    await expect(page.locator('#progress-basis')).toContainText('last 4 completed tasks: about 30 m each (30 m)');
  });

  test('filters choose the rows, but the pace still uses all history', async ({ page, tasksServer }) => {
    await openProgress(page, tasksServer, 'progress');
    await filterButton(page, 'phase', '2').click();
    await expect(page.locator('#phase-table tbody tr')).toHaveCount(1);
    await expect(page.locator('#progress-basis')).toContainText('last 8 completed tasks');
    // Only phase 2's own 5 tasks: 5 × 8.5 = 42.5 min
    await expect(cells(page, 2).nth(5)).toContainText('≈ 43 m of agent work');
  });

  test('empty filter result', async ({ page, tasksServer }) => {
    await openProgress(page, tasksServer, 'progress');
    await filterButton(page, 'status', 'skipped').click();
    await filterButton(page, 'type', 'test').click();
    await expect(page.locator('#progress')).toContainText('No tasks match current filters');
  });
});
