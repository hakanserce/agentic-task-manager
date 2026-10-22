import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { injectVersion } from './build/inject-version';
import { renameHtmlOutput } from './build/rename-output';

const pluginJson = fileURLToPath(new URL('../plugin/.claude-plugin/plugin.json', import.meta.url));

export default defineConfig({
  plugins: [svelte(), viteSingleFile(), injectVersion(pluginJson), renameHtmlOutput('tasks-dashboard.html')],
  build: {
    // Stays in dist/ until cutover (T-023), then switches to ../plugin/templates
    outDir: 'dist',
    emptyOutDir: true,
  },
});
