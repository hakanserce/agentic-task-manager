import type { Page } from '@playwright/test';
import { expect, filterButton, openDashboard, test } from './helpers';

const tab = (page: Page, id: string) => page.locator(`#tab-${id}`);
const panel = (page: Page, id: string) => page.locator(`#panel-${id}`);
const zoomLabel = (page: Page) => page.locator('#graph-zoom-level');

async function expectSelected(page: Page, id: string) {
  await expect(tab(page, id)).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, id)).toHaveAttribute('tabindex', '0');
  await expect(panel(page, id)).toBeVisible();
  for (const other of ['graph', 'kanban', 'progress'].filter((x) => x !== id)) {
    await expect(tab(page, other)).toHaveAttribute('aria-selected', 'false');
    await expect(tab(page, other)).toHaveAttribute('tabindex', '-1');
    await expect(panel(page, other)).toBeHidden();
  }
}

test.describe('view tabs', () => {
  test('a tablist with the dependency graph selected by default', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    await expect(page.getByRole('tablist')).toBeVisible();
    await expect(page.getByRole('tab')).toHaveText(['Dependency Graph', 'Kanban', 'Progress']);
    await expectSelected(page, 'graph');
    await expect(panel(page, 'graph')).toHaveAttribute('role', 'tabpanel');
    await expect(panel(page, 'graph')).toHaveAttribute('aria-labelledby', 'tab-graph');
    await expect(page.locator('#dep-graph')).toBeVisible();
  });

  test('clicking a tab switches views and writes the URL hash', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    await tab(page, 'kanban').click();
    await expectSelected(page, 'kanban');
    expect(new URL(page.url()).hash).toBe('#view=kanban');
    await tab(page, 'progress').click();
    await expectSelected(page, 'progress');
    expect(new URL(page.url()).hash).toBe('#view=progress');
  });

  test('arrow keys move between tabs and wrap', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    await tab(page, 'graph').focus();
    await page.keyboard.press('ArrowRight');
    await expectSelected(page, 'kanban');
    await expect(tab(page, 'kanban')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expectSelected(page, 'progress');
    await expect(tab(page, 'progress')).toBeFocused();
  });

  test('a deep link opens that view, and it survives a reload', async ({ page, tasksServer }) => {
    tasksServer.use('standard');
    await page.goto('tasks-dashboard.html#view=kanban');
    await expectSelected(page, 'kanban');
    await page.reload();
    await expectSelected(page, 'kanban');
  });

  test('back and forward follow the selected tab', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    await tab(page, 'kanban').click();
    await tab(page, 'progress').click();
    await page.goBack();
    await expectSelected(page, 'kanban');
    await page.goForward();
    await expectSelected(page, 'progress');
  });

  test('the graph keeps its zoom across a tab round trip', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'large-90');
    await page.locator('#graph-container').focus();
    await page.keyboard.press('+');
    await expect(zoomLabel(page)).toHaveText('75%');
    const viewBox = await page.locator('#dep-graph').getAttribute('viewBox');
    await tab(page, 'kanban').click();
    await tab(page, 'graph').click();
    await expect(zoomLabel(page)).toHaveText('75%');
    await expect(page.locator('#dep-graph')).toHaveAttribute('viewBox', viewBox!);
  });

  test('the badge shows the filtered task count on every tab', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    await filterButton(page, 'phase', '1').click();
    for (const id of ['graph', 'kanban', 'progress']) {
      await tab(page, id).click();
      await expect(page.locator('#graph-badge')).toHaveText('4 tasks');
    }
  });

  test('the header collapses the panel, but clicking a tab does not', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    await tab(page, 'kanban').click();
    await expect(panel(page, 'kanban')).toBeVisible();
    await page.locator('#graph-chevron').click();
    await expect(panel(page, 'kanban')).toBeHidden();
    // Selecting a tab while collapsed opens the panel again
    await tab(page, 'graph').click();
    await expectSelected(page, 'graph');
  });
});
