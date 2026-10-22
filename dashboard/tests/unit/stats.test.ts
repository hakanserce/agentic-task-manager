import { describe, expect, it } from 'vitest';
import { computeStats } from '../../src/lib/stats';
import type { Task } from '../../src/lib/types';
import standard from '../fixtures/standard.json';
import edge from '../fixtures/edge-cases.json';

describe('computeStats', () => {
  it('counts the standard fixture', () => {
    expect(computeStats(standard.tasks as Task[])).toEqual({
      total: 12,
      done: 5,
      inProgress: 1,
      todo: 4,
      blocked: 1,
      pct: 42,
      typeCounts: [
        ['bugfix', 1],
        ['docs', 2],
        ['feature', 3],
        ['infra', 2],
        ['polish', 1],
        ['refactor', 1],
        ['test', 2],
      ],
    });
  });

  it('rounds the percentage to nearest', () => {
    const t = { name: 'x', phase: 0, type: 'feature', description: '' };
    const tasks = [
      { ...t, id: '1', status: 'done' },
      { ...t, id: '2', status: 'done' },
      { ...t, id: '3', status: 'todo' },
    ];
    expect(computeStats(tasks).pct).toBe(67);
  });

  it('does not count unknown statuses as todo', () => {
    const s = computeStats(edge.tasks as Task[]);
    expect(s.todo).toBe(5);
    expect(s.total).toBe(7);
  });

  it('handles no tasks', () => {
    expect(computeStats([])).toMatchObject({ total: 0, done: 0, pct: 0, typeCounts: [] });
  });
});
