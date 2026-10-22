import type { Page } from '@playwright/test';
import { expect, filterButton, openDashboard, test } from './helpers';

const nodes = (page: Page) => page.locator('#dep-graph g');
const edges = (page: Page) => page.locator('#dep-graph path[marker-end]');

/** Task IDs grouped by graph column (topological layer), left to right, top to bottom. */
async function columns(page: Page) {
  const placed = await nodes(page).evaluateAll((gs) =>
    gs.map((g) => ({
      id: /T-\d+/.exec(g.textContent ?? '')?.[0],
      x: Number(g.querySelector('rect')?.getAttribute('x')),
      y: Number(g.querySelector('rect')?.getAttribute('y')),
    })),
  );
  const byX = new Map<number, typeof placed>();
  for (const n of placed) byX.set(n.x, [...(byX.get(n.x) ?? []), n]);
  return [...byX.keys()]
    .sort((a, b) => a - b)
    .map((x) =>
      byX
        .get(x)!
        .sort((a, b) => a.y - b.y)
        .map((n) => n.id),
    );
}

test.describe('dependency graph', () => {
  test('one node per task and one edge per dependency', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    await expect(nodes(page)).toHaveCount(12);
    await expect(edges(page)).toHaveCount(12);
    await expect(page.locator('#graph-badge')).toHaveText('12 tasks');
  });

  test('lays tasks out in topological columns', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    expect(await columns(page)).toEqual([
      ['T-001', 'T-010', 'T-012'],
      ['T-002', 'T-003'],
      ['T-004'],
      ['T-005', 'T-006'],
      ['T-007', 'T-008'],
      ['T-009'],
      ['T-011'],
    ]);
  });

  test('nodes show id and name', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    const node = nodes(page).filter({ hasText: 'T-004' });
    await expect(node).toContainText('User login');
  });

  test('a dependency cycle still renders every task', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'cycle');
    await expect(nodes(page)).toHaveCount(5);
    await expect(edges(page)).toHaveCount(5);
    expect(await columns(page)).toEqual([['T-001'], ['T-002', 'T-003', 'T-004', 'T-005']]);
  });

  test('hidden dependencies are ignored for layout and edges', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    await filterButton(page, 'phase', '2').click();
    await expect(nodes(page)).toHaveCount(4);
    await expect(edges(page)).toHaveCount(2);
    expect(await columns(page)).toEqual([['T-008', 'T-010'], ['T-009'], ['T-011']]);
  });

  test('header toggles the graph', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    const header = page.locator('#graph-section .phase-header');
    const container = page.locator('#graph-container');
    await expect(container).toBeVisible();
    await header.click();
    await expect(container).toBeHidden();
    await header.click();
    await expect(container).toBeVisible();
  });
});
