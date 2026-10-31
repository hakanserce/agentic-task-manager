import type { Page } from '@playwright/test';
import { layoutGraph } from '../../src/lib/graph/layout';
import type { Task } from '../../src/lib/types';
import { expect, filterButton, loadFixture, openDashboard, openFilters, test } from './helpers';

// The Kanban is the default tab (T-251): these open on the graph
const GRAPH = { tab: 'graph' } as const;
const svg = (page: Page) => page.locator('#dep-graph');
const zoomLabel = (page: Page) => page.locator('#graph-zoom-level');
const minimap = (page: Page) => page.locator('#graph-minimap');
const node = (page: Page, id: string) => page.locator('#dep-graph g', { hasText: id });
const button = (page: Page, title: RegExp) =>
  page.locator('.graph-controls button', { hasText: '' }).and(page.getByTitle(title));
const contentSize = (fixture: string) => {
  const { width, height } = layoutGraph(loadFixture(fixture).tasks as unknown as Task[]);
  return { w: width, h: height };
};

/** Current pan/zoom, read back from the SVG viewBox: screen = content * k + (x, y). */
async function view(page: Page) {
  return svg(page).evaluate((el) => {
    const [x0, y0, w, h] = el.getAttribute('viewBox')!.split(' ').map(Number);
    const k = el.clientWidth / w;
    return { k, x: -x0 * k, y: -y0 * k, vw: el.clientWidth, vh: el.clientHeight, vbH: h };
  });
}

/** Number of task nodes at least partly inside the graph viewport. */
async function visibleNodes(page: Page) {
  return page.locator('#dep-graph').evaluate((el) => {
    const box = el.getBoundingClientRect();
    return [...el.querySelectorAll('g')].filter((g) => {
      const r = g.getBoundingClientRect();
      return r.right > box.left && r.left < box.right && r.bottom > box.top && r.top < box.bottom;
    }).length;
  });
}

async function center(page: Page, locator = svg(page)) {
  const b = (await locator.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test.describe('graph sizing', () => {
  test('a large graph opens at 60%, centered on the task in progress', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'large-90', GRAPH);
    await expect(zoomLabel(page)).toHaveText('60%');
    const nodeCenter = await center(page, node(page, 'T-041'));
    const svgCenter = await center(page);
    expect(Math.abs(nodeCenter.x - svgCenter.x)).toBeLessThan(2);
    await expect(minimap(page)).toBeVisible();
  });

  test('the graph fills the window between the top bar and the footer', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard', GRAPH);
    const box = (await page.locator('#graph-container').boundingBox())!;
    const footer = (await page.locator('#site-footer').boundingBox())!;
    const viewport = page.viewportSize()!;
    // The footer ends at the bottom of the window; the panel ends above the footer, less its margin (16px) and the
    // panel border
    expect(footer.y + footer.height).toBeCloseTo(viewport.height, 0);
    expect(box.y + box.height).toBeGreaterThan(footer.y - 20);
    expect(box.y + box.height).toBeLessThanOrEqual(footer.y);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(viewport.height);
  });

  test('a small graph opens at 100%, centered, without a minimap', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'cycle', GRAPH);
    await expect(zoomLabel(page)).toHaveText('100%');
    const v = await view(page);
    const { w } = contentSize('cycle');
    expect(v.k).toBeCloseTo(1);
    expect(v.x).toBeCloseTo((v.vw - w) / 2, 0);
    await expect(minimap(page)).toBeHidden();
  });

  test('a medium graph is scaled down to fit entirely', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard', GRAPH);
    const v = await view(page);
    const { w, h } = contentSize('standard');
    expect(v.k).toBeLessThan(1);
    expect(v.k).toBeGreaterThanOrEqual(0.6);
    expect(v.x).toBeGreaterThanOrEqual(0);
    expect(v.x + w * v.k).toBeLessThanOrEqual(v.vw + 0.5);
    expect(v.y + h * v.k).toBeLessThanOrEqual(v.vh + 0.5);
    await expect(minimap(page)).toBeHidden();
  });
});

