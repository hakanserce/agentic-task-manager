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
