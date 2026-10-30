// Makes the files in branding/ from the logo's source, dashboard/src/assets/atm-logo.svg (see README.md here).
// Run `npm run branding` in dashboard/, where Playwright is installed.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = (path) => new URL(path, import.meta.url);

export const SOURCE = here('../dashboard/src/assets/atm-logo.svg');
/** The accent blue: the favicon's colour (dashboard/build/favicon.ts), on light and dark backgrounds alike. */
export const ACCENT = '#2f81f7';
/** GitHub's dark background, behind the PNGs. */
export const BACKGROUND = '#0d1117';

/** The logo for places outside the dashboard (README, GitHub): the source, with currentColor made the accent blue. */
export function brandLogo(svg, color = ACCENT) {
  return svg
    .replace(
      /<!--[\s\S]*?-->/,
      '<!-- The ATM logo in the accent blue, for the README and GitHub. Made by branding/generate.mjs from\n' +
        "       dashboard/src/assets/atm-logo.svg: don't edit it, change the source and run `npm run branding` -->",
    )
    .replace(/currentColor/g, color);
}

const page = (width, height, style, body) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; width: ${width}px; height: ${height}px; }
      body {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        background: ${BACKGROUND};
      }
      ${style}
    </style>
  </head>
  <body>${body}</body>
</html>`;

const svgImg = (svg, size) =>
  `<img src="data:image/svg+xml,${encodeURIComponent(svg)}" width="${size}" height="${size}" alt="" />`;

/** The logo alone, 512×512: for places that take only PNG, JPG or GIF (the org's avatar on GitHub). */
export const logoPage = (svg) => ({
  file: 'atm-logo.png',
  width: 512,
  height: 512,
  html: page(512, 512, '', svgImg(svg, 360)),
});

/** GitHub's social preview card, 1280×640, shown when the repository is linked. */
export const socialPreviewPage = (svg) => ({
  file: 'social-preview.png',
  width: 1280,
  height: 640,
  html: page(
    1280,
    640,
    `body { gap: 28px; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; }
      h1 { margin: 0; font-size: 64px; font-weight: 700; letter-spacing: -1px; }
      p { margin: 0; max-width: 1100px; text-align: center; font-size: 28px; line-height: 1.4; color: #8b949e; }`,
    `${svgImg(svg, 180)}
    <h1>Agentic Task Manager</h1>
    <p>Task management for Claude Code agents, with a live dashboard of every project.</p>`,
  ),
});

async function main() {
  const logo = brandLogo(readFileSync(SOURCE, 'utf8'));
  writeFileSync(here('atm-logo.svg'), logo);
  console.log('branding/atm-logo.svg');

  // Playwright is installed in dashboard/, not next to this script
  const require = createRequire(here('../dashboard/package.json'));
  const { chromium } = require('@playwright/test');
  const browser = await chromium.launch();
  try {
    for (const { file, width, height, html } of [logoPage(logo), socialPreviewPage(logo)]) {
      const tab = await browser.newPage({ viewport: { width, height } });
      await tab.setContent(html, { waitUntil: 'load' });
      await tab.screenshot({ path: fileURLToPath(here(file)) });
      await tab.close();
      console.log(`branding/${file}`);
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
