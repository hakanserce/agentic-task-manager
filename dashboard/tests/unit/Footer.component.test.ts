import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import Footer from '../../src/components/Footer.svelte';
import { pluginInfo } from '../../src/lib/plugin-info';
import { dashboard } from '../../src/lib/state.svelte';
import standard from '../fixtures/standard.json';
import { loadIntoDashboard } from './components.helpers';

describe('Footer', () => {
  beforeEach(() => {
    loadIntoDashboard(standard);
    dashboard.whatsNewOpen = false;
  });

  it('has no archive notice below the threshold', () => {
    expect(render(Footer).container.querySelector('#archive-notice')).toBeNull();
  });

  it('says when tasks.json has grown past the archive threshold', () => {
    loadIntoDashboard({ ...standard, meta: { ...standard.meta, archive: { threshold_tasks: 2, keep_days: 0 } } });
    dashboard.loadedAt = Date.parse('2026-10-24T00:00:00Z');
    const { container } = render(Footer);
    expect(container.querySelector('#archive-notice')).toHaveTextContent(
      /^tasks\.json is \d+ KB: `atm archive` would move 6 finished tasks to tasks-archive\.json$/,
    );
  });

  it('shows the copyright from plugin.json', () => {
    render(Footer);
    expect(screen.getByText(`© ${pluginInfo.year} Hakan Serce · MIT License`)).toBeInTheDocument();
  });

  it('links to the repository in a new tab', () => {
    render(Footer);
    const link = screen.getByRole('link', { name: 'GitHub' });
    expect(link).toHaveAttribute('href', 'https://github.com/hakanserce/agentic-task-manager');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it("opens What's new from the version", async () => {
    render(Footer);
    await fireEvent.click(screen.getByRole('button', { name: `v${pluginInfo.version}` }));
    expect(dashboard.whatsNewOpen).toBe(true);
  });
});
