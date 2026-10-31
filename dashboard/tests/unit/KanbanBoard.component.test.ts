import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import KanbanBoard from '../../src/components/KanbanBoard.svelte';
import { dashboard } from '../../src/lib/state.svelte';
import standard from '../fixtures/standard.json';
import { loadIntoDashboard } from './components.helpers';

const completion = (c: HTMLElement) => c.querySelector('#kanban-completion')!;
const ringLabel = (c: HTMLElement) => completion(c).querySelector('svg.ring')!.getAttribute('aria-label');

describe('KanbanBoard completion ring', () => {
  beforeEach(() => loadIntoDashboard(standard));

  it('counts the tasks shown: done of those that count, skipped apart', () => {
    const { container } = render(KanbanBoard);
    const counted = standard.tasks.filter((t) => t.status !== 'skipped');
    const done = counted.filter((t) => t.status === 'done').length;
    const skipped = standard.tasks.length - counted.length;
    expect(completion(container)).toHaveTextContent(
      `${done} of ${counted.length} done` + (skipped ? ` · ${skipped} skipped` : ''),
    );
    const pct = Math.round((done / counted.length) * 100);
    expect(completion(container)).toHaveTextContent(new RegExp(`^${pct}% · ${done} of`));
    expect(ringLabel(container)).toBe(`Tasks shown ${pct}% done`);
  });

  it('follows the filters and the search', async () => {
    const { container } = render(KanbanBoard);
    dashboard.toggleFilter('sprint', 'Phase 1');
    await tick();
    const phase1 = standard.tasks.filter((t) => t.phase === 1 && t.status !== 'skipped');
    const done = phase1.filter((t) => t.status === 'done').length;
    expect(completion(container).querySelector('#kanban-completion-text')).toHaveTextContent(
      new RegExp(`^\\d+% · ${done} of ${phase1.length} done`),
    );
    expect(completion(container).getAttribute('title')).toMatch(`Tasks shown: ${done} of ${phase1.length} done`);

    dashboard.query = 'no task has this name';
    await tick();
    expect(completion(container)).toHaveTextContent('0% · 0 of 0 done');
    expect(ringLabel(container)).toBe('Tasks shown 0% done');
  });
});
