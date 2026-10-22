import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { parseChangelog } from '../../src/lib/changelog';
import { expect, openDashboard, test } from './helpers';

const pluginVersion: string = JSON.parse(
  readFileSync(new URL('../../../plugin/.claude-plugin/plugin.json', import.meta.url), 'utf8'),
).version;
const entries = parseChangelog(readFileSync(new URL('../../../plugin/CHANGELOG.md', import.meta.url), 'utf8'));

const chip = (page: Page) => page.locator('#version-chip');
const overlay = (page: Page) => page.locator('#whats-new-overlay');
const panel = (page: Page) => page.locator('#whats-new-panel');

test.describe("What's new", () => {
  test.beforeEach(async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
  });

  test('the header shows the dashboard version', async ({ page }) => {
    await expect(chip(page)).toHaveText(`v${pluginVersion}`);
    // The title keeps its exact text; the chip sits next to it
    await expect(page.locator('#dashboard-title')).toHaveText('Standard Project — Task Dashboard');
  });

  test('the chip opens release notes, newest first', async ({ page }) => {
    await expect(overlay(page)).toBeHidden();
    await chip(page).click();
    await expect(overlay(page)).toBeVisible();
    const versions = await panel(page)
      .locator('.release')
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.version));
    expect(versions).toEqual(entries.map((e) => e.version));

    const v060 = panel(page).locator('.release[data-version="0.6.0"]');
    await expect(v060.locator('h4')).toHaveText(/^v0\.6\.0\s*2026-10-22$/);
    await expect(v060.locator('.release-section').first()).toHaveText('Added');
    await expect(v060.locator('li').first()).toContainText('Dependency graph zoom and pan');
  });

  test('inline code is shown as code, as plain text', async ({ page }) => {
    await chip(page).click();
    const code = panel(page).locator('.release[data-version="0.5.0"] code', { hasText: 'atm@hakanserce-plugins' });
    await expect(code).toHaveCount(1);
    await expect(panel(page)).not.toContainText('`');
  });

  test('closes with ×, the backdrop and Escape', async ({ page }) => {
    await chip(page).click();
    await panel(page).locator('.detail-close').click();
    await expect(overlay(page)).toBeHidden();

    await chip(page).click();
    await panel(page).locator('h3').click();
    await expect(overlay(page)).toBeVisible();
    await overlay(page).click({ position: { x: 5, y: 5 } });
    await expect(overlay(page)).toBeHidden();

    await chip(page).click();
    await page.keyboard.press('Escape');
    await expect(overlay(page)).toBeHidden();
  });
});
