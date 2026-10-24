import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { changelogModule } from './build/changelog.ts';
import { devData } from './build/dev-data.ts';
import { injectVersion } from './build/inject-version.ts';
import { renameHtmlOutput } from './build/rename-output.ts';

const pluginJson = fileURLToPath(new URL('../plugin/.claude-plugin/plugin.json', import.meta.url));
const changelog = fileURLToPath(new URL('../plugin/CHANGELOG.md', import.meta.url));
const ownTasks = fileURLToPath(new URL('../.agentic-task-manager', import.meta.url));

export default defineConfig({
  plugins: [
    // Dev server: reload the whole page on component changes. In-place component swaps can miss changes to the
    // shared dashboard state; a reload restores everything from storage anyway.
    svelte({ compilerOptions: { hmr: false } }),
    changelogModule(changelog),
    devData(ownTasks),
    viteSingleFile(),
    injectVersion(pluginJson),
    renameHtmlOutput('tasks-dashboard.html'),
  ],
  build: {
    // The build output is what the plugin ships: plugin/templates/tasks-dashboard.html (committed; CI checks it is fresh).
    // emptyOutDir must stay false: templates/ also holds the tasks.json example.
    outDir: '../plugin/templates',
    emptyOutDir: false,
  },
});
