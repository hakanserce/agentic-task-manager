import { renameSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

// The plugin ships the dashboard as tasks-dashboard.html, not index.html.
export function renameHtmlOutput(fileName: string): Plugin {
  return {
    name: 'atm-rename-output',
    apply: 'build',
    writeBundle(options, bundle) {
      if (!bundle['index.html'] || !options.dir) return;
      renameSync(join(options.dir, 'index.html'), join(options.dir, fileName));
    },
  };
}
