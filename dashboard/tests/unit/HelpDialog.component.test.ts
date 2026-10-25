import { fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import HelpDialog from '../../src/components/HelpDialog.svelte';
import Markdown from '../../src/components/Markdown.svelte';
import { parseMarkdown } from '../../src/lib/markdown';
import { dashboard } from '../../src/lib/state.svelte';
import standard from '../fixtures/standard.json';
import { loadIntoDashboard } from './components.helpers';

const overlay = () => document.querySelector('#help-overlay')!;

describe('HelpDialog', () => {
  beforeEach(() => {
    loadIntoDashboard(standard);
    dashboard.closeDialog();
  });

  it('is closed until opened, then shows docs/help.md', () => {
    render(HelpDialog);
    expect(overlay()).not.toHaveClass('open');
    dashboard.openDialog('help');
    flushSync();
    expect(overlay()).toHaveClass('open');
    const dialog = screen.getByRole('dialog', { name: 'Help' });
    expect(dialog.querySelector('#help-statuses-and-kinds')).toHaveTextContent('Statuses and kinds');
    // Heading IDs are prefixed: an element with the ID "help" would make the browser jump to it on "#help"
    expect(document.getElementById('help')).toBeNull();
    expect(dialog).toHaveTextContent('/atm:loop-tasks');
    expect(location.hash).toBe('#help');
  });

  it('closes with the close button, Escape and the backdrop, returning focus', async () => {
    const opener = document.body.appendChild(document.createElement('button'));
    opener.focus();
    render(HelpDialog);
    for (const close of [
      () => fireEvent.click(screen.getByRole('button', { name: 'Close' })),
      () => fireEvent.keyDown(document, { key: 'Escape' }),
      () => fireEvent.click(overlay()),
    ]) {
      opener.focus();
      dashboard.openDialog('help');
      flushSync();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
      await close();
      flushSync();
      expect(dashboard.dialog).toBeNull();
      expect(document.activeElement).toBe(opener);
    }
    opener.remove();
  });

  it('links within the page scroll to the heading and leave the URL hash alone', async () => {
    render(HelpDialog);
    dashboard.openDialog('help');
    flushSync();
    const target = document.querySelector('#help-priorities-and-labels') as HTMLElement;
    let scrolled = false;
    target.scrollIntoView = () => (scrolled = true);
    await fireEvent.click(screen.getByRole('link', { name: 'priorities and labels' }));
    expect(scrolled).toBe(true);
    expect(location.hash).toBe('#help');
  });
});

describe('Markdown', () => {
  it('renders the tree with every text escaped; external links open in a new tab', () => {
    const { container } = render(Markdown, {
      blocks: parseMarkdown('## A <b>title</b>\n\n- **x** and `<script>`\n\n[site](https://example.com)'),
      idPrefix: 'md-',
    });
    expect(container.querySelector('h4')).toHaveTextContent('A <b>title</b>');
    expect(container.querySelector('h4')).toHaveAttribute('id', 'md-a-b-title-b');
    expect(container.querySelector('b, script')).toBeNull();
    expect(container.querySelector('li strong')).toHaveTextContent('x');
    expect(container.querySelector('li code')).toHaveTextContent('<script>');
    expect(container.querySelector('a')).toHaveAttribute('target', '_blank');
    expect(container.querySelector('a')).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
