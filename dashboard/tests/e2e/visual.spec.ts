import path from 'node:path';
import { expect, openDashboard, summary, test } from './helpers';

// The version chip and the footer's version are masked: they show the version (and a "new" marker) and would
// otherwise change every page baseline on each release; whats-new.spec and footer.spec cover them. They also get a
// fixed width for the screenshot, so a longer version number (0.9.0 -> 0.10.0) doesn't move the mask's edge.
// The auto-refresh interval box is masked too (when its menu is open): headless Chromium places the text inside a
// number input at a slightly different sub-pixel position from run to run. refresh.spec covers its value.
// Baselines are per platform (-darwin locally, -linux in CI). Regenerate deliberately after an intended UI change:
//   npx playwright test visual --update-snapshots   (then delete the stale -linux.png files; CI regenerates them)

for (const fixture of ['standard', 'large-90', 'empty', 'edge-cases']) {
  test.describe(`visual: ${fixture}`, () => {
    test.beforeEach(async ({ page, tasksServer }) => {
      await openDashboard(page, tasksServer, fixture);
      await expect(page.locator('#subtitle')).toContainText('loaded from tasks.json');
    });

    test('full page', async ({ page }) => {
      await expect(page).toHaveScreenshot(`${fixture}-page.png`, {
        fullPage: true,
        mask: [page.locator('#version-chip'), page.locator('#footer-version'), page.locator('#auto-refresh-interval')],
        stylePath: path.join(import.meta.dirname, 'screenshot.css'),
      });
    });

    test('dependency graph', async ({ page }) => {
      await expect(page.locator('#graph-section')).toHaveScreenshot(`${fixture}-graph.png`);
    });
  });
}

test('visual: detail panel', async ({ page, tasksServer }) => {
  await openDashboard(page, tasksServer, 'standard', { tab: 'list' });
  await page.locator('.task-card[data-id="T-004"] .task-name').click();
  await expect(page.locator('#detail-panel')).toHaveScreenshot('standard-detail.png');
});

for (const fixture of ['standard', 'kanban']) {
  test(`visual: kanban board (${fixture})`, async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, fixture);
    await page.locator('#tab-kanban').click();
    await expect(page.locator('#kanban .kanban-card').first()).toBeVisible();
    await expect(page.locator('#graph-section')).toHaveScreenshot(`${fixture}-kanban.png`);
  });
}

test('visual: progress tab', async ({ page, tasksServer }) => {
  await page.clock.setFixedTime(new Date('2026-04-06T12:00:00Z'));
  await openDashboard(page, tasksServer, 'progress');
  await page.locator('#tab-progress').click();
  await expect(page.locator('#burndown svg')).toBeVisible();
  await expect(page.locator('#graph-section')).toHaveScreenshot('progress-progress.png');
});

test('visual: list tab', async ({ page, tasksServer }) => {
  await openDashboard(page, tasksServer, 'standard', { tab: 'list' });
  await expect(page.locator('#graph-section')).toHaveScreenshot('standard-list.png');
});

// The Agents tab and the top-bar widgets depend on the time: fixtures/agents.md, with a fixed clock
const AGENTS_NOW = new Date('2026-04-01T12:00:00Z');

test('visual: agents tab', async ({ page, tasksServer }) => {
  await page.clock.setFixedTime(AGENTS_NOW);
  await openDashboard(page, tasksServer, 'agents', { tab: 'agents' });
  await expect(page.locator('.agent-bar').first()).toBeVisible();
  await expect(page.locator('#graph-section')).toHaveScreenshot('agents-agents.png');
});

test('visual: agents tab, zoomed in', async ({ page, tasksServer }) => {
  await page.clock.setFixedTime(AGENTS_NOW);
  await openDashboard(page, tasksServer, 'agents', { tab: 'agents' });
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.locator('#graph-section')).toHaveScreenshot('agents-agents-zoomed.png');
});

test('visual: progress and activity details', async ({ page, tasksServer }) => {
  await page.clock.setFixedTime(AGENTS_NOW);
  await openDashboard(page, tasksServer, 'agents');
  await page.locator('#progress-card').click();
  await expect(page.locator('#progress-panel')).toHaveScreenshot('agents-progress-panel.png');
  await page.locator('#activity-card').click();
  await expect(page.locator('#activity-panel')).toHaveScreenshot('agents-activity-panel.png');
});

test('visual: top bar with the filter panel open', async ({ page, tasksServer }) => {
  await openDashboard(page, tasksServer, 'standard');
  await page.locator('#filters-toggle').click();
  await page.locator('.filter-btn[data-filter="type"][data-value="feature"]').click();
  await page.locator('#task-search').fill('user');
  await expect(page.locator('header.topbar')).toHaveScreenshot('standard-topbar-filters.png', {
    mask: [page.locator('#version-chip')],
  });
});

