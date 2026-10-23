import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { changelogModule } from './build/changelog.ts';

const changelog = fileURLToPath(new URL('../plugin/CHANGELOG.md', import.meta.url));

export default defineConfig({
  plugins: [svelte(), svelteTesting(), changelogModule(changelog)],
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/unit/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**'],
      thresholds: { lines: 90 },
    },
  },
});
