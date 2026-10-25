import { render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import DetailPanel from '../../src/components/DetailPanel.svelte';
import { dashboard } from '../../src/lib/state.svelte';
import standard from '../fixtures/standard.json';
import { loadIntoDashboard } from './components.helpers';

function open(fields: Record<string, unknown>, id = 'T-005') {
  const tasks = standard.tasks.map((t) => (t.id === id ? { ...t, ...fields } : t));
  loadIntoDashboard({ ...standard, tasks });
  const result = render(DetailPanel);
  dashboard.showDetail(id);
  flushSync();
  return result.container;
}

describe('DetailPanel', () => {
  beforeEach(() => loadIntoDashboard(standard));

  it('lists the notes newest first, with kind, author and time; a legacy last_failure among them', () => {
    const container = open({
      notes: [
        { at: '2026-04-01T08:00:00Z', by: 'claude:aaaa', kind: 'handoff', text: 'Toolbar done; links left' },
        { at: '2026-04-02T08:00:00Z', by: 'Hakan', kind: 'rejection', text: 'Use the icon set' },
      ],
      last_failure: { at: '2026-04-01T12:00:00Z', reason: 'lint failed' },
    });
    const items = [...container.querySelectorAll('#detail-notes .detail-note')];
    expect(items.map((n) => (n as HTMLElement).dataset.kind)).toEqual(['rejection', 'failure', 'handoff']);
    expect(items[0].querySelector('.note-kind')).toHaveTextContent('Rejected');
    expect(items[0].querySelector('.note-meta')).toHaveTextContent(/^Hakan · /);
    expect(items[0].querySelector('.note-text')).toHaveTextContent('Use the icon set');
    expect(items[1].querySelector('.note-text')).toHaveTextContent('lint failed');
  });

  it('shows the commit, short, with the full SHA on hover', () => {
    const container = open({ commit: 'e4969ae0123456789abcdef' });
    const code = container.querySelector('#detail-commit code')!;
    expect(code).toHaveTextContent(/^e4969ae$/);
    expect(code).toHaveAttribute('title', 'e4969ae0123456789abcdef');
  });

  it('a blocked task lists its questions and how to answer them', () => {
    const container = open({
      status: 'blocked',
      waiting_on: 'user',
      questions: ['REST or GraphQL?', 'Which DB?'],
    });
    const section = container.querySelector('#detail-blocked')!;
    expect(section).toHaveTextContent('Waiting on you · 2 questions');
    expect([...section.querySelectorAll('.block-questions li')].map((li) => li.textContent)).toEqual([
      'REST or GraphQL?',
      'Which DB?',
    ]);
    expect(section).toHaveTextContent('atm unblock T-005 --answer');
  });

  it('has no notes, commit or blocked section when the task has none', () => {
    const container = open({});
    expect(container.querySelector('#detail-notes')).toBeNull();
    expect(container.querySelector('#detail-commit')).toBeNull();
    expect(container.querySelector('#detail-blocked')).toBeNull();
  });
});
