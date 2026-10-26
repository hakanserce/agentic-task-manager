// The ATM logo (src/assets/atm-logo.svg): the favicon, next to the title, and in About
import { expect, openDashboard, test } from './helpers';

test.describe('logo', () => {
  test('the built page has it as an inline favicon', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    const href = await page.locator('link[rel="icon"]').getAttribute('href');
    expect(href).toMatch(/^data:image\/svg\+xml,/);
    expect(decodeURIComponent(href!)).toContain('viewBox="0 0 32 32"');
  });

  test('next to the title, in the accent colour, and in About', async ({ page, tasksServer }) => {
    await openDashboard(page, tasksServer, 'standard');
    const logo = page.locator('#title-logo svg');
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute('width', '24');
    await expect(logo).toHaveAttribute('stroke', 'currentColor');
    // The accent colour: the same as a link's (both use --accent)
    const [logoColor, accent] = await page.evaluate(() => {
      const probe = Object.assign(document.createElement('span'), { style: 'color: var(--accent)' });
      document.body.append(probe);
      const colors = [getComputedStyle(document.querySelector('#title-logo')!).color, getComputedStyle(probe).color];
      probe.remove();
      return colors;
    });
    expect(logoColor).toBe(accent);
    await page.locator('#footer-about').click();
    await expect(page.locator('#about-logo svg')).toBeVisible();
  });
});
