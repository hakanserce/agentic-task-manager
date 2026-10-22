import { expect, openDashboard, statNumber, test } from './helpers';

test.describe('stats', () => {
  test('status counts and progress for the standard fixture', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    await expect(statNumber(page, 'Total')).toHaveText('12');
    await expect(statNumber(page, 'Done')).toHaveText('5');
    await expect(statNumber(page, 'In Progress')).toHaveText('1');
    await expect(statNumber(page, 'Todo')).toHaveText('4');
    await expect(statNumber(page, 'Blocked')).toHaveText('1');
    await expect(statNumber(page, 'Progress')).toHaveText('42%');
    expect(await page.locator('#stats .progress-fill').evaluate((el) => (el as HTMLElement).style.width)).toBe('42%');
  });

  test('status numbers are color-coded', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    const colors = {
      Total: 'rgb(230, 237, 243)',
      Done: 'rgb(63, 185, 80)',
      'In Progress': 'rgb(88, 166, 255)',
      Todo: 'rgb(139, 148, 158)',
      Blocked: 'rgb(248, 81, 73)',
      feature: 'rgb(63, 185, 80)',
      test: 'rgb(188, 140, 255)',
    };
    for (const [label, color] of Object.entries(colors))
      await expect(statNumber(page, label)).toHaveCSS('color', color);
  });

  test('one card per type, alphabetically, with counts', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    const expected = { bugfix: '1', docs: '2', feature: '3', infra: '2', polish: '1', refactor: '1', test: '2' };
    for (const [type, count] of Object.entries(expected)) await expect(statNumber(page, type)).toHaveText(count);
    const labels = await page.locator('#stats .stat-card .label').allTextContents();
    expect(labels).toEqual(['Total', 'Done', 'In Progress', 'Todo', 'Blocked', ...Object.keys(expected), 'Progress']);
  });

  test('no Blocked card when nothing is blocked', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'minimal');
    await expect(statNumber(page, 'Total')).toHaveText('1');
    await expect(statNumber(page, 'Blocked')).toHaveCount(0);
  });

  test('empty task list shows zeros', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'empty');
    await expect(statNumber(page, 'Total')).toHaveText('0');
    await expect(statNumber(page, 'Progress')).toHaveText('0%');
  });
});

test.describe('activity timeline', () => {
  test('buckets completions and labels the date range', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    const bars = page.locator('.timeline-card .timeline-bar');
    // 5 completions over 50h → 5 buckets of 10h holding 2, 0, 1, 1, 1
    await expect(bars).toHaveCount(5);
    for (const [i, h] of ['40px', '0px', '20px', '20px', '20px'].entries())
      await expect(bars.nth(i)).toHaveCSS('height', h);
    await expect(page.locator('.timeline-range span')).toHaveText(['Apr 1', 'Apr 3']);
  });

  test('hovering a bar shows its completions', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    const bar = page.locator('.timeline-bar').first();
    const tooltip = bar.locator('.timeline-tooltip');
    await expect(tooltip).toBeHidden();
    await bar.hover();
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('2 completed');
    await expect(tooltip).toContainText('T-001: Set up repository');
    await expect(tooltip).toContainText('T-002: Write contributing guide');
  });

  test('empty buckets have no tooltip', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    await expect(page.locator('.timeline-bar').nth(1).locator('.timeline-tooltip')).toHaveCount(0);
  });

  test('bucket count is capped at 16', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'large-90');
    await expect(page.locator('.timeline-bar')).toHaveCount(16);
  });

  test('needs at least two timestamped completions', async ({ page, tasksServer }) => {
    const task = { phase: 0, type: 'feature', description: 'd', dependencies: [] };
    await openDashboard(page, tasksServer, {
      tasks: [
        { ...task, id: 'T-001', name: 'Done with timestamp', status: 'done', updated_at: '2026-04-01T00:00:00Z' },
        { ...task, id: 'T-002', name: 'Done without timestamp', status: 'done' },
        { ...task, id: 'T-003', name: 'Todo with timestamp', status: 'todo', updated_at: '2026-04-02T00:00:00Z' },
      ],
    });
    await expect(statNumber(page, 'Done')).toHaveText('2');
    await expect(page.locator('.timeline-card')).toHaveCount(0);
  });

  test('not shown without timestamps', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'minimal');
    await expect(page.locator('.timeline-card')).toHaveCount(0);
  });
});
