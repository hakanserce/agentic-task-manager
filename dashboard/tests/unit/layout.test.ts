import { describe, expect, it } from 'vitest';
import { layoutGraph, NODE_H, NODE_W, topologicalLayers, truncate } from '../../src/lib/graph/layout';
import type { Task } from '../../src/lib/types';
import standard from '../fixtures/standard.json';
import cycle from '../fixtures/cycle.json';

const task = (id: string, dependencies: string[] = []): Task => ({
  id,
  name: `Task ${id}`,
  phase: 0,
  type: 'feature',
  description: '',
  status: 'todo',
  dependencies,
});
const layerIds = (layers: Task[][]) => layers.map((l) => l.map((t) => t.id));

describe('topologicalLayers', () => {
  it('chain', () => {
    expect(layerIds(topologicalLayers([task('c', ['b']), task('b', ['a']), task('a')]))).toEqual([['a'], ['b'], ['c']]);
  });

  it('diamond', () => {
    const tasks = [task('a'), task('b', ['a']), task('c', ['a']), task('d', ['b', 'c'])];
    expect(layerIds(topologicalLayers(tasks))).toEqual([['a'], ['b', 'c'], ['d']]);
  });

  it('matches the legacy layout for the standard fixture', () => {
    expect(layerIds(topologicalLayers(standard.tasks as Task[]))).toEqual([
      ['T-001', 'T-010', 'T-012'],
      ['T-002', 'T-003'],
      ['T-004'],
      ['T-005', 'T-006'],
      ['T-007', 'T-008'],
      ['T-009'],
      ['T-011'],
    ]);
  });

  it('puts everything left in a cycle into one final column', () => {
    expect(layerIds(topologicalLayers(cycle.tasks as Task[]))).toEqual([
      ['T-001'],
      ['T-002', 'T-003', 'T-004', 'T-005'],
    ]);
  });

  it('ignores dependencies that are not in the input', () => {
    expect(layerIds(topologicalLayers([task('b', ['a', 'missing'])]))).toEqual([['b']]);
  });

  it('empty input', () => {
    expect(topologicalLayers([])).toEqual([]);
  });
});

describe('layoutGraph', () => {
  it('sizes the canvas from columns and the tallest column', () => {
    const l = layoutGraph(standard.tasks as Task[]);
    expect(l.width).toBe(7 * 220 + 50);
    expect(l.height).toBe(3 * 76 + 40);
  });

  it('positions columns 220px apart and centers each column vertically', () => {
    const l = layoutGraph([task('a'), task('b'), task('c', ['a'])]);
    const [a, b, c] = l.nodes;
    expect([a.x, b.x, c.x]).toEqual([30, 30, 250]);
    // Legacy centers every column, so even the tallest starts at (height - columnHeight) / 2 = 32
    expect([a.y, b.y]).toEqual([32, 108]);
    expect(c.y).toBe((l.height - NODE_H) / 2);
    expect(c.cx).toBe(250 + NODE_W / 2);
    expect(c.cy).toBe(c.y + NODE_H / 2);
  });

  it('returns nodes in input order', () => {
    const tasks = [task('b', ['a']), task('a')];
    expect(layoutGraph(tasks).nodes.map((n) => n.task.id)).toEqual(['b', 'a']);
  });

  it('draws a bezier edge per visible dependency', () => {
    const l = layoutGraph([task('a'), task('b', ['a', 'hidden'])]);
    expect(l.edges).toEqual([{ from: 'a', to: 'b', d: 'M190,58 C220,58 220,58 250,58' }]);
    expect(layoutGraph(standard.tasks as Task[]).edges).toHaveLength(12);
  });

  it('truncates labels to 22 characters', () => {
    const long = { ...task('a'), name: 'A very long task name that keeps going' };
    expect(layoutGraph([long]).nodes[0].label).toBe('A very long task name…');
  });

  it('is empty for no tasks', () => {
    expect(layoutGraph([])).toEqual({ width: 0, height: 0, layers: [], nodes: [], edges: [] });
  });
});

describe('truncate', () => {
  it('only shortens strings over the limit', () => {
    expect(truncate('exactly', 7)).toBe('exactly');
    expect(truncate('too long', 7)).toBe('too lo…');
  });
});
