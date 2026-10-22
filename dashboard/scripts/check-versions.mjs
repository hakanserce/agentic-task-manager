// Fails if the plugin manifest and the marketplace entry disagree on the atm version, or if plugin/CHANGELOG.md
// has no entry for that version (release notes are shown in the dashboard and by /atm:update-dashboard).
import { readFileSync } from 'node:fs';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const plugin = read('../../plugin/.claude-plugin/plugin.json');
const marketplace = read('../../.claude-plugin/marketplace.json');
const entry = marketplace.plugins.find((p) => p.name === plugin.name);

if (!entry) {
  console.error(`marketplace.json has no entry for plugin "${plugin.name}"`);
  process.exit(1);
}
if (entry.version !== plugin.version) {
  console.error(`Version mismatch: plugin.json ${plugin.version}, marketplace.json ${entry.version}`);
  process.exit(1);
}
const changelog = readFileSync(new URL('../../plugin/CHANGELOG.md', import.meta.url), 'utf8');
const escaped = plugin.version.replace(/\./g, '\\.');
if (!new RegExp(`^## \\[${escaped}\\]`, 'm').test(changelog)) {
  console.error(`plugin/CHANGELOG.md has no "## [${plugin.version}]" entry. Add release notes for this version.`);
  process.exit(1);
}
console.log(`atm ${plugin.version}: plugin.json, marketplace.json and CHANGELOG.md agree`);
