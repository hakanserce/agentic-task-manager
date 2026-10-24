import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { parseChangelog } from '../src/lib/changelog.ts';
import type { PluginInfo } from '../src/lib/plugin-info.ts';

const ID = 'virtual:atm-plugin-info';
const RESOLVED_ID = '\0' + ID;

/**
 * What the footer and the About dialog show, from plugin.json. The copyright year is the year of the newest dated
 * release in the changelog rather than the build date, so rebuilding the same sources gives the same file (CI checks
 * the committed build is fresh).
 */
export function readPluginInfo(pluginJson: string, changelog: string): PluginInfo {
  const plugin = JSON.parse(pluginJson);
  const released = parseChangelog(changelog).find((entry) => entry.date);
  if (!released?.date) throw new Error('No dated release in the changelog');
  return {
    name: plugin.name,
    description: plugin.description,
    version: plugin.version,
    author: plugin.author?.name,
    license: plugin.license,
    repository: plugin.repository,
    year: released.date.slice(0, 4),
  };
}

// Exposes readPluginInfo's result as `import info from 'virtual:atm-plugin-info'`, inlined in the build.
export function pluginInfoModule(pluginJsonPath: string, changelogPath: string): Plugin {
  return {
    name: 'atm-plugin-info',
    resolveId: (id) => (id === ID ? RESOLVED_ID : undefined),
    load(id) {
      if (id !== RESOLVED_ID) return;
      this.addWatchFile(pluginJsonPath);
      this.addWatchFile(changelogPath);
      const info = readPluginInfo(readFileSync(pluginJsonPath, 'utf8'), readFileSync(changelogPath, 'utf8'));
      return `export default ${JSON.stringify(info)};`;
    },
  };
}
