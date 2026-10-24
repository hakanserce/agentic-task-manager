import { describe, expect, it } from 'vitest';
import {
  emptyFilters,
  facetCounts,
  filterOptions,
  filterTasks,
  isActive,
  toggleFilter,
  type Filters,
} from '../../src/lib/filters';
import type { Task } from '../../src/lib/types';
import standardFile from '../fixtures/standard.json';
import edgeFile from '../fixtures/edge-cases.json';

const standard = standardFile.tasks as Task[];
const ids = (tasks: Task[]) => tasks.map((t) => t.id);
const filters = (f: Partial<Record<keyof Filters, string[]>>): Filters => ({
  phase: new Set(f.phase),
  type: new Set(f.type),
  status: new Set(f.status),
});

describe('filterOptions', () => {
  it('derives sorted options with labels', () => {
    const o = filterOptions(standard);
    expect(o.phase.map((x) => x.label)).toEqual(['0', '1', '2']);
    expect(o.type.map((x) => x.value)).toEqual(['bugfix', 'docs', 'feature', 'infra', 'polish', 'refactor', 'test']);
    expect(o.type[0].label).toBe('Bugfix');
    expect(o.status).toEqual([
      { value: 'todo', label: 'Todo' },
      { value: 'in_progress', label: 'In progress' },
      { value: 'done', label: 'Done' },
      { value: 'blocked', label: 'Blocked' },
      { value: 'skipped', label: 'Skipped' },
    ]);
  });

  it('sorts phases numerically, not as strings', () => {
    const t = { name: 'x', type: 'feature', description: '', status: 'todo' };
    const tasks = [10, 2, 1].map((phase, i) => ({ ...t, id: `T-${i}`, phase }));
    expect(filterOptions(tasks).phase.map((x) => x.value)).toEqual(['1', '2', '10']);
  });

  it('puts unknown statuses last', () => {
    expect(filterOptions(edgeFile.tasks as Task[]).status.map((x) => x.value)).toEqual(['todo', 'done', 'review']);
  });

  it('is empty for no tasks', () => {
    expect(filterOptions([])).toEqual({ phase: [], type: [], status: [] });
  });
});

describe('filterTasks', () => {
  it('returns everything with no filters', () => {
    expect(filterTasks(standard, emptyFilters())).toHaveLength(12);
  });

  it('ORs values within a group', () => {
    expect(filterTasks(standard, filters({ phase: ['1', '2'] }))).toHaveLength(8);
  });

  it('ANDs across groups', () => {
    expect(ids(filterTasks(standard, filters({ phase: ['1', '2'], type: ['test'] })))).toEqual(['T-009']);
    expect(ids(filterTasks(standard, filters({ type: ['feature'], status: ['done'] })))).toEqual(['T-004']);
  });

  it('can match nothing', () => {
    expect(filterTasks(standard, filters({ status: ['blocked'], type: ['docs'] }))).toEqual([]);
  });

  it('keeps file order', () => {
    expect(ids(filterTasks(standard, filters({ status: ['done'] })))).toEqual([
      'T-001',
      'T-002',
      'T-003',
      'T-004',
      'T-012',
    ]);
  });
});

describe('toggleFilter / isActive', () => {
  it('toggles values without mutating the input', () => {
    const start = emptyFilters();
    const one = toggleFilter(start, 'type', 'test');
    expect(start.type.size).toBe(0);
    expect([...one.type]).toEqual(['test']);
    expect(toggleFilter(one, 'type', 'test').type.size).toBe(0);
  });

  it('"all" clears only its group', () => {
    const f = toggleFilter(toggleFilter(emptyFilters(), 'phase', '1'), 'type', 'test');
    const cleared = toggleFilter(f, 'phase', 'all');
    expect(cleared.phase.size).toBe(0);
    expect([...cleared.type]).toEqual(['test']);
  });

  it('"all" is active exactly when the group is empty', () => {
    const f = toggleFilter(emptyFilters(), 'status', 'done');
    expect(isActive(f, 'status', 'all')).toBe(false);
    expect(isActive(f, 'status', 'done')).toBe(true);
    expect(isActive(f, 'phase', 'all')).toBe(true);
  });
});

describe('facetCounts', () => {
  // standard.json: 12 tasks, 4 per phase. Phase 0: infra×2, docs, test (all done). Phase 1: feature (done),
  // feature (in_progress), bugfix (todo), refactor (blocked). Phase 2: polish, test, feature (todo), docs (skipped).
  const counts = (filters: Partial<Record<keyof Filters, string[]>>) =>
    facetCounts(standard, {
      phase: new Set(filters.phase ?? []),
      type: new Set(filters.type ?? []),
      status: new Set(filters.status ?? []),
    });
  const asObject = (m: ReadonlyMap<string, number>) => Object.fromEntries([...m].sort());

  it('without selections: every value over all tasks', () => {
    const c = counts({});
    expect(c.phase.all).toBe(12);
    expect(asObject(c.phase.values)).toEqual({ 0: 4, 1: 4, 2: 4 });
    expect(asObject(c.type.values)).toEqual({
      bugfix: 1,
      docs: 2,
      feature: 3,
      infra: 2,
      polish: 1,
      refactor: 1,
      test: 2,
    });
    expect(asObject(c.status.values)).toEqual({ blocked: 1, done: 5, in_progress: 1, skipped: 1, todo: 4 });
  });

  it("a group's own selection doesn't change its counts; the other groups count within it", () => {
    const c = counts({ phase: ['1'] });
    expect(c.phase.all).toBe(12);
    expect(asObject(c.phase.values)).toEqual({ 0: 4, 1: 4, 2: 4 });
    expect(c.type.all).toBe(4);
    expect(asObject(c.type.values)).toEqual({ bugfix: 1, feature: 2, refactor: 1 });
    expect(asObject(c.status.values)).toEqual({ blocked: 1, done: 1, in_progress: 1, todo: 1 });
  });

  it('selections in two groups: each group counts under the other two', () => {
    const c = counts({ phase: ['1'], type: ['feature'] });
    expect(asObject(c.phase.values)).toEqual({ 1: 2, 2: 1 }); // features by phase
    expect(asObject(c.type.values)).toEqual({ bugfix: 1, feature: 2, refactor: 1 }); // phase 1 by type
    expect(c.status.all).toBe(2);
    expect(asObject(c.status.values)).toEqual({ done: 1, in_progress: 1 });
  });

  it('several values in one group combine with OR', () => {
    const c = counts({ phase: ['1', '2'] });
    expect(c.type.all).toBe(8);
    expect(c.type.values.get('feature')).toBe(3);
    expect(c.type.values.get('infra')).toBeUndefined();
  });

  it('a selection that matches nothing leaves the other groups at zero', () => {
    const c = counts({ status: ['nonexistent'] });
    expect(c.phase.all).toBe(0);
    expect(c.phase.values.size).toBe(0);
    expect(c.status.all).toBe(12);
  });

  it("agrees with filterTasks: a value's count is what selecting only it would show", () => {
    const c = counts({ type: ['feature', 'test'] });
    for (const [phase, n] of c.phase.values) {
      const shown = filterTasks(standard, {
        ...emptyFilters(),
        type: new Set(['feature', 'test']),
        phase: new Set([phase]),
      });
      expect(shown.length).toBe(n);
    }
  });
});
