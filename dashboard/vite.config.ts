import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { stampBuildId } from './build/build-id.ts';
import { changelogModule } from './build/changelog.ts';
import { devData } from './build/dev-data.ts';
import { helpModule } from './build/help.ts';
import { injectVersion } from './build/inject-version.ts';
import { pluginInfoModule } from './build/plugin-info.ts';
import { renameHtmlOutput } from './build/rename-output.ts';

const pluginJson = fileURLToPath(new URL('../plugin/.claude-plugin/plugin.json', import.meta.url));
const changelog = fileURLToPath(new URL('../plugin/CHANGELOG.md', import.meta.url));
const help = fileURLToPath(new URL('../docs/help.md', import.meta.url));
const ownTasks = fileURLToPath(new URL('../.agentic-task-manager', import.meta.url));

export default defineConfig({
  plugins: [
    // Dev server: reload the whole page on component changes. In-place component swaps can miss changes to the
    // shared dashboard state; a reload restores everything from storage anyway.
    svelte({ compilerOptions: { hmr: false } }),
    changelogModule(changelog),
    helpModule(help),
    pluginInfoModule(pluginJson, changelog),
    devData(ownTasks),
    viteSingleFile(),
    injectVersion(pluginJson),
    // After the page is complete, before it is renamed: plugins run their writeBundle hooks in this order
    stampBuildId(),
    renameHtmlOutput('tasks-dashboard.html'),
  ],
  build: {
    // The build output is what the plugin ships: plugin/templates/tasks-dashboard.html (committed; CI checks it is fresh).
    // emptyOutDir must stay false: templates/ also holds the tasks.json example.
    outDir: '../plugin/templates',
    emptyOutDir: false,
  },
});
