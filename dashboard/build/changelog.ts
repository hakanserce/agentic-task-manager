import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { parseChangelog } from '../src/lib/changelog.ts';

const ID = 'virtual:atm-changelog';
const RESOLVED_ID = '\0' + ID;

// Exposes plugin/CHANGELOG.md, already parsed, as `import changelog from 'virtual:atm-changelog'`.
// The release notes end up inlined in the single-file build: no runtime request, no Markdown library.
export function changelogModule(changelogPath: string): Plugin {
  return {
    name: 'atm-changelog',
    resolveId: (id) => (id === ID ? RESOLVED_ID : undefined),
    load(id) {
      if (id !== RESOLVED_ID) return;
      this.addWatchFile(changelogPath);
      return `export default ${JSON.stringify(parseChangelog(readFileSync(changelogPath, 'utf8')))};`;
    },
  };
}