test.describe('pan and zoom', () => {
  test.beforeEach(async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'large-90', GRAPH);
    await expect(zoomLabel(page)).toHaveText('60%');
  });

  test('dragging pans and does not open task details', async ({ page }) => {
    const before = await view(page);
    const start = await center(page, node(page, 'T-041'));
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x - 250, start.y, { steps: 10 });
    await page.mouse.up();
    const after = await view(page);
    expect(after.x - before.x).toBeCloseTo(-250, 0);
    expect(after.k).toBe(before.k);
    await expect(page.locator('#detail-overlay')).toBeHidden();
  });

  test('a plain click on a node still opens its details', async ({ page }) => {
    await node(page, 'T-041').click();
    await expect(page.locator('#detail-panel h3')).toHaveText(/^T-041 /);
  });

  test('Ctrl/Cmd + wheel zooms around the cursor', async ({ page }) => {
    const box = (await svg(page).boundingBox())!;
    const px = 300;
    const py = 200;
    const before = await view(page);
    await page.mouse.move(box.x + px, box.y + py);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -300);
    await page.keyboard.up('Control');
    const after = await view(page);
    expect(after.k).toBeGreaterThan(before.k);
    expect((px - after.x) / after.k).toBeCloseTo((px - before.x) / before.k, 0);
    expect((py - after.y) / after.k).toBeCloseTo((py - before.y) / before.k, 0);
    await expect(zoomLabel(page)).toHaveText(`${Math.round(after.k * 100)}%`);
  });

  test('a plain wheel scrolls the page, not the graph', async ({ page }) => {
    await page.addStyleTag({ content: 'body { min-height: 3000px }' }); // the graph alone may not make the page scroll
    const before = await view(page);
    await page.mouse.move(...(Object.values(await center(page)) as [number, number]));
    await page.mouse.wheel(0, 400);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect((await view(page)).k).toBe(before.k);
  });

  test('zoom buttons', async ({ page }) => {
    await button(page, /^Zoom in/).click();
    await expect(zoomLabel(page)).toHaveText('75%');
    await button(page, /^Zoom out/).click();
    await expect(zoomLabel(page)).toHaveText('60%');
    await button(page, /^Actual size/).click();
    await expect(zoomLabel(page)).toHaveText('100%');
    await button(page, /^Fit/).click();
    const v = await view(page);
    const { w } = contentSize('large-90');
    expect(v.k).toBeLessThan(0.6);
    expect(v.x + w * v.k).toBeLessThanOrEqual(v.vw + 0.5);
    await expect(minimap(page)).toBeHidden();
  });

  test('keyboard shortcuts when the graph has focus', async ({ page }) => {
    await page.locator('#graph-container').focus();
    await page.keyboard.press('+');
    await expect(zoomLabel(page)).toHaveText('75%');
    await page.keyboard.press('-');
    await expect(zoomLabel(page)).toHaveText('60%');
    const before = await view(page);
    await page.keyboard.press('ArrowLeft');
    expect((await view(page)).x - before.x).toBeCloseTo(60, 0);
    await page.keyboard.press('0');
    await expect(zoomLabel(page)).toHaveText('100%');
    await page.keyboard.press('f');
    await expect(minimap(page)).toBeHidden();
  });

  test('clicking and dragging the minimap moves the view', async ({ page }) => {
    const { w } = contentSize('large-90');
    const mm = (await minimap(page).boundingBox())!;
    const centerContentX = async () => {
      const v = await view(page);
      return (v.vw / 2 - v.x) / v.k / w;
    };
    await page.mouse.click(mm.x + mm.width * 0.9, mm.y + mm.height / 2);
    expect(await centerContentX()).toBeCloseTo(0.9, 1);

    await page.mouse.move(mm.x + mm.width * 0.2, mm.y + mm.height / 2);
    await page.mouse.down();
    await page.mouse.move(mm.x + mm.width * 0.5, mm.y + mm.height / 2, { steps: 5 });
    await page.mouse.up();
    expect(await centerContentX()).toBeCloseTo(0.5, 1);
    await expect(page.locator('#graph-minimap-view')).toHaveCount(1);
  });
});

