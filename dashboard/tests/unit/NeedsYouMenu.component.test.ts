import { fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import NeedsYouMenu from '../../src/components/NeedsYouMenu.svelte';
import { dashboard } from '../../src/lib/state.svelte';
import standard from '../fixtures/standard.json';
import { loadIntoDashboard } from './components.helpers';

/** standard.json with `review` in review and `blocked` blocked on a question for the user. */
function needing(review: string[], blocked: string[] = []) {
  const tasks = standard.tasks.map((t) =>
    review.includes(t.id)
      ? { ...t, status: 'in_review' }
      : blocked.includes(t.id)
        ? { ...t, status: 'blocked', waiting_on: 'user', questions: ['Which DB?'] }
        : t,
  );
  loadIntoDashboard({ ...standard, tasks });
}

const rows = (c: HTMLElement) => [...c.querySelectorAll<HTMLButtonElement>('.needs-you-row')];

describe('NeedsYouMenu', () => {
  beforeEach(() => loadIntoDashboard(standard));

  it('is not there when nothing needs the user', () => {
    const { container } = render(NeedsYouMenu);
    expect(container.querySelector('#attention-count')).toBeNull();
  });

  it('one task: the chip opens its details, with no list', async () => {
    needing(['T-005']);
    const { container } = render(NeedsYouMenu);
    const chip = container.querySelector('#attention-count')!;
    expect(chip).toHaveTextContent('1 needs you');
    expect(chip.getAttribute('aria-haspopup')).toBeNull();
    await fireEvent.click(chip);
    expect(container.querySelector('#needs-you-menu')).toBeNull();
    expect(dashboard.detailOpen).toBe(true);
    expect(dashboard.detailId).toBe('T-005');
  });

  it('several: the chip lists them with why; a row opens that task and closes the list', async () => {
    needing(['T-005'], ['T-008', 'T-010']);
    const { container } = render(NeedsYouMenu);
    const chip = container.querySelector<HTMLButtonElement>('#attention-count')!;
    expect(chip).toHaveTextContent('3 need you');
    await fireEvent.click(chip);
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    const list = rows(container);
    expect(list.map((r) => r.dataset.id)).toEqual(['T-005', 'T-008', 'T-010']);
    const t8 = standard.tasks.find((t) => t.id === 'T-008')!;
    expect(list[1]).toHaveTextContent(`T-008 ${t8.name} blocked on a question`);
    expect(list[0].querySelector('.needs-you-reason')).toHaveTextContent('in review');
    expect(document.activeElement).toBe(list[0]);
    await fireEvent.click(list[1]);
    expect(dashboard.detailId).toBe('T-008');
    expect(dashboard.detailOpen).toBe(true);
    expect(container.querySelector('#needs-you-menu')).toBeNull();
    expect(document.activeElement).toBe(chip);
  });

  it('keyboard: the arrows, Home and End move; Escape closes and returns focus to the chip', async () => {
    needing(['T-005'], ['T-008', 'T-010']);
    const { container } = render(NeedsYouMenu);
    const chip = container.querySelector<HTMLButtonElement>('#attention-count')!;
    await fireEvent.click(chip);
    const menu = container.querySelector('#needs-you-menu')!;
    const [a, b, c] = rows(container);
    await fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(b);
    await fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(c);
    await fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(c);
    await fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(a);
    await fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(a);
    await fireEvent.keyDown(menu, { key: 'Escape' });
    expect(container.querySelector('#needs-you-menu')).toBeNull();
    expect(document.activeElement).toBe(chip);
    expect(dashboard.detailOpen).toBe(false);
  });

  it('closes on a click outside, and with the chip', async () => {
    needing(['T-005', 'T-008']);
    const { container } = render(NeedsYouMenu);
    const chip = container.querySelector<HTMLButtonElement>('#attention-count')!;
    await fireEvent.click(chip);
    await fireEvent.click(document.body);
    expect(container.querySelector('#needs-you-menu')).toBeNull();
    await fireEvent.click(chip);
    expect(container.querySelector('#needs-you-menu')).not.toBeNull();
    await fireEvent.click(chip);
    expect(container.querySelector('#needs-you-menu')).toBeNull();
  });

  it('closes when fewer than two tasks are left to list', async () => {
    needing(['T-005', 'T-008']);
    const { container } = render(NeedsYouMenu);
    await fireEvent.click(container.querySelector('#attention-count')!);
    needing(['T-005']);
    await tick();
    expect(container.querySelector('#needs-you-menu')).toBeNull();
  });
});
