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

test.describe('themes', () => {
  const tokens = (page: Page) =>
    page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return { bg: s.getPropertyValue('--bg').trim(), accent: s.getPropertyValue('--accent').trim() };
    });

  test('picking a theme changes the colours, per mode, and is remembered', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    await expect(page.locator('#theme-select option')).toHaveText(['Default', 'Nord', 'Solarized']);
    const before = await tokens(page);
    await page.locator('#theme-select').selectOption('nord');
    await expect(html(page)).toHaveAttribute('data-theme', 'nord');
    expect(await tokens(page)).toEqual({ bg: '#2e3440', accent: '#88c0d0' });
    expect(await tokens(page)).not.toEqual(before);
    await page.locator('.mode-btn[data-mode="light"]').click();
    expect((await tokens(page)).bg).toBe('#eceff4');
    await page.reload();
    await expect(page.locator('#theme-select')).toHaveValue('nord');
    await expect(html(page)).toHaveAttribute('data-theme', 'nord');
    await expect(html(page)).toHaveAttribute('data-mode', 'light');
  });

  test('an unknown stored theme falls back to Default', async ({ page, tasksServer }) => {
    await page.addInitScript(() => localStorage.setItem('atm-dashboard', JSON.stringify({ theme: 'vaporwave' })));
    await openDashboard(page, tasksServer, 'standard');
    await expect(page.locator('#theme-select')).toHaveValue('default');
    await expect(html(page)).toHaveAttribute('data-theme', 'default');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(DARK_BG);
  });
});