// FR-2.6: the main views in light mode (the OS setting is light; Playwright emulates it).
test.describe('visual: light mode', () => {
  test.use({ colorScheme: 'light' });

  test('full page', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
    await expect(page).toHaveScreenshot('light-standard-page.png', {
      fullPage: true,
      mask: [page.locator('#version-chip'), page.locator('#footer-version'), page.locator('#auto-refresh-interval')],
      stylePath: path.join(import.meta.dirname, 'screenshot.css'),
    });
  });

  test('dependency graph', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'large-90');
    await expect(page.locator('#graph-section')).toHaveScreenshot('light-large-90-graph.png');
  });

  test('kanban board', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'kanban');
    await page.locator('#tab-kanban').click();
    await expect(page.locator('#kanban .kanban-card').first()).toBeVisible();
    await expect(page.locator('#graph-section')).toHaveScreenshot('light-kanban.png');
  });

  test('progress tab', async ({ page, tasksServer }) => {
    await page.clock.setFixedTime(new Date('2026-04-06T12:00:00Z'));
    await openDashboard(page, tasksServer, 'progress');
    await page.locator('#tab-progress').click();
    await expect(page.locator('#burndown svg')).toBeVisible();
    await expect(page.locator('#graph-section')).toHaveScreenshot('light-progress.png');
  });

  test('agents tab', async ({ page, tasksServer }) => {
    await page.clock.setFixedTime(AGENTS_NOW);
    await openDashboard(page, tasksServer, 'agents', { tab: 'agents' });
    await expect(page.locator('.agent-bar').first()).toBeVisible();
    await expect(page.locator('#graph-section')).toHaveScreenshot('light-agents.png');
  });

  test('activity details', async ({ page, tasksServer }) => {
    await page.clock.setFixedTime(AGENTS_NOW);
    await openDashboard(page, tasksServer, 'agents');
    await page.locator('#activity-card').click();
    await expect(page.locator('#activity-panel')).toHaveScreenshot('light-agents-activity-panel.png');
  });

  test('progress details', async ({ page, tasksServer }) => {
    await page.clock.setFixedTime(AGENTS_NOW);
    await openDashboard(page, tasksServer, 'agents');
    await page.locator('#progress-card').click();
    await expect(page.locator('#progress-panel')).toHaveScreenshot('light-agents-progress-panel.png');
  });

  test('detail panel', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard', { tab: 'list' });
    await page.locator('.task-card[data-id="T-004"] .task-name').click();
    await expect(page.locator('#detail-panel')).toHaveScreenshot('light-standard-detail.png');
  });
});

// v4 (docs/v4/dashboard.md D-6.2): priorities, labels, stages, In Review and Blocked, notes and actors, the dialogs,
// in both modes. fixtures/v4.json at a fixed time, so the waiting times are stable.
const V4_NOW = new Date('2026-04-10T12:00:00Z');

for (const mode of ['dark', 'light'] as const) {
  test.describe(`visual: v4 (${mode})`, () => {
    test.use({ colorScheme: mode });
    test.beforeEach(async ({ page, tasksServer }) => {
      await page.clock.setFixedTime(V4_NOW);
      tasksServer.archive('archive');
    });

    test('kanban board: review, blocked, stages in Done', async ({ page, tasksServer }) => {
      await openDashboard(page, tasksServer, 'v4', { tab: 'kanban' });
      await expect(page.locator('#kanban .kanban-card').first()).toBeVisible();
      await expect(page.locator('#graph-section')).toHaveScreenshot(`v4-${mode}-kanban.png`);
    });

    test('list: labels, priorities, stages', async ({ page, tasksServer }) => {
      await openDashboard(page, tasksServer, 'v4', { tab: 'list' });
      await expect(page.locator('#graph-section')).toHaveScreenshot(`v4-${mode}-list.png`);
    });

    test('detail panel: notes, actors, stage', async ({ page, tasksServer }) => {
      await openDashboard(page, tasksServer, 'v4', { tab: 'list' });
      await page.locator('.task-card[data-id="T-002"] .task-name').click();
      await expect(page.locator('#detail-panel')).toHaveScreenshot(`v4-${mode}-detail.png`);
    });

    test('detail panel: a blocked task and its questions', async ({ page, tasksServer }) => {
      await openDashboard(page, tasksServer, 'v4', { tab: 'list' });
      await page.locator('.task-card[data-id="T-005"] .task-name').click();
      await expect(page.locator('#detail-panel')).toHaveScreenshot(`v4-${mode}-detail-blocked.png`);
    });

    test('header and footer', async ({ page, tasksServer }) => {
      await openDashboard(page, tasksServer, 'v4');
      await expect(page.locator('header.topbar')).toHaveScreenshot(`v4-${mode}-header.png`, {
        mask: [page.locator('#version-chip')],
      });
      await expect(page.locator('#site-footer')).toHaveScreenshot(`v4-${mode}-footer.png`, {
        mask: [page.locator('#footer-version')],
      });
    });

    test('About and Help', async ({ page, tasksServer }) => {
      await openDashboard(page, tasksServer, 'v4');
      await page.locator('#footer-about').click();
      // The version changes with every release: masked
      await expect(page.locator('#about-panel')).toHaveScreenshot(`v4-${mode}-about.png`, {
        mask: [page.locator('#about-panel dd').nth(0)],
      });
      await page.keyboard.press('Escape');
      await page.locator('#footer-help').click();
      await expect(page.locator('#help-panel')).toHaveScreenshot(`v4-${mode}-help.png`);
    });
  });
}

