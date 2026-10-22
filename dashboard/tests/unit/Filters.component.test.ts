import { fireEvent, render } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import Filters from '../../src/components/Filters.svelte';
import { dashboard } from '../../src/lib/state.svelte';
import standard from '../fixtures/standard.json';
import { loadIntoDashboard } from './components.helpers';

const button = (container: HTMLElement, group: string, value: string) =>
  container.querySelector(`.filter-btn[data-filter="${group}"][data-value="${value}"]`) as HTMLElement;

describe('Filters', () => {
  beforeEach(() => loadIntoDashboard(standard));

  it('renders nothing until tasks are loaded', () => {
    dashboard.loaded = false;
    const { container } = render(Filters);
    expect(container.querySelector('#filters')).toBeEmptyDOMElement();
  });

  it('renders a button per option plus "All" for each group', () => {
    const { container } = render(Filters);
    const values = (group: string) =>
      [...container.querySelectorAll(`.filter-btn[data-filter="${group}"]`)].map(
        (b) => (b as HTMLElement).dataset.value,
      );
    expect(values('phase')).toEqual(['all', '0', '1', '2']);
    expect(values('status')).toEqual(['all', 'todo', 'in_progress', 'done', 'blocked', 'skipped']);
    expect(container.querySelectorAll('.filter-btn.active')).toHaveLength(3);
  });

  it('toggles filters and active classes', async () => {
    const { container } = render(Filters);
    await fireEvent.click(button(container, 'type', 'feature'));
    expect([...dashboard.filters.type]).toEqual(['feature']);
    expect(button(container, 'type', 'feature')).toHaveClass('active');
    expect(button(container, 'type', 'all')).not.toHaveClass('active');
    expect(dashboard.filtered.map((t) => t.id)).toEqual(['T-004', 'T-005', 'T-011']);

    await fireEvent.click(button(container, 'type', 'all'));
    expect(dashboard.filters.type.size).toBe(0);
    expect(button(container, 'type', 'all')).toHaveClass('active');
  });

  it('includes the refresh controls', () => {
    const { container } = render(Filters);
    expect(container.querySelector('#reload-btn')).not.toBeNull();
    expect(container.querySelector('#auto-refresh-check')).not.toBeChecked(); // loadIntoDashboard switches it off
    expect(container.querySelector('#auto-refresh-interval')).toHaveValue(5);
  });
});
