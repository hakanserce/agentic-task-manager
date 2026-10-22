import type { Page } from '@playwright/test';
import { layoutGraph } from '../../src/lib/graph/layout';
import type { Task } from '../../src/lib/types';
import { expect, filterButton, loadFixture, openDashboard, test } from './helpers';

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

async function center(page: Page, locator = svg(page)) {
  const b = (await locator.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test.describe('graph sizing', () => {
  test('a large graph opens at 60%, centered on the task in progress', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'large-90');
    await expect(zoomLabel(page)).toHaveText('60%');
    const nodeCenter = await center(page, node(page, 'T-041'));
    const svgCenter = await center(page);
    expect(Math.abs(nodeCenter.x - svgCenter.x)).toBeLessThan(2);
    await expect(minimap(page)).toBeVisible();
    await expect(page.locator('#graph-container')).toHaveCSS('height', '560px');
  });

  test('a small graph opens at 100%, centered, without a minimap', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'cycle');
    await expect(zoomLabel(page)).toHaveText('100%');
    const v = await view(page);
    const { w } = contentSize('cycle');
    expect(v.k).toBeCloseTo(1);
    expect(v.x).toBeCloseTo((v.vw - w) / 2, 0);
    await expect(minimap(page)).toBeHidden();
  });

  test('a medium graph is scaled down to fit entirely', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    const v = await view(page);
    const { w, h } = contentSize('standard');
    expect(v.k).toBeLessThan(1);
    expect(v.k).toBeGreaterThanOrEqual(0.6);
    expect(v.x).toBeGreaterThanOrEqual(0);
    expect(v.x + w * v.k).toBeLessThanOrEqual(v.vw + 0.5);
    expect(v.y + h * v.k).toBeLessThanOrEqual(v.vh + 0.5);
    await expect(minimap(page)).toBeHidden();
    // Tall enough for the graph at 100%: content + 2 × 24px padding + 2px border
    await expect(page.locator('#graph-container')).toHaveCSS('height', `${h + 50}px`);
  });
});

test.describe('pan and zoom', () => {
  test.beforeEach(async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'large-90');
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
  test('a reload keeps a moved view; changing the visible tasks re-fits', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'large-90');
    await expect(zoomLabel(page)).toHaveText('60%');
    const initial = await view(page);

    await page.locator('#graph-container').focus();
    await page.keyboard.press('+');
    const moved = await view(page);
    await page.locator('#reload-btn').click();
    await expect.poll(() => tasksServer.requests).toBe(2);
    expect(await view(page)).toEqual(moved);

    await filterButton(page, 'phase', '1').click();
    await filterButton(page, 'phase', 'all').click();
    expect(await view(page)).toEqual(initial);
  });

  test('collapsing and expanding keeps the view', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'large-90');
    await expect(zoomLabel(page)).toHaveText('60%');
    const header = page.locator('#graph-section .phase-header');
    await header.click();
    await header.click();
    await expect(zoomLabel(page)).toHaveText('60%');
    await expect(minimap(page)).toBeVisible();
  });

  test('no minimap or controls state for an empty filter result', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    await filterButton(page, 'status', 'blocked').click();
    await filterButton(page, 'type', 'docs').click();
    await expect(svg(page)).toContainText('No tasks match current filters');
    await expect(minimap(page)).toBeHidden();
  });
});
