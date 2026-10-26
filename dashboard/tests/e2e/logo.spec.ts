// The ATM logo (src/assets/atm-logo.svg): the favicon and About. The title bar shows only the project's own logo.
import { expect, openDashboard, test } from './helpers';

test.describe('logo', () => {
  test('the built page has it as an inline favicon', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    const href = await page.locator('link[rel="icon"]').getAttribute('href');
    expect(href).toMatch(/^data:image\/svg\+xml,/);
    expect(decodeURIComponent(href!)).toContain('viewBox="0 0 32 32"');
  });

  test('in About, in the accent colour; not in the title bar', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    await expect(page.locator('.title-row .atm-logo')).toHaveCount(0);
    await page.locator('#footer-about').click();
    const logo = page.locator('#about-logo svg');
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute('stroke', 'currentColor');
    // The accent colour: the same as a link's (both use --accent)
    const [logoColor, accent] = await page.evaluate(() => {
      const probe = Object.assign(document.createElement('span'), { style: 'color: var(--accent)' });
      document.body.append(probe);
      const colors = [getComputedStyle(document.querySelector('#about-logo')!).color, getComputedStyle(probe).color];
      probe.remove();
      return colors;
    });
    expect(logoColor).toBe(accent);
  });
});
