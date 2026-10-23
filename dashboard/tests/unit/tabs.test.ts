import { describe, expect, it } from 'vitest';
import { adjacentView, DEFAULT_VIEW, parseViewHash, VIEWS, withViewHash } from '../../src/lib/tabs';

describe('parseViewHash', () => {
  it('reads the view parameter', () => {
    expect(parseViewHash('#view=kanban')).toBe('kanban');
    expect(parseViewHash('view=progress')).toBe('progress');
    expect(parseViewHash('#foo=1&view=kanban')).toBe('kanban');
  });

  it('falls back to the dependency graph', () => {
    expect(DEFAULT_VIEW).toBe('graph');
    expect(parseViewHash('')).toBe('graph');
    expect(parseViewHash('#')).toBe('graph');
    expect(parseViewHash('#view=nope')).toBe('graph');
    expect(parseViewHash('#something-else')).toBe('graph');
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
  it('moves left/right and wraps', () => {
    expect(adjacentView('graph', 1)).toBe('kanban');
    expect(adjacentView('progress', 1)).toBe('graph');
    expect(adjacentView('graph', -1)).toBe('progress');
  });
});
