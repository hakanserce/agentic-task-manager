import { fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import AboutDialog from '../../src/components/AboutDialog.svelte';
import { pluginInfo } from '../../src/lib/plugin-info';
import { dashboard } from '../../src/lib/state.svelte';
import standard from '../fixtures/standard.json';
import { loadIntoDashboard } from './components.helpers';

const overlay = () => document.querySelector('#about-overlay')!;

describe('AboutDialog', () => {
  beforeEach(() => {
    loadIntoDashboard(standard);
    dashboard.closeDialog();
  });

  it('is closed until opened, then shows the plugin facts', () => {
    render(AboutDialog);
    expect(overlay()).not.toHaveClass('open');
    dashboard.openDialog('about');
    flushSync();
    expect(overlay()).toHaveClass('open');
    const dialog = screen.getByRole('dialog', { name: 'About' });
    expect(document.querySelector('.about-name')).toHaveTextContent(/^Agentic Task Manager \(atm\)$/);
    expect(dialog).toHaveTextContent(pluginInfo.description);
    expect(dialog).toHaveTextContent(`Version ${pluginInfo.version}`);
    expect(dialog).toHaveTextContent('Author Hakan Serce');
    expect(dialog).toHaveTextContent('Licence MIT');
    expect(screen.getByRole('link', { name: pluginInfo.repository })).toHaveAttribute('target', '_blank');
    expect(location.hash).toBe('#about');
  });

  it("shows the project's vocabularies: the defaults, or meta's lists and workflow", () => {
    render(AboutDialog);
    dashboard.openDialog('about');
    flushSync();
    const vocab = () => document.querySelector('#about-vocab')!;
    expect(vocab()).toHaveTextContent('In Review (review)');
    expect(vocab()).toHaveTextContent('Numbered, without names');
    expect(vocab()).toHaveTextContent('P2 Medium (default)');
    expect(vocab()).not.toHaveTextContent('Workflow');

    loadIntoDashboard({
      ...standard,
      meta: {
        statuses: [
          { id: 'todo', label: 'Backlog', kind: 'todo' },
          { id: 'doing', label: 'Doing', kind: 'active' },
          { id: 'shipped', label: 'Shipped', kind: 'done' },
        ],
        phases: [{ id: 1, name: 'Core' }],
        types: [{ id: 'spike', label: 'Spike' }],
        workflow: { type: 'pull-request' },
      },
    });
    flushSync();
    expect(vocab()).toHaveTextContent('Statuses Backlog (todo) · Doing (active) · Shipped (done)');
    expect(vocab()).toHaveTextContent('Phases 1 Core');
    expect(vocab()).toHaveTextContent('Types Spike');
    expect(vocab()).toHaveTextContent('Workflow pull-request');
  });

  it('closes with the close button, Escape and the backdrop, and drops the hash flag', async () => {
    render(AboutDialog);
    for (const close of [
      () => fireEvent.click(screen.getByRole('button', { name: 'Close' })),
      () => fireEvent.keyDown(document, { key: 'Escape' }),
      () => fireEvent.click(overlay()),
    ]) {
      dashboard.openDialog('about');
      flushSync();
      await close();
      expect(dashboard.dialog).toBeNull();
      expect(location.hash).not.toContain('about');
    }
  });

  it('moves focus to the close button, and back to the opener when closed', async () => {
    const opener = document.body.appendChild(document.createElement('button'));
    opener.focus();
    render(AboutDialog);
    dashboard.openDialog('about');
    flushSync();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
    dashboard.closeDialog();
    flushSync();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
