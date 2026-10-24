import type { Page } from '@playwright/test';
import { expect, openDashboard, test } from './helpers';

// FR-2: light and dark modes. The dashboard follows the OS (prefers-color-scheme) until a mode is chosen; the
// choice is remembered per browser and applied before the first paint.
const html = (page: Page) => page.locator('html');
const bodyBackground = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const DARK_BG = 'rgb(13, 17, 23)';
const LIGHT_BG = 'rgb(255, 255, 255)';

test.describe('light and dark mode', () => {
  test('System follows the OS setting, also when it changes while the page is open', async ({ page, tasksServer }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await openDashboard(page, tasksServer, 'standard');
    await expect(page.locator('.mode-btn[data-mode="system"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(html(page)).toHaveAttribute('data-mode', 'light');
    expect(await bodyBackground(page)).toBe(LIGHT_BG);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(html(page)).toHaveAttribute('data-mode', 'dark');
    expect(await bodyBackground(page)).toBe(DARK_BG);
  });

  test('choosing Light or Dark overrides the OS and is remembered', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard'); // tests run with a dark OS setting
    await page.locator('.mode-btn[data-mode="light"]').click();
    await expect(html(page)).toHaveAttribute('data-mode', 'light');
    await expect(page.locator('.mode-btn[data-mode="light"]')).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(html(page)).toHaveAttribute('data-mode', 'light');
    expect(await bodyBackground(page)).toBe(LIGHT_BG);
    await page.locator('.mode-btn[data-mode="dark"]').click();
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(html(page)).toHaveAttribute('data-mode', 'dark');
  });

  test('the stored mode is applied before anything is painted', async ({ page, tasksServer }) => {
    // Record the mode at the moment <body> is created: nothing can be painted before that
    await page.addInitScript(() => {
      localStorage.setItem('atm-dashboard', JSON.stringify({ mode: 'light', autoRefresh: false }));
      new MutationObserver((_, observer) => {
        if (!document.body) return;
        (window as unknown as { modeAtBody: string }).modeAtBody = document.documentElement.dataset.mode ?? 'unset';
        observer.disconnect();
      }).observe(document, { childList: true, subtree: true }); // <html> doesn't exist yet when this runs
    });
    await openDashboard(page, tasksServer, 'standard');
    expect(await page.evaluate(() => (window as unknown as { modeAtBody: string }).modeAtBody)).toBe('light');
  });

  test('broken or blocked storage falls back to the OS setting', async ({ page, tasksServer }) => {
    await page.addInitScript(() => localStorage.setItem('atm-dashboard', '{not json'));
    await page.emulateMedia({ colorScheme: 'light' });
    await openDashboard(page, tasksServer, 'standard');
    await expect(html(page)).toHaveAttribute('data-mode', 'light');
    await expect(html(page)).toHaveAttribute('data-theme', 'default');
  });
});
