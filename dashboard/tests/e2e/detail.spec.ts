import type { Page } from '@playwright/test';
import { expect, openDashboard, test } from './helpers';

const overlay = (page: Page) => page.locator('#detail-overlay');
const panel = (page: Page) => page.locator('#detail-panel');
const section = (page: Page, label: string) =>
  panel(page)
    .locator('.detail-section')
    .filter({ has: page.locator('.label', { hasText: new RegExp(`^${label}$`) }) });
const openFromCard = (page: Page, id: string) => page.locator(`.task-card[data-id="${id}"] .task-name`).click();

test.describe('detail panel', () => {
  test.beforeEach(async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard', { tab: 'list' });
  });

  test('is closed initially and opens from a card name', async ({ page }) => {
    await expect(overlay(page)).toBeHidden();
    await openFromCard(page, 'T-004');
    await expect(overlay(page)).toHaveClass(/open/);
    await expect(overlay(page)).toBeVisible();
    await expect(panel(page).locator('h3')).toHaveText('T-004 User login');
  });

  test('shows all task fields', async ({ page }) => {
    await openFromCard(page, 'T-004');
    await expect(panel(page).locator('.task-meta > *')).toHaveText(['feature', 'Done', 'Phase 1', 'P2']);
    await expect(section(page, 'Description').locator('.value')).toHaveText('Description of T-004: User login.');
    await expect(section(page, 'Use Cases').locator('.uc-badge')).toHaveText(['UC-001']);
    await expect(section(page, 'Requirements').locator('.req-badge')).toHaveText(['FR-1.1', 'FR-1.2']);
    await expect(section(page, 'Timestamps')).toContainText('Created: 3/31/2026, 8:00:00 AM');
    await expect(section(page, 'Timestamps')).toContainText('Updated: 4/3/2026, 11:00:00 AM');
    await expect(section(page, 'Files').locator('.detail-files div')).toHaveText(['src/auth/login.ts']);
  });

  test('lists dependencies both ways with their statuses', async ({ page }) => {
    await openFromCard(page, 'T-004');
    const dependsOn = section(page, 'Depends On').locator('.detail-dep-item');
    await expect(dependsOn).toHaveCount(2);
    await expect(dependsOn.first()).toContainText('T-002 Write contributing guide');
    await expect(dependsOn.first().locator('.badge')).toHaveText('Done');
    const requiredBy = section(page, 'Required By').locator('.detail-dep-item');
    await expect(requiredBy).toHaveCount(2);
    await expect(requiredBy.nth(0)).toContainText('T-005 Post editor');
    await expect(requiredBy.nth(0).locator('.badge')).toHaveText('In Progress');
    await expect(requiredBy.nth(1)).toContainText('T-006 Fix session timeout');
  });

  test('dependency entries navigate to that task', async ({ page }) => {
    await openFromCard(page, 'T-004');
    await section(page, 'Required By').locator('.detail-dep-item', { hasText: 'T-005' }).click();
    await expect(panel(page).locator('h3')).toHaveText('T-005 Post editor');
    await section(page, 'Depends On').locator('.detail-dep-item', { hasText: 'T-004' }).click();
    await expect(panel(page).locator('h3')).toHaveText('T-004 User login');
  });

  test('placeholders for missing optional fields', async ({ page }) => {
    await openFromCard(page, 'T-009');
    await expect(section(page, 'Use Cases').locator('.value')).toHaveText('None');
    await expect(section(page, 'Requirements').locator('.value')).toHaveText('None');
    await expect(section(page, 'Files').locator('.detail-files')).toHaveText('None specified');
    await expect(section(page, 'Timestamps')).toHaveCount(0);
  });

  test('a task with no relations has no dependency sections', async ({ page }) => {
    await openFromCard(page, 'T-010');
    await expect(section(page, 'Depends On')).toHaveCount(0);
    await expect(section(page, 'Required By')).toHaveCount(0);
  });

  test('closes with the × button', async ({ page }) => {
    await openFromCard(page, 'T-004');
    await page.locator('#detail-panel .detail-close').click();
    await expect(overlay(page)).toBeHidden();
  });

  test('closes when clicking the backdrop, not the panel', async ({ page }) => {
    await openFromCard(page, 'T-004');
    await panel(page).locator('h3').click();
    await expect(overlay(page)).toBeVisible();
    await overlay(page).click({ position: { x: 5, y: 5 } });
    await expect(overlay(page)).toBeHidden();
  });

  test('closes with Escape', async ({ page }) => {
    await openFromCard(page, 'T-004');
    await page.keyboard.press('Escape');
    await expect(overlay(page)).toBeHidden();
  });

  test('opens from a dependency graph node', async ({ page }) => {
    await page.locator('#tab-graph').click();
    await page.locator('#dep-graph g', { hasText: 'T-007' }).click();
    await expect(overlay(page)).toBeVisible();
    await expect(panel(page).locator('h3')).toHaveText('T-007 Extract auth service');
  });
});
