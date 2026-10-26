// Every v4 dashboard feature on one project (fixtures/v4.json, with fixtures/archive.json as its archive):
// labels, stages, actors, In Review and Blocked, notes, the attention count (docs/v4/dashboard.md).
import type { Page } from '@playwright/test';
import { expect, filterButton, loadFixture, matchCount, openDashboard, openFilters, test } from './helpers';

const NOW = new Date('2026-04-10T12:00:00Z');
const card = (page: Page, id: string) => page.locator(`.kanban-card[data-id="${id}"]`);

test.describe('v4 project', () => {
  test.beforeEach(async ({ page, tasksServer }) => {
    await page.clock.setFixedTime(NOW);
    tasksServer.archive('archive');
  });

  test('labels: chips in meta.labels’ text, a Labels filter, and search', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'v4', { tab: 'list' });
    await expect(page.locator('.task-card[data-id="T-002"] .label-chip')).toHaveText(['API', 'UX']);
    await openFilters(page);
    await filterButton(page, 'label', 'spike-1').click();
    await expect(matchCount(page)).toHaveText('1 of 10 tasks');
    await filterButton(page, 'label', 'all').click();
    await page.locator('#task-search').fill('spike-1');
    await expect(page.locator('.task-card')).toHaveCount(1);
  });

  test('stages: chips on cards, Done in sections, and a Stage filter', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'v4', { tab: 'kanban' });
    await expect(card(page, 'T-002').locator('.stage-chip')).toHaveText('PR #5');
    await expect(card(page, 'T-002').locator('.stage-chip')).toHaveAttribute('href', 'https://example.com/pr/5');
    await expect(card(page, 'T-001').locator('.stage-chip')).toHaveText('Merged');
    const done = page.locator('.kanban-column[data-status="done"] .kanban-section');
    await expect(done.locator('.kanban-section-header > :first-child')).toHaveText(['In PR #5', 'Done', 'Merged']);
    await openFilters(page);
    await filterButton(page, 'stage', 'in_pr').click();
    await expect(matchCount(page)).toHaveText('1 of 10 tasks');
  });

  test('In Review and Blocked: columns, how long they wait, on whom; the header counts what needs you', async ({
    page,
    tasksServer,
  }) => {
    await openDashboard(page, tasksServer, 'v4', { tab: 'kanban' });
    await expect(page.locator('.kanban-column[data-status="in_review"] .kanban-card')).toHaveCount(1);
    await expect(card(page, 'T-004').locator('.review-wait')).toHaveText('Waiting for review · 2 h');
    await expect(page.locator('.kanban-column[data-status="blocked"] .kanban-card')).toHaveCount(2);
    await expect(card(page, 'T-005').locator('.block-wait')).toHaveText('Waiting on you · 2 h 30 m · 2 questions');
    await expect(card(page, 'T-006').locator('.block-wait')).toHaveText('Waiting on an agent · 1 h · 1 question');
    await expect(page.locator('#attention-count')).toHaveText('2 need you');
  });

  test('the detail panel: questions, notes newest first, who did it, the commit, archived dependencies', async ({
    page,
    tasksServer,
  }) => {
    await openDashboard(page, tasksServer, 'v4', { tab: 'list' });
    await page.locator('.task-card[data-id="T-005"] .task-name').click();
    await expect(page.locator('#detail-blocked li')).toHaveText([
      'Which provider: SES or Postmark?',
      'Is a monthly cost of $20 fine?',
    ]);
    await page.keyboard.press('Escape');

    await page.locator('.task-card[data-id="T-003"] .task-name').click();
    await expect(page.locator('#detail-notes .note-kind')).toHaveText(['Outcome', 'Handoff']);
    await expect(page.locator('#detail-actors')).toContainText(
      'Created by Hakan · started by claude:aaaa1111 · completed by claude:aaaa1111',
    );
    await expect(page.locator('#detail-actors')).toContainText('Earlier attempts: claude:cccc3333');
    await expect(page.locator('#detail-commit code')).toHaveText('0f1e2d3');
    await page.keyboard.press('Escape');

    // A task that went through a review: started, sent for review, finished, and the work time up to the review
    await page.locator('.task-card[data-id="T-002"] .task-name').click();
    const times = page.locator('#detail-times .value');
    for (const label of ['Created:', 'Started:', 'Sent for review:', 'Finished:', 'Duration: 2 h', 'Updated:'])
      await expect(times).toContainText(label);
    await page.keyboard.press('Escape');

    await page.locator('.task-card[data-id="T-009"] .task-name').click();
    await expect(page.locator('#detail-notes .note-kind')).toHaveText(['Rejected', 'Failure']);
    await expect(page.locator('.detail-dep-item[data-archived="T-091"]')).toHaveText(/T-091\s*· archived, done/);
  });

  test('notes and questions are Markdown: code and links; the card tooltip has the plain text (T-219)', async ({
    page,
    tasksServer,
  }) => {
    const data = loadFixture('v4');
    const t3 = data.tasks.find((t) => t.id === 'T-003')!;
    t3.notes = [
      { at: '2026-04-09T08:00:00Z', by: 'Hakan', kind: 'done', text: 'Ran `npm test`; see [CI](https://ci.example/1)' },
    ];
    const t5 = data.tasks.find((t) => t.id === 'T-005')!;
    t5.questions = ['Keep **SES** or use `postmark`?'];
    await openDashboard(page, tasksServer, data, { tab: 'list' });

    await expect(page.locator('.task-card[data-id="T-005"] .block-wait')).toHaveAttribute(
      'title',
      'Keep SES or use postmark?',
    );
    await page.locator('.task-card[data-id="T-005"] .task-name').click();
    await expect(page.locator('#detail-blocked li code')).toHaveText('postmark');
    await expect(page.locator('#detail-blocked li strong')).toHaveText('SES');
    await page.keyboard.press('Escape');

    await page.locator('.task-card[data-id="T-003"] .task-name').click();
    const note = page.locator('#detail-notes .note-text');
    await expect(note).toHaveText('Ran npm test; see CI');
    await expect(note.locator('code')).toHaveText('npm test');
    await expect(note.locator('a')).toHaveAttribute('href', 'https://ci.example/1');
    // One line, no paragraph margins pushing the note away from its header
    const [head, text] = [(await page.locator('#detail-notes .note-head').boundingBox())!, (await note.boundingBox())!];
    expect(text.y - (head.y + head.height)).toBeLessThan(6);
  });

  test('commit and PR link to GitHub with meta.repository; without it a click says how to set it', async ({
    page,
    tasksServer,
  }) => {
    const data = loadFixture('v4');
    data.meta = { ...data.meta, repository: 'https://github.com/acme/demo' };
    await openDashboard(page, tasksServer, data, { tab: 'list' });
    await page.locator('.task-card[data-id="T-003"] .task-name').click();
    await expect(page.locator('#detail-commit a.repo-ref')).toHaveAttribute(
      'href',
      /^https:\/\/github\.com\/acme\/demo\/commit\/0f1e2d3/,
    );
    await page.keyboard.press('Escape');

    tasksServer.use('v4'); // no repository address
    await page.locator('#reload-btn').click();
    await page.locator('.task-card[data-id="T-003"] .task-name').click();
    await page.locator('#detail-commit button.repo-ref').click();
    await expect(page.locator('#detail-commit .repo-hint')).toContainText('atm repository set <url>');
  });

  test('actors: lanes for agents and people, an approval mark, and a Started by filter', async ({
    page,
    tasksServer,
  }) => {
    await openDashboard(page, tasksServer, 'v4', { tab: 'agents' });
    await expect(page.locator('.agent-info[data-agent="claude:aaaa1111"] .agent-kind')).toHaveAttribute(
      'data-kind',
      'agent',
    );
    await expect(page.locator('.agent-bar[data-id="T-002"] .agent-bar-approved')).toHaveAttribute('data-by', 'Hakan');
    await openFilters(page);
    await filterButton(page, 'agent', 'claude:bbbb2222').click();
    await expect(matchCount(page)).toHaveText('2 of 10 tasks');
  });
});