// The Appearance menu: the mode switch and the theme combo box with the current theme's swatch
for (const mode of ['dark', 'light'] as const) {
  test(`visual: appearance menu (${mode})`, async ({ page, tasksServer }) => {
    await page.addInitScript(
      (m) => localStorage.setItem('atm-dashboard', JSON.stringify({ theme: 'gruvbox', mode: m, autoRefresh: false })),
      mode,
    );
    await openDashboard(page, tasksServer, 'standard');
    await page.locator('#appearance-btn').click();
    await expect(page.locator('#appearance-menu')).toHaveScreenshot(`appearance-menu-${mode}.png`);
  });
}

// The Progress panel with skipped tasks: the thin outer arc on the overall ring, Phase 2's and Docs'
for (const mode of ['dark', 'light'] as const) {
  test(`visual: progress panel with skipped tasks (${mode})`, async ({ page, tasksServer }) => {
    await page.emulateMedia({ colorScheme: mode });
    await openDashboard(page, tasksServer, 'standard');
    await page.locator('#progress-card').click();
    await expect(page.locator('#progress-panel')).toHaveScreenshot(`progress-panel-skipped-${mode}.png`);
  });
}

// The project selector, open, with progress, a "needs you" dot and a project that is gone
for (const mode of ['dark', 'light'] as const) {
  test(`visual: project selector (${mode})`, async ({ page, tasksServer }) => {
    await page.emulateMedia({ colorScheme: mode });
    const third = summary({ percent: 20, needs_you: { review: 1, blocked_on_user: 0 } });
    tasksServer
      .addProject('second', 'minimal', 'Second Project', summary({ percent: 75 }))
      .addProject('third', 'minimal', 'Third Project', third);
    await openDashboard(page, tasksServer, 'standard');
    await page.evaluate(() => (location.hash = '#project=second'));
    await expect(page.locator('#subtitle')).toContainText('loaded from tasks.json');
    await page.locator('#project-selector').click();
    await expect(page.locator('#project-menu')).toHaveScreenshot(`project-selector-${mode}.png`);
  });
}

// The "need you" chip, open on the list of the tasks that need you (fixtures/v4.json: one in review, one blocked)
for (const mode of ['dark', 'light'] as const) {
  test(`visual: needs-you list (${mode})`, async ({ page, tasksServer }) => {
    await page.emulateMedia({ colorScheme: mode });
    await openDashboard(page, tasksServer, 'v4', { tab: 'list' });
    await page.locator('#attention-count').click();
    await expect(page.locator('#needs-you-menu')).toHaveScreenshot(`needs-you-menu-${mode}.png`);
  });
}

// The overview of all projects: cards with progress, phase, agents, activity, a "needs you" and a gone project
for (const mode of ['dark', 'light'] as const) {
  test(`visual: projects overview (${mode})`, async ({ page, tasksServer }) => {
    await page.emulateMedia({ colorScheme: mode });
    await page.clock.setFixedTime(new Date('2026-01-01T12:00:00Z'));
    tasksServer
      .addProject(
        'busy',
        'minimal',
        'Busy Project',
        summary({
          total: 20,
          done: 9,
          skipped: 2,
          percent: 50,
          current_phase: { id: 3, name: 'Polish', done: 1, total: 4 },
          agents_working: 2,
          last_activity: '2026-01-01T11:48:00Z',
        }),
      )
      .addProject('asks', 'minimal', 'Waiting Project', summary({ needs_you: { review: 1, blocked_on_user: 1 } }))
      .goneProject('old1234', 'Old Project');
    await openDashboard(page, tasksServer, 'standard');
    await expect(page.locator('.project-card')).toHaveCount(4);
    await expect(page.locator('#landing')).toHaveScreenshot(`projects-overview-${mode}.png`);
  });
}

// FR-3: one main view (the Kanban board) per theme and mode, to catch regressions in any palette.
for (const theme of [
  'nord',
  'solarized',
  'catppuccin',
  'tokyo-night',
  'ayu',
  'night-owl',
  'gruvbox',
  'noctis',
  'sublime-material',
  'high-contrast',
]) {
  for (const mode of ['dark', 'light']) {
    test(`visual: theme ${theme} (${mode})`, async ({ page, tasksServer }) => {
      await page.addInitScript(
        ([t, m]) => localStorage.setItem('atm-dashboard', JSON.stringify({ theme: t, mode: m, autoRefresh: false })),
        [theme, mode],
      );
      await openDashboard(page, tasksServer, 'kanban');
      await page.locator('#tab-kanban').click();
      await expect(page.locator('#kanban .kanban-card').first()).toBeVisible();
      await expect(page.locator('#graph-section')).toHaveScreenshot(`theme-${theme}-${mode}.png`);
    });
  }
}
