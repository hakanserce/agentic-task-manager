import { readFileSync } from 'node:fs';
import { expect, test } from './helpers';

// Checks on the shipped artifact itself (plugin/templates/tasks-dashboard.html), not on its behavior.
const BUILT = new URL('../../../plugin/templates/tasks-dashboard.html', import.meta.url);
const PLUGIN_JSON = new URL('../../../plugin/.claude-plugin/plugin.json', import.meta.url);
const MAX_BYTES = 200 * 1024;

test.describe('shipped dashboard file', () => {
  const html = () => readFileSync(BUILT, 'utf8');

  test('is a single self-contained file', () => {
    const h = html();
    expect(h).not.toMatch(/<script[^>]+\bsrc=/i);
    expect(h).not.toMatch(/<link[^>]+rel=["']?(stylesheet|modulepreload|icon)/i);
    expect(h).not.toMatch(/url\(\s*["']?https?:/i);
    expect(h).not.toMatch(/@import/i);
  });

  test(`stays under ${MAX_BYTES / 1024} KB`, () => {
    expect(Buffer.byteLength(html())).toBeLessThan(MAX_BYTES);
  });

  test('carries the plugin version', () => {
    const { version } = JSON.parse(readFileSync(PLUGIN_JSON, 'utf8'));
    expect(html()).toContain(`<meta name="atm-dashboard-version" content="${version}"`);
  });
});
