import type { Page } from '@playwright/test';
import { expect, filterButton, loadFixture, openDashboard, test, type TasksData, openFilters } from './helpers';

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
      'Pace: ~9 m per task (last 8 tasks, one agent at a time)',
    );
    await expect(page.locator('#progress-basis span[title]')).toHaveAttribute('title', /8 m – 11 m/);
  });

  test('one row per phase with progress and when it finishes, the calendar time first (T-241)', async ({
    page,
    tasksServer,
  }) => {
    await openProgress(page, tasksServer, 'progress');
    await expect(page.locator('#phase-table tbody tr')).toHaveCount(3);
    await expect(page.locator('#phase-table th')).toHaveText(['Phase', 'Done', 'Progress', 'Remaining', 'Finished by']);

    await expect(cells(page, 0)).toHaveText(['✓ Phase 0', '4/4', '', '0', 'Done Apr 1, 09:30 AM']);
    await expect(row(page, 0)).toHaveAttribute('data-state', 'done');

    await expect(cells(page, 1).nth(1)).toHaveText('4/6');
    // 1 task left to work on (T-009), plus a warning for the blocked T-010, which the estimate doesn't cover
    await expect(cells(page, 1).nth(3)).toHaveText(/^1/);
    await expect(cells(page, 1).nth(3).locator('.phase-blocked')).toHaveText('1 blocked');
    await expect(cells(page, 1).nth(4).locator('.estimate-main')).toHaveText('≈ 12:08 PM');
    await expect(cells(page, 1).nth(4).locator('.estimate-calendar')).toHaveText('9 m of agent work');
    await expect(cells(page, 1).nth(4)).toHaveAttribute('title', /9 m of agent work \(8 m – 11 m\)/);

    // Not started: muted; its estimate includes phase 1's work, and says so
    await expect(row(page, 2)).toHaveClass(/not-started/);
    await expect(cells(page, 2).nth(4).locator('.estimate-main')).toHaveText('≈ 12:51 PM');
    await expect(cells(page, 2).nth(4).locator('.estimate-calendar')).toHaveText(
      '51 m of agent work, including earlier phases',
    );
  });

  test('phase names show next to the badge; the ⓘ explains the estimates (T-241)', async ({ page, tasksServer }) => {
    const data = loadFixture('progress');
    data.meta = { ...data.meta, phases: [{ id: 1, name: 'Core features' }] };
    await openProgress(page, tasksServer, data);
    await expect(row(page, 1).locator('.phase-name')).toHaveText('Core features');
    await expect(row(page, 2).locator('.phase-name')).toHaveCount(0);
    await page.locator('#phase-table-info').click();
    await expect(page.locator('.infotip-popover')).toContainText('includes the work left in the phases before it');
  });

  // The progress fixture plus phase 3, finished on Mar 1, before phase 0 (Apr 1): two finished phases. No start
  // time, so the pace doesn't change.
  function twoFinishedPhases(): TasksData {
    const data = loadFixture('progress');
    data.tasks.push({
      id: 'T-099',
      name: 'Early wrap-up',
      phase: 3,
      type: 'docs',
      description: '',
      status: 'done',
      completed_at: '2026-03-01T10:00:00Z',
    });
    return data;
  }

  test('finished phases fold into one row that opens to show them (T-241)', async ({ page, tasksServer }) => {
    await openProgress(page, tasksServer, twoFinishedPhases());
    await expect(page.locator('#active-phases-only')).toHaveCount(0);
    // The folded row, then phases 1 and 2
    await expect(page.locator('#phase-table tbody tr')).toHaveCount(3);
    await expect(page.locator('#phase-finished')).toContainText('✓ Phases 0, 3 · 5 tasks · last finished Apr 1');
    await expect(row(page, 0)).toHaveCount(0);
    await expect(row(page, 3)).toHaveCount(0);
    // The burndown still covers every phase
    await expect(page.locator('#burndown-focus')).toHaveText('All phases');

    await page.locator('#phase-finished-toggle').click();
    await expect(page.locator('#phase-table tbody tr')).toHaveCount(5);
    await expect(row(page, 0)).toHaveCount(1);
    await expect(row(page, 3)).toHaveCount(1);
    // A finished phase's row still focuses the burndown
    await row(page, 3).click();
    await expect(page.locator('#burndown-focus')).toHaveText('Phase 3');
  });

  test('the Progress panel: rings for unfinished phases, chips for finished ones that open the tab on them (T-243)', async ({
    page,
    tasksServer,
  }) => {
    const data = twoFinishedPhases();
    // Phase 4 finished too: 3 and 4 merge into one chip
    data.tasks.push({ ...data.tasks.at(-1)!, id: 'T-100', phase: 4 });
    await openProgress(page, tasksServer, data);
    await page.locator('#tab-kanban').click();

    await page.locator('#progress-card').click();
    const panel = page.locator('#progress-panel');
    await expect(panel.locator('#panel-active-phases-only')).toHaveCount(0);
    await expect(panel.locator('#progress-by-phase .ring-label')).toHaveText(['Phase 1', 'Phase 2']);
    const chips = panel.locator('#progress-finished-chips .finished-chip');
    await expect(chips).toHaveText(['✓ 0', '✓ 3–4']);
    await expect(chips.nth(1)).toHaveAttribute('title', /^Phases 3–4: finished, the last on Mar 1/);

    await chips.nth(1).click();
    await expect(panel).toHaveCount(0);
    await expect(page.locator('#progress')).toBeVisible();
    await expect(page.locator('#burndown-focus')).toHaveText('Phase 4');
  });

  test('progress bars show each phase', async ({ page, tasksServer }) => {
    await openProgress(page, tasksServer, 'progress');
    const width = (phase: number) =>
      row(page, phase)
        .locator('.progress-fill')
        .evaluate((el) => (el as HTMLElement).style.width);
    expect([await width(0), await width(1), await width(2)]).toEqual(['100%', '67%', '0%']);
  });

  test('skipped tasks count as neither done nor left: done and skipped is 100%, the skipped shown apart', async ({
    page,
    tasksServer,
  }) => {
    const task = (id: string, status: string) => ({ id, name: id, phase: 1, type: 'feature', description: '', status });
    await openProgress(page, tasksServer, {
      meta: { project: 'Skips' },
      tasks: [task('T-1', 'done'), task('T-2', 'done'), task('T-3', 'skipped')],
    });
    await expect(cells(page, 1).nth(1)).toHaveText('2/2 · 1 skipped');
    await expect(row(page, 1)).toHaveAttribute('data-state', 'done');
    await expect(row(page, 1).locator('.progress-fill')).toHaveAttribute('style', /width: 100%/);

    await page.locator('#progress-card').click();
    await expect(page.locator('#progress-card')).toHaveAccessibleName('Progress 100%, 2 of 2 tasks done');
    await expect(page.locator('#overall-skipped')).toHaveText('· 1 skipped');
    // A thin outer arc on the overall ring; screen readers hear the count. Phase 1 is finished: a chip, not a ring
    await expect(page.locator('#progress-panel .ring-skip-arc')).toHaveCount(1);
    await expect(page.getByRole('img', { name: 'All tasks 100% done, 1 skipped' })).toBeVisible();
    await expect(page.locator('#progress-finished-chips')).toHaveText('✓ 1');
  });

  test('says when there is not enough history', async ({ page, tasksServer }) => {
    await openProgress(page, tasksServer, 'minimal');
    await expect(page.locator('#progress-basis')).toContainText('Not enough history to estimate yet');
    await expect(cells(page, 0).nth(4)).toHaveText('Not enough history to estimate');
  });

  test('idle gaps are capped when tasks have no start times', async ({ page, tasksServer }) => {
    // standard.json only has updated_at, with hours between completions: every measured duration is the 30 min cap
    await openProgress(page, tasksServer, 'standard');
    await expect(page.locator('#progress-basis')).toContainText('Pace: ~30 m per task (last 4 tasks');
  });

  test('filters choose the rows; the pace and each phase’s finish stay the whole project’s (T-239)', async ({
    page,
    tasksServer,
  }) => {
    await openProgress(page, tasksServer, 'progress');
    await openFilters(page);
    await filterButton(page, 'phase', '2').click();
    await expect(page.locator('#phase-table tbody tr')).toHaveCount(1);
    await expect(page.locator('#progress-basis')).toContainText('last 8 tasks');
    // Not phase 2's 5 tasks alone (43 m): the loop finishes phase 1 first, so the whole project's 51 m
    await expect(cells(page, 2).nth(4)).toContainText('51 m of agent work');
    await expect(page.locator('#progress-filter-banner')).toContainText('Showing 6 of 16 tasks: phase 2');
    await expect(page.locator('#burndown-focus')).toHaveText('All phases · matching tasks');
    await page.locator('#progress-clear-filters').click();
    await expect(page.locator('#progress-filter-banner')).toHaveCount(0);
    await expect(page.locator('#phase-table tbody tr')).toHaveCount(3);
  });

  test('the status and stage filters don’t apply on this tab, and the banner says so (T-239)', async ({
    page,
    tasksServer,
  }) => {
    await openProgress(page, tasksServer, 'progress');
    const summary = await page.locator('#burndown svg').getAttribute('aria-label');
    await openFilters(page);
    await filterButton(page, 'status', 'done').click();
    await expect(page.locator('#progress-filter-ignored')).toHaveText(/^Status filter not applied here/);
    await expect(page.locator('#burndown svg')).toHaveAttribute('aria-label', summary!);
    await expect(page.locator('#phase-table tbody tr')).toHaveCount(3);
  });

  test('empty filter result', async ({ page, tasksServer }) => {
    await openProgress(page, tasksServer, 'progress');
    await page.locator('#task-search').fill('no task is called this');
    await expect(page.locator('#progress')).toContainText('No tasks match current filters');
  });
});

