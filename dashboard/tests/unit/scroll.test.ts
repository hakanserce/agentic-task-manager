import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollToTask } from '../../src/lib/scroll';

describe('scrollToTask', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('scrolls the card into view and highlights it for a moment', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="task-T-001"></div>';
    const card = document.getElementById('task-T-001')!;
    card.scrollIntoView = vi.fn();
    scrollToTask('T-001');
    expect(card.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(card.style.borderColor).toBe('var(--yellow)');
    vi.advanceTimersByTime(2000);
    expect(card.style.borderColor).toBe('');
    expect(card.style.boxShadow).toBe('');
  });

  it('does nothing for a task without a card', () => {
    expect(() => scrollToTask('T-404')).not.toThrow();
  });
});
