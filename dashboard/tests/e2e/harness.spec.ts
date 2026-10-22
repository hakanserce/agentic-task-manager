import { expect, openDashboard, test } from './helpers';

const DATA = {
  meta: { project: 'Harness Check' },
  tasks: [
    { id: 'T-001', name: 'Only task', phase: 0, type: 'feature', description: 'd', status: 'todo', dependencies: [] },
  ],
};

test('serves the dashboard with a routed tasks.json', async ({ page, tasksServer }) => {
  await openDashboard(page, tasksServer, DATA);
  await expect(page).toHaveTitle('Harness Check — Task Dashboard');
  expect(tasksServer.requests).toBe(1);
});
