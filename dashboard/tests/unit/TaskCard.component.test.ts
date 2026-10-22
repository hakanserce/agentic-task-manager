import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TaskCard from '../../src/components/TaskCard.svelte';
import { scrollToTask } from '../../src/lib/scroll';
import { dashboard } from '../../src/lib/state.svelte';
import type { Task } from '../../src/lib/types';
import standard from '../fixtures/standard.json';
import { loadIntoDashboard } from './components.helpers';

vi.mock('../../src/lib/scroll', () => ({ scrollToTask: vi.fn() }));

const task = (id: string) => dashboard.taskMap.get(id) as Task;

describe('TaskCard', () => {
  beforeEach(() => {
    loadIntoDashboard(standard);
    vi.mocked(scrollToTask).mockClear();
  });

  it('renders the legacy card structure', () => {
    const { container } = render(TaskCard, { task: task('T-004') });
    const card = container.querySelector('.task-card')!;
    expect(card).toHaveAttribute('id', 'task-T-004');
    expect(card).toHaveAttribute('data-id', 'T-004');
    expect(card).toHaveClass('status-done');
    expect([...card.querySelectorAll('.task-meta .badge')].map((b) => b.textContent)).toEqual([
      'P1',
      'feature',
      'done',
    ]);
    expect([...card.querySelectorAll('.uc-badge, .req-badge')].map((b) => b.textContent)).toEqual([
      'UC-001',
      'FR-1.1',
      'FR-1.2',
    ]);
  });

  it('dependency links show the target name and scroll to it', async () => {
    render(TaskCard, { task: task('T-004') });
    const link = screen.getByText('T-002');
    expect(link).toHaveAttribute('title', 'Write contributing guide');
    await fireEvent.click(link);
    expect(scrollToTask).toHaveBeenCalledWith('T-002');
  });

  it('clicking the name opens the detail panel', async () => {
    render(TaskCard, { task: task('T-004') });
    await fireEvent.click(screen.getByText('User login'));
    expect([dashboard.detailId, dashboard.detailOpen]).toEqual(['T-004', true]);
  });

  it('escapes task text', () => {
    const t = { ...task('T-001'), name: '<b>Bold</b>' };
    const { container } = render(TaskCard, { task: t });
    expect(container.querySelector('.task-name')!.textContent).toBe('<b>Bold</b>');
    expect(container.querySelector('.task-name b')).toBeNull();
  });

  it('has no dependency label or tags when there are none', () => {
    const { container } = render(TaskCard, { task: task('T-001') });
    expect(container.querySelector('.deps-label')).toBeNull();
    expect(container.querySelector('.task-tags')).toBeEmptyDOMElement();
  });
});
