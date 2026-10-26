import { fireEvent, render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import DetailPanel from '../../src/components/DetailPanel.svelte';
import { dashboard } from '../../src/lib/state.svelte';
import type { TasksFile } from '../../src/lib/types';
import archiveFile from '../fixtures/archive.json';
import standard from '../fixtures/standard.json';
import { loadIntoDashboard } from './components.helpers';

// The archive's meta (archived_at) isn't part of tasks.json's
const archive = archiveFile as unknown as TasksFile;

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

  it('shows the commit, short, with the full SHA on hover; without a repository address a click says how to set one', async () => {
    const container = open({ commit: 'e4969ae0123456789abcdef' });
    expect(container.querySelector('#detail-commit code')).toHaveTextContent(/^e4969ae$/);
    const ref = container.querySelector('#detail-commit .repo-ref')!;
    expect(ref).toHaveAttribute('title', 'e4969ae0123456789abcdef');
    expect(ref.tagName).toBe('BUTTON');
    await fireEvent.click(ref);
    expect(container.querySelector('#detail-commit .repo-hint')).toHaveTextContent('atm repository set <url>');
  });

  it('links the commit to GitHub when meta.repository is a GitHub repository', () => {
    const tasks = standard.tasks.map((t) => (t.id === 'T-005' ? { ...t, commit: 'e4969ae0123' } : t));
    loadIntoDashboard({ ...standard, meta: { ...standard.meta, repository: 'https://github.com/acme/demo' }, tasks });
    const { container } = render(DetailPanel);
    dashboard.showDetail('T-005');
    flushSync();
    const link = container.querySelector('#detail-commit a.repo-ref')!;
    expect(link).toHaveAttribute('href', 'https://github.com/acme/demo/commit/e4969ae0123');
    expect(link).toHaveAttribute('target', '_blank');
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

  it('says who created, started and completed it, and who tried before', () => {
    const container = open({
      created_by: 'Hakan',
      started_by: 'claude:cccc',
      completed_by: 'Hakan',
      notes: [{ at: '2026-04-01T08:00:00Z', by: 'claude:aaaa', kind: 'handoff', text: 'half done' }],
    });
    const who = container.querySelector('#detail-actors')!;
    expect(who).toHaveTextContent('Created by Hakan · started by claude:cccc · completed by Hakan');
    expect(who).toHaveTextContent('Earlier attempts: claude:aaaa');
  });

  it('a dependency on an archived task is a stub', () => {
    const tasks = standard.tasks.map((t) => (t.id === 'T-001' ? { ...t, dependencies: ['T-090'] } : t));
    loadIntoDashboard({ ...standard, meta: { ...standard.meta, archived: 3 }, tasks }, archive);
    const { container } = render(DetailPanel);
    dashboard.showDetail('T-001');
    flushSync();
    expect(container.querySelector('.detail-dep-item[data-archived="T-090"]')).toHaveTextContent(
      /T-090\s*· archived, done/,
    );
  });

  it('opens an archived task, marked as archived', () => {
    loadIntoDashboard(standard, archive);
    const { container } = render(DetailPanel);
    dashboard.showDetail('T-091');
    flushSync();
    expect(container.querySelector('#detail-archived')).toHaveTextContent('archived');
  });

  it('renders the description as Markdown, with HTML kept as text and external links in a new tab', () => {
    const container = open({
      description:
        '## Goal\n\nLog **every** sign-in.\n\n- the IP\n- the time\n\n```\natm show T-005\n```\n\n' +
        'See [the spec](https://example.com/spec). <b>not bold</b>',
    });
    const desc = container.querySelector('#detail-description')!;
    expect(desc.querySelector('h4')).toHaveTextContent('Goal');
    expect(desc.querySelector('h4')!.id).toBe('desc-T-005-goal');
    expect(desc.querySelector('strong')).toHaveTextContent('every');
    expect([...desc.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['the IP', 'the time']);
    expect(desc.querySelector('pre code')).toHaveTextContent('atm show T-005');
    expect(desc.querySelector('a')).toHaveAttribute('target', '_blank');
    expect(desc.querySelector('b')).toBeNull();
    expect(desc).toHaveTextContent('<b>not bold</b>');
  });

  it('a plain description is one paragraph, as before', () => {
    const container = open({ description: 'Add the editor.' });
    const paragraphs = container.querySelectorAll('#detail-description .markdown > *');
    expect([...paragraphs].map((p) => [p.tagName, p.textContent])).toEqual([['P', 'Add the editor.']]);
  });

  it('has no notes, commit or blocked section when the task has none', () => {
    const container = open({});
    expect(container.querySelector('#detail-actors')).toBeNull();
    expect(container.querySelector('#detail-notes')).toBeNull();
    expect(container.querySelector('#detail-commit')).toBeNull();
    expect(container.querySelector('#detail-blocked')).toBeNull();
  });
});
