import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

const META_RE = /(<meta name="atm-dashboard-version" content=")[^"]*(")/;

export function readPluginVersion(pluginJsonPath: string): string {
  const { version } = JSON.parse(readFileSync(pluginJsonPath, 'utf8'));
  if (typeof version !== 'string' || !version) throw new Error('No version in ' + pluginJsonPath);
  return version;
}

export function setDashboardVersion(html: string, version: string): string {
  if (!META_RE.test(html)) throw new Error('atm-dashboard-version meta tag not found in index.html');
  return html.replace(META_RE, '$1' + version + '$2');
}

// Stamps the plugin version into <meta name="atm-dashboard-version">; /atm:update-dashboard compares it.
export function injectVersion(pluginJsonPath: string): Plugin {
  return {
    name: 'atm-inject-version',
    transformIndexHtml: (html) => setDashboardVersion(html, readPluginVersion(pluginJsonPath)),
  };
}
