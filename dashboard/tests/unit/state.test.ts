import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardState } from '../../src/lib/state.svelte';
import standard from '../fixtures/standard.json';

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)));

describe('DashboardState', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(() => ok(standard));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('starts empty and unloaded', () => {
    const s = new DashboardState();
    expect(s.loaded).toBe(false);
    expect(s.tasks).toEqual([]);
    expect(s.projectName).toBe('Task Dashboard');
  });

  it('loads tasks', async () => {
    const s = new DashboardState();
    await s.load();
    expect(s.loaded).toBe(true);
    expect(s.loadError).toBeNull();
    expect(s.tasks).toHaveLength(12);
    expect(s.taskMap.get('T-004')?.name).toBe('User login');
    expect(s.projectName).toBe('Standard Project');
    expect(s.filtered).toHaveLength(12);
  });

  it('records an initial load failure', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 404 }));
    const s = new DashboardState();
    await s.load();
    expect(s.loaded).toBe(false);
    expect(s.loadError).toBe('HTTP 404');
  });

  it('keeps current data when a reload fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = new DashboardState();
    await s.load();
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 500 }));
    await s.reload();
    expect(s.tasks).toHaveLength(12);
    expect(s.loadError).toBeNull();
    expect(error).toHaveBeenCalledWith('Reload failed:', expect.any(Error));
  });

  it('a successful reload replaces data and clears a load error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 404 }));
    const s = new DashboardState();
    await s.load();
    await s.reload();
    expect(s.loaded).toBe(true);
    expect(s.loadError).toBeNull();
    expect(s.tasks).toHaveLength(12);
  });

  it('shows the reloading flag for 400ms', async () => {
    vi.useFakeTimers();
    const s = new DashboardState();
    await s.reload();
    expect(s.reloading).toBe(true);
    vi.advanceTimersByTime(400);
    expect(s.reloading).toBe(false);
  });

  it('filters', async () => {
    const s = new DashboardState();
    await s.load();
    s.toggleFilter('phase', '1');
    expect(s.filtered.map((t) => t.id)).toEqual(['T-004', 'T-005', 'T-006', 'T-007']);
    s.toggleFilter('phase', 'all');
    expect(s.filtered).toHaveLength(12);
  });

  it('opens and closes the detail panel for known tasks only', async () => {
    const s = new DashboardState();
    await s.load();
    s.showDetail('T-999');
    expect(s.detailOpen).toBe(false);
    s.showDetail('T-004');
    expect([s.detailId, s.detailOpen]).toEqual(['T-004', true]);
    s.closeDetail();
    expect([s.detailId, s.detailOpen]).toEqual(['T-004', false]);
  });
});

describe('DashboardState auto-refresh preference', () => {
  beforeEach(() => localStorage.clear());

  it('is on every 5 seconds by default', () => {
    const s = new DashboardState();
    expect([s.autoRefresh, s.autoRefreshSeconds]).toEqual([true, 5]);
  });

  it('remembers the choice and interval for the next session', () => {
    const first = new DashboardState();
    first.setAutoRefresh(false);
    first.setAutoRefreshSeconds(30);
    const next = new DashboardState();
    expect([next.autoRefresh, next.autoRefreshSeconds]).toEqual([false, 30]);
  });
});

describe('DashboardState saved view', () => {
  beforeEach(() => {
    localStorage.clear();
    history.replaceState(null, '', '/');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => ok(standard)),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  async function changeEverything() {
    const s = new DashboardState();
    await s.load();
    s.toggleFilter('type', 'feature');
    s.query = 'login';
    s.selectTab('agents');
    s.kanbanGroupByPhase = true;
    s.kanbanShowSkipped = true;
    s.kanbanShowAllDone = true;
    s.progressPhase = 1;
    s.graphFiltered = 'dim';
    s.graphView = { k: 2, x: 10, y: 20 };
    s.agentsWindow = { start: 1000, end: 400_000, followEnd: true };
    s.agentsLive = true;
    s.activityRange = { preset: 'week' };
    s.saveView();
    return s;
  }

  it('brings back every selection on the next visit', async () => {
    const first = await changeEverything();
    history.replaceState(null, '', '/');
    const next = new DashboardState();
    await next.load();
    expect(next.currentView()).toEqual(first.currentView());
    expect(next.tab).toBe('agents');
    expect([...next.filters.type]).toEqual(['feature']);
  });

  it('a tab in the URL wins over the saved one', async () => {
    await changeEverything();
    history.replaceState(null, '', '/#view=kanban');
    const next = new DashboardState();
    await next.load();
    expect(next.tab).toBe('kanban');
    expect(next.query).toBe('login');
  });

  it('reset forgets the saved view and goes back to the defaults', async () => {
    const s = await changeEverything();
    s.resetView();
    expect(s.query).toBe('');
    expect(s.filters.type.size).toBe(0);
    expect(s.tab).toBe('graph');
    expect([s.kanbanShowAllDone, s.agentsWindow, s.graphView, s.graphFiltered]).toEqual([false, null, null, 'hide']);
    history.replaceState(null, '', '/');
    const next = new DashboardState();
    await next.load();
    expect(next.tab).toBe('graph');
  });
});

describe('DashboardState appearance', () => {
  beforeEach(() => localStorage.clear());

  it('remembers mode and theme per browser; unknown themes fall back to Default', () => {
    const first = new DashboardState();
    first.setModePref('dark');
    first.setTheme('nord');
    const next = new DashboardState();
    expect([next.modePref, next.mode, next.theme]).toEqual(['dark', 'dark', 'nord']);
    next.setTheme('vaporwave');
    expect(next.theme).toBe('default');
  });
});
