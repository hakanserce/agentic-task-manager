import type { Page } from '@playwright/test';
import { expect, loadFixture, openDashboard, test } from './helpers';

// The top bar: compact Progress and Activity pills between the title and the controls; a click opens the details.
// Numbers from fixtures/agents.md: 6 of 8 tasks done, completions between 08:00 and 11:00 UTC.
const NOW = new Date('2026-04-01T12:00:00Z');
const progressPill = (page: Page) => page.locator('#progress-card');
const activityPill = (page: Page) => page.locator('#activity-card');

test.beforeEach(async ({ page, tasksServer }) => {
  await page.clock.setFixedTime(NOW);
  await openDashboard(page, tasksServer, 'agents');
});

test.describe('Progress widget', () => {
  test('the pill is a ring with the share of tasks done', async ({ page }) => {
    await expect(progressPill(page)).toHaveAccessibleName('Progress 75%, 6 of 8 tasks done');
    await expect(progressPill(page).locator('.number')).toHaveText('75%');
    await expect(progressPill(page).locator('svg.mini-ring circle')).toHaveCount(2);
  });

  test('opens the details: overall, by status, by phase and by type', async ({ page }) => {
    await progressPill(page).click();
    await expect(progressPill(page)).toHaveAttribute('aria-expanded', 'true');
    const panel = page.locator('#progress-panel');
    await expect(panel.locator('.insights-title')).toHaveText('6 of 8 tasks done');
    await expect(panel.locator('.status-legend li')).toHaveText(['Done6', 'In progress1', 'Todo1']);
    const section = (title: string) => panel.locator('.insights-section').filter({ hasText: title });
    await expect(section('By phase').locator('.ring-label')).toHaveText(['Phase 0', 'Phase 1']);
    await expect(section('By phase').locator('.ring-count')).toHaveText(['4/4', '2/4']);
    await expect(section('By type').locator('.ring-label')).toHaveText(['Bugfix', 'Docs', 'Feature', 'Infra', 'Test']);
    await expect(section('By type').locator('.ring-count')).toHaveText(['1/1', '1/1', '2/3', '1/1', '1/2']);
  });

  test('closes on Escape, on a click outside, and with the pill', async ({ page }) => {
    const panel = page.locator('#progress-panel');
    await progressPill(page).click();
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await progressPill(page).click();
    await page.locator('h1').click();
    await expect(panel).toHaveCount(0);
    await progressPill(page).click();
    await progressPill(page).click();
    await expect(panel).toHaveCount(0);
    await expect(progressPill(page)).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('Activity widget', () => {
  test('the pill is a sparkline of completions per period with their average', async ({ page }) => {
    await expect(activityPill(page)).toHaveAccessibleName('Activity: 6 tasks completed');
    await expect(activityPill(page).locator('svg.sparkline rect')).toHaveCount(4); // 08:00, 09:00, 10:00, 11:00
    await expect(activityPill(page).locator('svg.sparkline path')).toHaveCount(1);
  });

  test('the deep dive: key numbers, types, and a tooltip per period', async ({ page }) => {
    await activityPill(page).click();
    const panel = page.locator('#activity-panel');
    await expect(panel.locator('.panel-heading')).toHaveText('Activity per 1 hour');
    await expect(panel.locator('.kpi')).toHaveText([
      '6completed',
      '3best 1 hour',
      '55 mmedian cycle time',
      '1in progress',
    ]);
    await expect(panel.locator('.type-legend .type-chip')).toHaveText([
      'feature2',
      'bugfix1',
      'docs1',
      'infra1',
      'test1',
    ]);

    const chart = panel.locator('.deep-dive-chart');
    const box = (await chart.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
    const tooltip = panel.locator('.deep-dive-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip.locator('.tooltip-title')).toHaveText(/^Apr 1 08:00 AM – Apr 1 09:00 AM$/);
    await expect(tooltip.locator('.tooltip-task')).toHaveText(['T-001 Set up repository']);
  });

  test('is left out when nothing has been completed yet', async ({ page, tasksServer }) => {
    const data = loadFixture('agents');
    for (const t of data.tasks) t.status = 'todo';
    tasksServer.use(data);
    await page.locator('#reload-btn').click();
    await expect(activityPill(page)).toHaveCount(0);
    await expect(progressPill(page)).toHaveAccessibleName('Progress 0%, 0 of 8 tasks done');
  });
});

test('the header stays at the top while scrolling', async ({ page }) => {
  await page.addStyleTag({ content: 'body { min-height: 3000px }' });
  const header = page.locator('header.topbar');
  await expect(header).not.toHaveClass(/scrolled/);
  await page.mouse.wheel(0, 800);
  await expect(header).toHaveClass(/scrolled/);
  await expect(header).toBeInViewport();
  expect((await header.boundingBox())!.y).toBe(0);
});