test.describe('Progress tab: burndown chart', () => {
  test('summarises the burndown for screen readers', async ({ page, tasksServer }) => {
    await openProgress(page, tasksServer, 'progress');
    await expect(page.locator('#burndown svg')).toHaveAttribute(
      'aria-label',
      'Burndown: 7 of 15 tasks remaining, forecast done around 12:51 PM',
    );
  });

  test('draws remaining, scope and the forecast with direct labels and a legend', async ({ page, tasksServer }) => {
    await openProgress(page, tasksServer, 'progress');
    for (const cls of ['burndown-remaining', 'burndown-scope', 'burndown-forecast', 'burndown-fan']) {
      await expect(page.locator(`#burndown .${cls}`)).toHaveCount(1);
    }
    await expect(page.locator('.burndown-label-remaining')).toHaveText('Remaining 7');
    await expect(page.locator('.burndown-label-scope')).toHaveText('Scope 15');
    await expect(page.locator('.burndown-forecast-label')).toHaveText('done ≈ 12:51 PM');
    await expect(page.locator('.burndown-legend')).toHaveText(/Remaining\s*Scope\s*Forecast/);
  });

  test('hovering shows the values at that time, or the forecast after now', async ({ page, tasksServer }) => {
    await openProgress(page, tasksServer, 'progress');
    const hit = (await page.locator('.burndown-hit').boundingBox())!;
    const tooltip = page.locator('.burndown-tooltip');
    await expect(tooltip).toHaveCount(0);

    // Halfway through the history (Apr 3–4): phase 2 has been added, T-008 is done
    await page.mouse.move(hit.x + hit.width * 0.5, hit.y + 20);
    await expect(tooltip).toContainText('Remaining 7');
    await expect(tooltip).toContainText('Scope 15');
    await expect(page.locator('.burndown-crosshair')).toHaveCount(1);

    // Just after "now": the forecast
    await page.mouse.move(hit.x + hit.width - 1, hit.y + 20);
    await expect(tooltip).toContainText('Forecast');
    await expect(tooltip).toContainText('Done ≈ 12:51 PM');
    await expect(tooltip).toContainText('Range 12:45 PM – 01:03 PM');

    await page.mouse.move(hit.x - 30, hit.y - 30);
    await expect(tooltip).toHaveCount(0);
  });

  test('no forecast without enough history', async ({ page, tasksServer }) => {
    const data = loadFixture('minimal');
    for (const task of data.tasks) task.created_at = '2026-04-01T09:00:00Z';
    await openProgress(page, tasksServer, data);
    await expect(page.locator('#burndown .burndown-remaining')).toHaveCount(1);
    await expect(page.locator('#burndown .burndown-forecast')).toHaveCount(0);
    await expect(page.locator('.burndown-legend')).not.toContainText('Forecast');
  });

  test('without any times on the tasks, it says there is no timeline yet (T-240)', async ({ page, tasksServer }) => {
    await openProgress(page, tasksServer, 'minimal');
    await expect(page.locator('#burndown-empty')).toHaveText(
      'No timeline yet: tasks get times when agents start and finish them.',
    );
    await expect(page.locator('#burndown')).toHaveCount(0);
  });

  test('the forecast ends at what waits on people, and says so (T-240)', async ({ page, tasksServer }) => {
    // progress.json: T-010 is blocked, so the forecast ends at 1, not 0
    await openProgress(page, tasksServer, 'progress');
    await expect(page.locator('#burndown-waiting')).toHaveText('1 waiting on review or a decision');
  });
});