test.describe('view persistence', () => {
  test('a reload keeps a moved view', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'large-90', GRAPH);
    await expect(zoomLabel(page)).toHaveText('60%');
    await page.locator('#graph-container').focus();
    await page.keyboard.press('+');
    const moved = await view(page);
    await page.locator('#reload-btn').click();
    await expect.poll(() => tasksServer.requests).toBe(2);
    expect(await view(page)).toEqual(moved);
  });

  test('filtering keeps a zoom level the user chose', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'large-90', GRAPH);
    await page.locator('#graph-container').focus();
    await page.keyboard.press('+');
    await expect(zoomLabel(page)).toHaveText('75%');
    await openFilters(page);
    await page.locator('#filter-closed-sprints').click(); // phase 1 is finished, a closed sprint: listed once shown
    await filterButton(page, 'sprint', 'Phase 1').click();
    await expect(zoomLabel(page)).toHaveText('75%');
    await filterButton(page, 'sprint', 'all').click();
    await expect(zoomLabel(page)).toHaveText('75%');
  });

  test('filtering keeps the automatic zoom level too', async ({ page, tasksServer }) => {
    // standard fits at 74%; its phase 2 alone would fit at 100%, but the zoom must not jump
    await openDashboard(page, tasksServer, 'standard', GRAPH);
    const initial = await zoomLabel(page).textContent();
    expect(initial).not.toBe('100%');
    await openFilters(page);
    await filterButton(page, 'sprint', 'Phase 2').click();
    await expect(zoomLabel(page)).toHaveText(initial!);
    await expect(page.locator('#dep-graph g')).toHaveCount(4);
    expect(await visibleNodes(page)).toBeGreaterThan(0);
  });

  test('pans, at the same zoom, when no task would be visible', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'large-90', GRAPH);
    await page.locator('#graph-container').focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('+');
    const zoom = await zoomLabel(page).textContent();
    // Look at the far right end of the 90-task graph, then show only phase 0 (the far left end)
    const mm = (await minimap(page).boundingBox())!;
    await page.mouse.click(mm.x + mm.width * 0.97, mm.y + mm.height / 2);
    await openFilters(page);
    await page.locator('#filter-closed-sprints').click(); // phase 0 is finished, a closed sprint: listed once shown
    await filterButton(page, 'sprint', 'Phase 0').click();
    await expect(page.locator('#dep-graph g')).toHaveCount(14);
    await expect(zoomLabel(page)).toHaveText(zoom!);
    await expect.poll(() => visibleNodes(page)).toBeGreaterThan(0);
  });

  test('switching tabs keeps the view', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'large-90', GRAPH);
    await expect(zoomLabel(page)).toHaveText('60%');
    await page.locator('#tab-list').click();
    await page.locator('#tab-graph').click();
    await expect(zoomLabel(page)).toHaveText('60%');
    await expect(minimap(page)).toBeVisible();
  });

  test('no minimap or controls state for an empty filter result', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard', GRAPH);
    await openFilters(page);
    await filterButton(page, 'status', 'blocked').click();
    await filterButton(page, 'type', 'docs').click();
    await expect(svg(page)).toContainText('No tasks match current filters');
    await expect(minimap(page)).toBeHidden();
  });
});

test.describe('graph position is remembered per project (FR-5.7)', () => {
  test('zoom and pan come back after a reload', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'large-90', GRAPH);
    await expect(zoomLabel(page)).toHaveText('60%');
    await button(page, /zoom in/i).click();
    const c = await center(page);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x - 150, c.y - 40, { steps: 5 });
    await page.mouse.up();
    const before = await view(page);
    await page.reload();
    await expect(zoomLabel(page)).not.toHaveText('60%');
    const after = await view(page);
    expect(after.k).toBeCloseTo(before.k, 2);
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.y).toBeCloseTo(before.y, 0);
  });

  test('a saved position showing no task falls back to the automatic view', async ({ page, tasksServer }) => {
    await page.addInitScript(() =>
      localStorage.setItem(
        'atm-dashboard:view:project:Large Project',
        JSON.stringify({ graph: { k: 1, x: 99999, y: 99999 } }),
      ),
    );
    await openDashboard(page, tasksServer, 'large-90', GRAPH);
    await expect(zoomLabel(page)).toHaveText('60%');
    expect(await visibleNodes(page)).toBeGreaterThan(0);
  });
});
