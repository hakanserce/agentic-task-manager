import { fireEvent, render } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import Header from '../../src/components/Header.svelte';
import { dashboard } from '../../src/lib/state.svelte';
import standard from '../fixtures/standard.json';
import { loadIntoDashboard } from './components.helpers';

describe('Header', () => {
  beforeEach(() => loadIntoDashboard(standard));

  it('has no attention count when nothing needs the user', () => {
    const { container } = render(Header);
    expect(container.querySelector('#attention-count')).toBeNull();
  });

  it('counts tasks in review and tasks blocked on the user, and opens the Kanban', async () => {
    const tasks = standard.tasks.map((t) =>
      t.id === 'T-005'
        ? { ...t, status: 'in_review' }
        : t.id === 'T-008'
          ? { ...t, status: 'blocked', waiting_on: 'user', questions: ['Which DB?'] }
          : t,
    );
    loadIntoDashboard({ ...standard, tasks });
    const { container } = render(Header);
    const chip = container.querySelector('#attention-count')!;
    expect(chip).toHaveTextContent('2 need you');
    expect(chip.getAttribute('title')).toMatch(/^T-005 .+\nT-008 /);
    await fireEvent.click(chip);
    expect(dashboard.tab).toBe('kanban');
  });
});
