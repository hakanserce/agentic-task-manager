import { describe, expect, it } from 'vitest';
import { adjacentView, DEFAULT_VIEW, parseViewHash, VIEWS, withViewHash } from '../../src/lib/tabs';

describe('parseViewHash', () => {
  it('reads the view parameter', () => {
    expect(parseViewHash('#view=kanban')).toBe('kanban');
    expect(parseViewHash('view=progress')).toBe('progress');
    expect(parseViewHash('#foo=1&view=kanban')).toBe('kanban');
  });

  it('falls back to the Kanban (T-251)', () => {
    expect(DEFAULT_VIEW).toBe('kanban');
    expect(parseViewHash('')).toBe('kanban');
    expect(parseViewHash('#')).toBe('kanban');
    expect(parseViewHash('#view=nope')).toBe('kanban');
    expect(parseViewHash('#something-else')).toBe('kanban');
    expect(parseViewHash('#view=graph')).toBe('graph');
  });
});

describe('withViewHash', () => {
  it('sets the view and keeps other parameters', () => {
    expect(withViewHash('', 'kanban')).toBe('#view=kanban');
    expect(withViewHash('#view=graph', 'progress')).toBe('#view=progress');
    expect(withViewHash('#foo=1', 'kanban')).toBe('#foo=1&view=kanban');
  });

  it('round-trips through parseViewHash', () => {
    for (const v of VIEWS) expect(parseViewHash(withViewHash('#x=y', v))).toBe(v);
  });
});

describe('adjacentView', () => {
  it('moves left/right and wraps, in the tab order: Kanban, List, Graph, Progress, Agents', () => {
    expect(VIEWS).toEqual(['kanban', 'list', 'graph', 'progress', 'agents']);
    expect(adjacentView('graph', 1)).toBe('progress');
    expect(adjacentView('agents', 1)).toBe('kanban');
    expect(adjacentView('kanban', -1)).toBe('agents');
  });
});
