import { readdirSync } from 'node:fs';
import { expect, openDashboard, test } from './helpers';

const FIXTURES = readdirSync(new URL('../fixtures/', import.meta.url))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));

for (const name of FIXTURES) {
  test(`fixture "${name}" loads without errors`, async ({ page, tasksServer }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openDashboard(page, tasksServer, name);
    await expect(page.locator('#subtitle')).toContainText('loaded from tasks.json');
    expect(errors).toEqual([]);
  });
}
