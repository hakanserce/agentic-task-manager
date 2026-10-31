import { render } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import SprintHeader from '../../src/components/SprintHeader.svelte';
import { emptyFilters } from '../../src/lib/filters';
import { dashboard } from '../../src/lib/state.svelte';
import type { TasksFile } from '../../src/lib/types';
import sprints from '../fixtures/sprints.json';
import standard from '../fixtures/standard.json';
import { loadIntoDashboard } from './components.helpers';

const fixture = sprints as TasksFile;
const at = (date: string) => new Date(`${date}T12:00:00`).getTime();
const sprintFilter = (...ids: string[]) => ({ ...emptyFilters(), sprint: new Set(ids) });

describe('SprintHeader', () => {
  beforeEach(() => {
    loadIntoDashboard(fixture);
    dashboard.loadedAt = at('2026-04-09');
  });

  it('shows the active sprint by default: name, goal, due, release, progress, added and carried', () => {
    const { container } = render(SprintHeader);
    const header = container.querySelector('#sprint-header')!;
    expect(header).toHaveAttribute('data-state', 'active');
    expect(header.querySelector('.sprint-name')).toHaveTextContent('Ada Lovelace');
    expect(header.querySelector('.sprint-state')).toBeNull();
    expect(header.querySelector('.sprint-goal')).toHaveTextContent('Sign-in, end to end');
    expect(header.querySelector('.sprint-due')).toHaveTextContent('due in 3 days');
    expect(header.querySelector('.sprint-due')).not.toHaveClass('overdue');
    expect(header.querySelector('.sprint-release')).toHaveTextContent('release 1.0');
    expect(header.querySelector('.sprint-progress')).toHaveTextContent('0 of 3 done');
    expect(header.querySelector('.sprint-added')).toHaveTextContent('1 added mid-sprint');
    expect(header.querySelector('.sprint-carried')).toHaveTextContent('1 carried in');
  });

  it('says how many done tasks wait for the end-of-sprint review (SR-4.4)', () => {
    const tasks = (fixture.tasks ?? []).map((t) =>
      t.id === 'T-002' ? { ...t, status: 'done', sprint_review: 'pending' } : t,
    );
    loadIntoDashboard({ ...fixture, tasks });
    dashboard.loadedAt = at('2026-04-09');
    const { container } = render(SprintHeader);
    expect(container.querySelector('.sprint-review-pending')).toHaveTextContent('1 waiting for the sprint review');
  });

  it('marks an overdue sprint', () => {
    dashboard.loadedAt = at('2026-04-14');
    const { container } = render(SprintHeader);
    const due = container.querySelector('.sprint-due')!;
    expect(due).toHaveTextContent('2 days overdue');
    expect(due).toHaveClass('overdue');
  });

  it('shows the one sprint the Sprint filter selects, with its state, and no due date once closed', () => {
    dashboard.filters = sprintFilter('Foundations');
    const { container } = render(SprintHeader);
    expect(container.querySelector('.sprint-name')).toHaveTextContent('Foundations');
    expect(container.querySelector('.sprint-state')).toHaveTextContent('closed');
    expect(container.querySelector('.sprint-due')).toBeNull();
    expect(container.querySelector('.sprint-progress')).toHaveTextContent('1 of 1 done');
    expect(container.querySelector('.sprint-added')).toBeNull();
  });

  it('is not shown for several sprints, or without an active sprint', () => {
    dashboard.filters = sprintFilter('Foundations', 'Alan Turing');
    expect(render(SprintHeader).container.querySelector('#sprint-header')).toBeNull();
    loadIntoDashboard(standard as TasksFile);
    expect(render(SprintHeader).container.querySelector('#sprint-header')).toBeNull();
  });
});
