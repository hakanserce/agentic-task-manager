import { describe, expect, it } from 'vitest';
import {
  emptyFilters,
  facetCounts,
  filterOptions,
  filterTasks,
  isActive,
  searchTasks,
  sortTasks,
  toggleFilter,
  type Filters,
} from '../../src/lib/filters';
import type { Task } from '../../src/lib/types';
import { resolveVocabulary } from '../../src/lib/vocab';
import standardFile from '../fixtures/standard.json';
import edgeFile from '../fixtures/edge-cases.json';

const standard = standardFile.tasks as Task[];
const ids = (tasks: Task[]) => tasks.map((t) => t.id);
const filters = (f: Partial<Record<keyof Filters, string[]>>): Filters => ({
  phase: new Set(f.phase),
  type: new Set(f.type),
  status: new Set(f.status),
  priority: new Set(f.priority),
  label: new Set(f.label),
});

describe('filterOptions', () => {
  it("derives options in the vocabulary's order, with its labels", () => {
    const o = filterOptions(standard);
    expect(o.phase.map((x) => x.label)).toEqual(['0', '1', '2']);
    expect(o.type.map((x) => x.value)).toEqual(['feature', 'bugfix', 'test', 'infra', 'docs', 'refactor', 'polish']);
    expect(o.type[1].label).toBe('Bugfix');
    expect(o.status).toEqual([
      { value: 'todo', label: 'To Do' },
      { value: 'in_progress', label: 'In Progress' },
      { value: 'blocked', label: 'Blocked' },
      { value: 'done', label: 'Done' },
      { value: 'skipped', label: 'Skipped' },
    ]);
  });

  it("uses a project's vocabulary: its order and labels, phase names; values it doesn't list come last", () => {
    const vocab = resolveVocabulary({
      statuses: [
        { id: 'doing', label: 'Doing', kind: 'active' },
        { id: 'todo', label: 'Backlog', kind: 'todo' },
        { id: 'done', label: 'Shipped', kind: 'done' },
      ],
      types: [{ id: 'test', label: 'Tests' }],
      phases: [{ id: 1, name: 'Core' }],
    });
    const o = filterOptions(standard, vocab);
    expect(o.status.map((x) => x.label)).toEqual(['Backlog', 'Shipped', 'Blocked', 'In Progress', 'Skipped']);
    expect(o.type.slice(0, 3).map((x) => x.label)).toEqual(['Tests', 'Bugfix', 'Docs']);
    expect(o.phase.map((x) => x.label)).toEqual(['0', '1 · Core', '2']);
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
    expect(filterOptions([])).toEqual({ phase: [], type: [], status: [], priority: [], label: [] });
  });

  it('offers the priorities in the data, most urgent first; a missing or unknown priority is the default', () => {
    const tasks = [
      { ...standard[0], priority: 'P3' },
      { ...standard[1], priority: 'P0' },
      { ...standard[2], priority: 'urgent!' },
      standard[3],
    ];
    expect(filterOptions(tasks).priority).toEqual([
      { value: 'P0', label: 'P0 Critical' },
      { value: 'P2', label: 'P2 Medium' },
      { value: 'P3', label: 'P3 Low' },
    ]);
    const p2 = filterTasks(tasks, filters({ priority: ['P2'] }));
    expect(ids(p2)).toEqual([standard[2].id, standard[3].id]);
    expect(facetCounts(tasks, filters({})).priority.values.get('P2')).toBe(2);
  });
});

describe('labels', () => {
  const withLabels = [
    { ...standard[0], labels: ['ux', 'spike-2'] },
    { ...standard[1], labels: ['ux'] },
    { ...standard[2], labels: ['api', 'ux', 7 as unknown as string] },
    standard[3],
  ];

  it('offers the labels in the data, alphabetically; meta.labels sets their text and order first', () => {
    expect(filterOptions(withLabels).label).toEqual([
      { value: 'api', label: 'api' },
      { value: 'spike-2', label: 'spike-2' },
      { value: 'ux', label: 'ux' },
    ]);
    const vocab = resolveVocabulary({ labels: [{ id: 'ux', label: 'UX' }, { id: 'nope' }] });
    expect(filterOptions(withLabels, vocab).label.map((o) => o.label)).toEqual(['UX', 'api', 'spike-2']);
  });

  it('a task matches when it has any selected label; tasks without labels match only "All"', () => {
    expect(ids(filterTasks(withLabels, filters({ label: ['spike-2', 'api'] })))).toEqual([
      standard[0].id,
      standard[2].id,
    ]);
    expect(filterTasks(withLabels, filters({}))).toHaveLength(4);
  });

  it('counts each label once per task that has it', () => {
    const c = facetCounts(withLabels, filters({}));
    expect(Object.fromEntries(c.label.values)).toEqual({ ux: 3, 'spike-2': 1, api: 1 });
    expect(c.label.all).toBe(4);
    expect(facetCounts(withLabels, filters({ label: ['api'] })).phase.all).toBe(1);
  });

  it('search matches labels', () => {
    expect(ids(searchTasks(withLabels, 'spike-2'))).toEqual([standard[0].id]);
  });
});

describe('sortTasks', () => {
  const t = (id: string, phase: number, priority?: string): Task => ({
    id,
    name: id,
    phase,
    type: 'feature',
    description: '',
    status: 'todo',
    ...(priority ? { priority } : {}),
  });
  const tasks = [t('T-10', 0, 'P1'), t('T-2', 1, 'P0'), t('T-3', 0), t('T-1', 0, 'P1'), t('T-4', 0, 'P0')];

  it('keeps the file order, or sorts by priority, then phase, then ID', () => {
    expect(ids(sortTasks(tasks, 'file'))).toEqual(['T-10', 'T-2', 'T-3', 'T-1', 'T-4']);
    expect(ids(sortTasks(tasks, 'priority'))).toEqual(['T-4', 'T-2', 'T-1', 'T-10', 'T-3']);
  });

  it("uses the project's priorities", () => {
    const vocab = resolveVocabulary({ priorities: [{ id: 'P1' }, { id: 'P0' }], default_priority: 'P0' });
    expect(ids(sortTasks(tasks, 'priority', vocab))).toEqual(['T-1', 'T-10', 'T-3', 'T-4', 'T-2']);
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
  const counts = (f: Partial<Record<keyof Filters, string[]>>) => facetCounts(standard, filters(f));
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

describe('searchTasks', () => {
  const task = (id: string, name: string, description?: string, type = 'feature'): Task => ({
    id,
    name,
    phase: 0,
    type,
    description: description as string,
    status: 'todo',
  });
  const tasks = [
    task('T-001', 'Login form', 'Email and password'),
    task('T-002', 'Logout button', undefined, 'bugfix'),
    task('T-010', 'Docs', 'How to log in', 'docs'),
  ];
  const ids = (query: string) => searchTasks(tasks, query).map((t) => t.id);

  it('an empty or blank query matches everything', () => {
    expect(searchTasks(tasks, '')).toBe(tasks);
    expect(ids('   ')).toEqual(['T-001', 'T-002', 'T-010']);
  });

  it('matches ID, name, description and type, ignoring case', () => {
    expect(ids('t-01')).toEqual(['T-010']);
    expect(ids('LOG')).toEqual(['T-001', 'T-002', 'T-010']);
    expect(ids('password')).toEqual(['T-001']);
    expect(ids('bugfix')).toEqual(['T-002']);
  });

  it('every word must match', () => {
    expect(ids('log button')).toEqual(['T-002']);
    expect(ids('log nothing')).toEqual([]);
  });
});
