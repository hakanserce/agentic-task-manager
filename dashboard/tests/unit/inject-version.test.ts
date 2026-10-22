// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readPluginVersion, setDashboardVersion } from '../../build/inject-version';

const meta = (v: string) => `<meta name="atm-dashboard-version" content="${v}">`;

describe('setDashboardVersion', () => {
  it('replaces the version in the meta tag', () => {
    expect(setDashboardVersion(`<head>${meta('0.0.0')}</head>`, '1.2.3')).toBe(`<head>${meta('1.2.3')}</head>`);
  });

  it('throws when the meta tag is missing', () => {
    expect(() => setDashboardVersion('<head></head>', '1.2.3')).toThrow(/meta tag not found/);
  });
});

describe('readPluginVersion', () => {
  it('reads the version from the real plugin.json', () => {
    const path = fileURLToPath(new URL('../../../plugin/.claude-plugin/plugin.json', import.meta.url));
    expect(readPluginVersion(path)).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