test.describe('Progress tab: burndown title, info and range (T-240)', () => {
  test('the title names the scope; the ⓘ explains the chart and closes on Escape', async ({ page, tasksServer }) => {
    await openProgress(page, tasksServer, 'progress');
    await expect(page.locator('.burndown-title')).toContainText('Burndown · All phases');
    await page.locator('#burndown-info').click();
    const popover = page.locator('.infotip-popover');
    await expect(popover).toContainText('one agent, one task at a time');
    await expect(popover).toContainText('interactive');
    await page.keyboard.press('Escape');
    await expect(popover).toHaveCount(0);
  });

  test('the range: since the first unfinished phase started by default, 14 days or all time; remembered', async ({
    page,
    tasksServer,
  }) => {
    await openProgress(page, tasksServer, 'progress');
    const range = page.locator('#burndown-range button');
    await expect(range).toHaveText(['Since phase 1 started', 'Last 14 days', 'All time']);
    await expect(page.locator('#burndown-range [aria-pressed="true"]')).toHaveText('Since phase 1 started');
    const sinceLabels = await page.locator('#burndown text.burndown-axis').allTextContents();
    await page.locator('#burndown-range [data-range="all"]').click();
    await expect(page.locator('#burndown-range [aria-pressed="true"]')).toHaveText('All time');
    await expect
      .poll(async () => (await page.locator('#burndown text.burndown-axis').allTextContents()).join())
      .not.toBe(sinceLabels.join());
    await page.reload();
    await page.locator('#tab-progress').click();
    await expect(page.locator('#burndown-range [aria-pressed="true"]')).toHaveText('All time');
  });
});

