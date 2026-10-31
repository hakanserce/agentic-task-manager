import { expect, filterButton, openDashboard, openFilters, test } from './helpers';

// fixtures/sprints.json: "Ada Lovelace" is active (due 2026-04-12), "Foundations" closed, "Alan Turing" planned
const NOW = new Date('2026-04-09T12:00:00Z');

test.describe('sprint header', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW);
  });

  test('shows the active sprint above the Kanban, List and Graph, not on the other tabs', async ({
    page,
    tasksServer,
  }) => {
    await openDashboard(page, tasksServer, 'sprints');
    const header = page.locator('#sprint-header');
    await expect(header.locator('.sprint-name')).toHaveText('Ada Lovelace');
    await expect(header.locator('.sprint-goal')).toHaveText('Sign-in, end to end');
    await expect(header.locator('.sprint-due')).toHaveText('due in 3 days');
    await expect(header.locator('.sprint-release')).toHaveText('release 1.0');
    await expect(header.locator('.sprint-progress')).toHaveText('0 of 3 done');
    await expect(header.locator('.sprint-added')).toHaveText('1 added mid-sprint');
    await expect(header.locator('.sprint-carried')).toHaveText('1 carried in');
    for (const tab of ['list', 'graph']) {
      await page.locator(`#tab-${tab}`).click();
      await expect(header).toBeVisible();
    }
    for (const tab of ['progress', 'agents', 'project']) {
      await page.locator(`#tab-${tab}`).click();
      await expect(header).toHaveCount(0);
    }
  });

  test('follows the Sprint filter: one sprint shows it, two show none', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'sprints', { tab: 'list' });
    await openFilters(page);
    await filterButton(page, 'sprint', 'Foundations').click();
    const header = page.locator('#sprint-header');
    await expect(header).toHaveAttribute('data-state', 'closed');
    await expect(header.locator('.sprint-name')).toHaveText('Foundations');
    await expect(header.locator('.sprint-state')).toHaveText('closed');
    await expect(header.locator('.sprint-due')).toHaveCount(0);
    await filterButton(page, 'sprint', 'Ada Lovelace').click();
    await expect(header).toHaveCount(0);
  });

  test('an overdue sprint says so, in red', async ({ page, tasksServer }) => {
    await page.clock.setFixedTime(new Date('2026-04-14T12:00:00Z'));
    await openDashboard(page, tasksServer, 'sprints');
    const due = page.locator('#sprint-header .sprint-due');
    await expect(due).toHaveText('2 days overdue');
    await expect(due).toHaveClass(/overdue/);
  });

  test('a project not migrated yet has no active sprint, so no header', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    await expect(page.locator('#kanban .kanban-card').first()).toBeVisible();
    await expect(page.locator('#sprint-header')).toHaveCount(0);
  });

  for (const colorScheme of ['dark', 'light'] as const) {
    test.describe(colorScheme, () => {
      test.use({ colorScheme });

      test(`visual: sprint header (${colorScheme})`, async ({ page, tasksServer }) => {
        await page.clock.setFixedTime(new Date('2026-04-14T12:00:00Z'));
        await openDashboard(page, tasksServer, 'sprints');
        await expect(page.locator('#sprint-header')).toHaveScreenshot(`sprint-header-${colorScheme}.png`);
      });

      test(`visual: release view (${colorScheme})`, async ({ page, tasksServer }) => {
        await page.clock.setFixedTime(new Date('2026-04-14T12:00:00Z'));
        // Tall enough for the whole tab: scrolled down, the view would sit under the fixed status bar
        await page.setViewportSize({ width: 1280, height: 1800 });
        await openDashboard(page, tasksServer, 'sprints', { tab: 'progress' });
        await page.locator('.release-row[data-release="1.0"] summary').click();
        await expect(page.locator('#release-view')).toHaveScreenshot(`release-view-${colorScheme}.png`);
      });
    });
  }
});
