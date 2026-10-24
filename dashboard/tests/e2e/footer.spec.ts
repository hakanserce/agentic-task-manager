import { readFileSync } from 'node:fs';
import { expect, openDashboard, test } from './helpers';

const plugin = JSON.parse(readFileSync(new URL('../../../plugin/.claude-plugin/plugin.json', import.meta.url), 'utf8'));

test.describe('Footer', () => {
  test.beforeEach(async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
  });

  test('shows the copyright, the version and a GitHub link on every view', async ({ page }) => {
    const footer = page.locator('#site-footer');
    for (const view of ['graph', 'kanban', 'list', 'agents', 'progress']) {
      await page.locator(`#tab-${view}`).click();
      await expect(footer).toBeVisible();
      await expect(footer).toContainText(/© \d{4} Hakan Serce · MIT License/);
      await expect(footer.locator('#footer-github')).toHaveAttribute('href', plugin.repository);
    }
  });

  test("the version opens What's new", async ({ page }) => {
    await page.locator('#footer-version').click();
    await expect(page.locator('#whats-new-overlay')).toBeVisible();
    await expect(page.locator('#version-chip .version-new')).toHaveCount(0);
  });

  test('stays at the bottom of the window while the page scrolls', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'large-90');
    await page.locator('#tab-list').click();
    const viewport = page.viewportSize()!;
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(viewport.height);
    for (const y of [0, 600, 100_000]) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      const box = (await page.locator('#site-footer').boundingBox())!;
      expect(box.y + box.height).toBeCloseTo(viewport.height, 0);
    }
  });

  test('wraps at narrow widths without scrolling sideways', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const footer = page.locator('#site-footer');
    const { scrollWidth, clientWidth } = await footer.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});