test.describe('Progress tab: focus a phase', () => {
  const label = (page: Page) => page.locator('#burndown svg');

  test('clicking a phase row limits the burndown to that phase; clicking again resets', async ({
    page,
    tasksServer,
  }) => {
    await openProgress(page, tasksServer, 'progress');
    await expect(page.locator('#burndown-focus')).toHaveText('All phases');
    await row(page, 1).click();
    await expect(row(page, 1)).toHaveClass(/selected/);
    await expect(page.locator('#burndown-focus')).toHaveText('Phase 1');
    // Phase 1: 6 tasks, 2 not done (T-009 in progress, T-010 blocked); its estimate covers T-009 only
    await expect(label(page)).toHaveAttribute(
      'aria-label',
      'Burndown: 2 of 6 tasks remaining, forecast done around 12:08 PM',
    );
    await row(page, 1).click();
    await expect(page.locator('#burndown-focus')).toHaveText('All phases');
    await expect(row(page, 1)).not.toHaveClass(/selected/);
  });

  test('"Show all phases", the keyboard, and filters that hide the phase', async ({ page, tasksServer }) => {
    await openProgress(page, tasksServer, 'progress');
    await row(page, 0).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#burndown-focus')).toHaveText('Phase 0');
    await expect(label(page)).toHaveAttribute('aria-label', 'Burndown: 0 of 4 tasks remaining');
    await page.getByRole('button', { name: 'Show all phases' }).click();
    await expect(page.locator('#burndown-focus')).toHaveText('All phases');

    await row(page, 2).click();
    await openFilters(page);
    await filterButton(page, 'phase', '1').click();
    await expect(page.locator('#burndown-focus')).toHaveText('All phases · matching tasks');
  });
});

test.describe('Progress tab: agent utilisation', () => {
  // fixtures/agents.md: 5 h 30 m of agent work (incl. T-007 running 30 m) between 08:00 and 12:00 on a Wednesday
  test('work time against calendar and working time, overall and per agent', async ({ page, tasksServer }) => {
    await page.clock.setFixedTime(new Date('2026-04-01T12:00:00Z'));
    await openDashboard(page, tasksServer, 'agents', { tab: 'progress' });
    const section = page.locator('#utilization');
    await expect(section.locator('.progress-basis')).toContainText('5 h 30 m of agent work over 4 h');
    // 330 m / 240 m calendar; working time 4 h × 8/24 = 80 m
    await expect(page.locator('#util-daily .util-value')).toHaveText('138%');
    await expect(page.locator('#util-workday .util-value')).toHaveText('413%');
    await expect(page.locator('#util-daily .util-fill')).toHaveClass(/over/);
    await expect(section.locator('tbody tr')).toHaveText([
      /claude:alice001\s*3 h\s*75%\s*225%/,
      /claude:bob00002\s*2 h 10 m\s*54%\s*163%/,
      /Unattributed\s*20 m\s*8%\s*25%/,
    ]);
  });

  test('is left out before any task has started', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard', { tab: 'progress' });
    await expect(page.locator('#utilization')).toHaveCount(0);
  });
});
