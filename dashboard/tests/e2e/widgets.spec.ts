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
    await expect(panel.locator('.status-legend li')).toHaveText(['Done6', 'In Progress1', 'To Do1']);
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

  test('the deep dive: key numbers, and charts by type, by agent and per task', async ({ page }) => {
    await activityPill(page).click();
    const panel = page.locator('#activity-panel');
    await expect(panel.locator('.activity-heading')).toContainText('Activity per 1 hour');
    // 6 done in 4 h (08:00–12:00); 1.4 agents busy on average; idle 11:00–11:30 (see fixtures/agents.md)
    await expect(panel.locator('.kpi')).toHaveText([
      '6tasks completed',
      '1.5 / hourcompletion rate',
      '55 mtypical time per task',
      '1.4agents busy on average · 1 now',
      '30 midle (no agent working)',
    ]);
    await expect(panel.locator('#dive-completed .type-chip')).toHaveText([
      'feature2',
      'bugfix1',
      'docs1',
      'infra1',
      'test1',
    ]);
    await expect(panel.locator('#dive-agents .type-chip')).toHaveText([
      'claude:alice001',
      'claude:bob00002',
      'Unattributed',
    ]);
    await expect(panel.locator('#dive-cycle circle')).toHaveCount(6);
    await expect(panel.locator('#dive-agents .idle-label')).toHaveText(['idle 30 m']);
    await expect(panel.locator('.idle-band')).toHaveCount(3); // the same stretch in all three charts

    // Hovering a period reads it across the charts: 09:00–10:00
    const chart = (await panel.locator('#dive-agents svg').boundingBox())!;
    const plot = { x: chart.x + (34 / 640) * chart.width, w: ((640 - 42) / 640) * chart.width };
    await page.mouse.move(plot.x + plot.w * 0.375, chart.y + chart.height / 2);
    const tooltip = panel.locator('.deep-dive-tooltip');
    await expect(tooltip.locator('.tooltip-title')).toHaveText('Apr 1 09:00 AM – Apr 1 10:00 AM');
    await expect(tooltip).toContainText('3 completed');
    // alice 09:00–09:40 (40 m), bob 09:10–10:00 (50 m), unattributed 09:00–09:20 (20 m)
    await expect(tooltip.locator('.tooltip-type').filter({ hasText: 'alice' })).toHaveText('claude:alice001 67%');
    await expect(tooltip.locator('.tooltip-type').filter({ hasText: 'bob' })).toHaveText('claude:bob00002 83%');
    await expect(tooltip.locator('.tooltip-task')).toHaveText([
      'T-002 Login form',
      'T-004 Old task',
      'T-003 Login tests',
    ]);
  });

  test('the period: a unit and ‹ › to step back and forth, remembered', async ({ page }) => {
    await activityPill(page).click();
    const label = page.locator('#activity-period');
    await expect(label).toHaveText('All time');
    await expect(page.locator('#activity-prev')).toHaveCount(0);

    await page.locator('[data-range="day"]').click();
    await expect(label).toHaveText('Today');
    await expect(page.locator('#activity-next')).toBeDisabled();
    await expect(page.locator('.kpi').first()).toHaveText('6tasks completed');
    await page.locator('#activity-prev').click();
    await expect(label).toHaveText('Yesterday');
    await expect(page.locator('.kpi').first()).toHaveText('0tasks completed');
    await page.locator('#activity-prev').click();
    await expect(label).toHaveText('Mon, Mar 30');
    await page.locator('#activity-next').click();
    await page.locator('#activity-next').click();
    await expect(label).toHaveText('Today');

    await page.locator('[data-range="hour"]').click();
    await expect(page.locator('.activity-heading')).toContainText('per 5 minutes');
    await page.locator('[data-range="week"]').click();
    await page.locator('#activity-prev').click();
    await expect(label).toHaveText('Last week');
    await page.locator('[data-range="month"]').click();
    await page.locator('#activity-prev').click();
    await expect(label).toHaveText('Last month');
    await page.locator('#activity-prev').click();
    await expect(label).toHaveText('February 2026');

    await page.reload();
    await activityPill(page).click();
    await expect(label).toHaveText('February 2026');
  });

  test('a custom period', async ({ page }) => {
    await activityPill(page).click();
    await page.locator('[data-range="custom"]').click();
    await page.locator('#activity-from').fill('2026-04-01T09:00');
    await page.locator('#activity-from').dispatchEvent('change');
    await page.locator('#activity-to').fill('2026-04-01T10:00');
    await page.locator('#activity-to').dispatchEvent('change');
    await expect(page.locator('.kpi').first()).toHaveText('3tasks completed');
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
