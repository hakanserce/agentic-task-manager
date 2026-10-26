import { beforeEach, describe, expect, it } from 'vitest';
import { PREFS_KEY, setPref } from '../../src/lib/prefs';
import type { Task } from '../../src/lib/types';
import {
  clearView,
  defaultView,
  projectKey,
  readView,
  sanitizeView,
  writeView,
  type SavedView,
} from '../../src/lib/view-store';

const task = (phase: number, type: string, status: string) =>
  ({ id: `T-${phase}${type}`, phase, type, status }) as Task;

describe('projectKey', () => {
  it('uses meta.id, else the project name, else a shared default', () => {
    expect(projectKey({ id: 'a1b2c3d4', project: 'Shop' })).toBe('atm-dashboard:view:id:a1b2c3d4');
    expect(projectKey({ project: 'Shop' })).toBe('atm-dashboard:view:project:Shop');
    expect(projectKey({ id: '', project: '' })).toBe('atm-dashboard:view:default');
    expect(projectKey({ id: 7 })).toBe('atm-dashboard:view:default');
    expect(projectKey(undefined)).toBe('atm-dashboard:view:default');
  });
});

describe('reading and writing', () => {
  beforeEach(() => localStorage.clear());
  const key = projectKey({ id: 'p1' });

  it('round-trips a view', () => {
    const view: SavedView = {
      filters: {
        phase: ['1'],
        type: ['feature', 'test'],
        status: [],
        priority: ['P0'],
        stage: ['in_pr'],
        label: ['ux'],
        agent: ['claude:a'],
      },
      query: 'login',
      tab: 'agents',
      kanban: { groupByPhase: true, showSkipped: true, showAllDone: true },
      listSort: 'priority',
      progressPhase: 2,
      progressActive: { only: true },
      filterFinishedPhases: true,
      graphFiltered: 'dim',
      graph: { k: 1.5, x: -120, y: 40 },
      agents: { start: 1000, end: 61_000, followEnd: true },
      agentsLive: true,
      activity: { preset: 'custom', from: 1000, to: 5000 },
    };
    writeView(key, view);
    expect(readView(key)).toEqual(view);
  });

  it('"Active phases only" is on by default and when malformed; a saved choice is kept; `days` is ignored', () => {
    expect(defaultView().progressActive).toEqual({ only: true });
    localStorage.setItem(key, JSON.stringify({ progressActive: { only: 'yes', days: 0 } }));
    expect(readView(key).progressActive).toEqual({ only: true });
    localStorage.setItem(key, JSON.stringify({ progressActive: { only: false, days: 14 } }));
    expect(readView(key).progressActive).toEqual({ only: false });
  });

  it('projects are kept apart', () => {
    writeView(key, { ...defaultView(), tab: 'progress' });
    expect(readView(projectKey({ id: 'p2' })).tab).toBe('graph');
  });

  it('nothing stored, or junk, gives the defaults', () => {
    expect(readView(key)).toEqual(defaultView());
    localStorage.setItem(key, '{not json');
    expect(readView(key)).toEqual(defaultView());
    localStorage.setItem(
      key,
      JSON.stringify({ tab: 'nope', filters: { phase: [1, '2'], type: 'x' }, kanban: 3, progressPhase: '1' }),
    );
    expect(readView(key)).toEqual({
      ...defaultView(),
      filters: { phase: ['2'], type: [], status: [], priority: [], stage: [], label: [], agent: [] },
    });
  });

  it('a malformed graph position is ignored', () => {
    for (const graph of [{ k: 0, x: 0, y: 0 }, { k: 1, x: 'a', y: 0 }, { k: 1, x: 0 }, 'x']) {
      localStorage.setItem(key, JSON.stringify({ graph }));
      expect(readView(key).graph).toBeNull();
    }
  });

  it('a malformed agents time range is ignored', () => {
    for (const agents of [{ start: 5, end: 5 }, { start: 'a', end: 9 }, { start: 1 }, 'x']) {
      localStorage.setItem(key, JSON.stringify({ agents }));
      expect(readView(key).agents).toBeNull();
    }
  });

  it('clearView forgets the project', () => {
    writeView(key, { ...defaultView(), tab: 'kanban' });
    clearView(key);
    expect(localStorage.getItem(key)).toBeNull();
    expect(readView(key).tab).toBe('graph');
  });

  it('the old per-browser "group by phase" choice seeds projects that have no saved view yet', () => {
    setPref('kanbanGroupByPhase', true);
    expect(readView(key).kanban.groupByPhase).toBe(true);
    writeView(key, { ...defaultView(), kanban: { groupByPhase: false, showSkipped: false, showAllDone: false } });
    expect(readView(key).kanban.groupByPhase).toBe(false);
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!).kanbanGroupByPhase).toBe(true);
  });
});

describe('sanitizeView', () => {
  const tasks = [{ ...task(0, 'feature', 'done'), labels: ['ux'], started_by: 'claude:a' }, task(1, 'test', 'todo')];

  it('drops filter values and a focused phase the tasks no longer have', () => {
    const view: SavedView = {
      ...defaultView(),
      filters: {
        phase: ['0', '5'],
        type: ['feature', 'docs'],
        status: ['todo', 'blocked'],
        priority: ['P2', 'P0'],
        stage: ['done', 'merged'],
        label: ['ux', 'gone'],
        agent: ['claude:a', 'claude:gone'],
      },
      progressPhase: 5,
    };
    // Neither task has a priority: both are the default, P2
    expect(sanitizeView(view, tasks)).toEqual({
      ...view,
      filters: {
        phase: ['0'],
        type: ['feature'],
        status: ['todo'],
        priority: ['P2'],
        stage: ['done'],
        label: ['ux'],
        agent: ['claude:a'],
      },
      progressPhase: null,
    });
  });

  it('keeps everything that still exists', () => {
    const view: SavedView = {
      ...defaultView(),
      filters: { phase: ['1'], type: [], status: [], priority: [], stage: [], label: [], agent: [] },
      progressPhase: 0,
    };
    expect(sanitizeView(view, tasks)).toEqual(view);
  });
});
