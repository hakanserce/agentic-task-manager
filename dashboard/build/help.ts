import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { parseMarkdown } from '../src/lib/markdown.ts';

const ID = 'virtual:atm-help';
const RESOLVED_ID = '\0' + ID;

// Exposes docs/help.md, already parsed (src/lib/markdown.ts), as `import help from 'virtual:atm-help'`.
// Help ends up inlined in the single-file build, so it works offline and matches the dashboard's version.
export function helpModule(helpPath: string): Plugin {
  return {
    name: 'atm-help',
    resolveId: (id) => (id === ID ? RESOLVED_ID : undefined),
    load(id) {
      if (id !== RESOLVED_ID) return;
      this.addWatchFile(helpPath);
      return `export default ${JSON.stringify(parseMarkdown(readFileSync(helpPath, 'utf8')))};`;
    },
  };
}
