// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildBoard, buildLanes, nextUp, readiness } from '../../src/lib/kanban';
import type { Task } from '../../src/lib/types';
import { resolveVocabulary } from '../../src/lib/vocab';
import standard from '../fixtures/standard.json';

const t = (id: string, status: string, extra: Partial<Task> = {}): Task => ({
  id,
  name: id,
  phase: 0,
  type: 'feature',
  description: '',
  status,
  dependencies: [],
  ...extra,
});
const ids = (tasks: { task: Task }[]) => tasks.map((c) => c.task.id);
const all = { showSkipped: false, statusFilter: new Set<string>() };

describe('readiness', () => {
  const map = new Map([t('a', 'done'), t('b', 'todo')].map((x) => [x.id, x]));

  it('is ready when every dependency is done', () => {
    expect(readiness(t('x', 'todo', { dependencies: ['a'] }), map)).toEqual({ ready: true });
    expect(readiness(t('x', 'todo'), map)).toEqual({ ready: true });
  });

  it('lists unfinished and missing dependencies', () => {
    expect(readiness(t('x', 'todo', { dependencies: ['a', 'b', 'gone'] }), map)).toEqual({
      ready: false,
      waitingOn: ['b', 'gone'],
    });
  });
});

describe('nextUp', () => {
  it('picks the ready todo task with the lowest phase, then the lowest ID', () => {
    const tasks = [
      t('T-3', 'todo', { phase: 1 }),
      t('T-10', 'todo', { phase: 0 }),
      t('T-9', 'todo', { phase: 0 }),
      t('T-1', 'todo', { phase: 0, dependencies: ['T-3'] }),
      t('T-2', 'in_progress', { phase: 0 }),
    ];
    // T-1 waits on T-3; T-9 < T-10 numerically
    expect(nextUp(tasks)?.id).toBe('T-9');
  });

  it('matches the standard fixture', () => {
    // Ready todo tasks: T-006 (phase 1, deps done). T-008/T-009/T-011 wait on unfinished work.
    expect(nextUp(standard.tasks as Task[])?.id).toBe('T-006');
  });

  it('is undefined when nothing is ready', () => {
    expect(nextUp([t('a', 'done'), t('b', 'todo', { dependencies: ['c'] }), t('c', 'blocked')])).toBeUndefined();
  });

  it('is the rule /atm:loop-tasks uses: the skill takes its tasks from `atm next`', () => {
    // The rule itself lives in plugin/scripts/atm.py (next_task); next-up-parity.test.ts checks that it and nextUp()
    // pick the same task for every fixture. If this fails, the skill stopped using atm next: re-check the parity.
    const skill = readFileSync(new URL('../../../plugin/skills/loop-tasks/SKILL.md', import.meta.url), 'utf8');
    expect(skill).toContain('`atm next --claim --json [selection] [--type T]`');
    expect(skill).toContain('to do, all dependencies done, not claimed');
    expect(skill).toContain('then the most urgent priority, then lowest task ID');
  });
});

describe('buildBoard', () => {
  it("has the vocabulary's columns by default (Skipped hidden), with counts", () => {
    const board = buildBoard(standard.tasks as Task[], standard.tasks as Task[], all);
    expect(board.map((c) => [c.label, c.cards.length])).toEqual([
      ['To Do', 4],
      ['In Progress', 1],
      ['In Review', 0],
      ['Blocked', 1],
      ['Done', 5],
    ]);
  });

  it('shows Skipped on request and Other only for unknown statuses', () => {
    const tasks = [t('a', 'skipped'), t('b', 'review'), t('c', 'todo')];
    expect(buildBoard(tasks, tasks, all).map((c) => c.id)).toEqual([
      'todo',
      'in_progress',
      'in_review',
      'blocked',
      'done',
      'other',
    ]);
    expect(buildBoard(tasks, tasks, { ...all, showSkipped: true }).map((c) => c.id)).toContain('skipped');
    expect(buildBoard([tasks[2]], tasks, all).map((c) => c.id)).not.toContain('other');
  });

  it('keeps every column under a status filter, adding Skipped when the filter names it', () => {
    const tasks = standard.tasks as Task[];
    const done = tasks.filter((x) => x.status === 'done');
    const board = buildBoard(done, tasks, { ...all, statusFilter: new Set(['done', 'skipped']) });
    expect(board.map((c) => c.id)).toEqual(['todo', 'in_progress', 'in_review', 'blocked', 'done', 'skipped']);
    expect(board.find((c) => c.id === 'in_review')!.cards).toEqual([]);
    expect(buildBoard(done, tasks, { ...all, statusFilter: new Set(['done']) }).map((c) => c.id)).not.toContain(
      'skipped',
    );
  });

  it('orders Todo ready-first, then by phase and ID', () => {
    const tasks = [
      t('T-1', 'todo', { phase: 0, dependencies: ['T-9'] }),
      t('T-3', 'todo', { phase: 1 }),
      t('T-2', 'todo', { phase: 1 }),
      t('T-9', 'in_progress'),
    ];
    const todo = buildBoard(tasks, tasks, all)[0];
    expect(ids(todo.cards)).toEqual(['T-2', 'T-3', 'T-1']);
    expect(todo.cards.map((c) => c.readiness?.ready)).toEqual([true, true, false]);
    expect(todo.cards.map((c) => c.nextUp)).toEqual([true, false, false]);
  });

  it('orders In Progress by start and Done by completion, newest first, with fallbacks', () => {
    const tasks = [
      t('a', 'in_progress', { started_at: '2026-04-01T00:00:00Z' }),
      t('b', 'in_progress', { updated_at: '2026-04-03T00:00:00Z' }),
      t('c', 'done', { completed_at: '2026-04-02T00:00:00Z', updated_at: '2026-04-09T00:00:00Z' }),
      t('d', 'done', { updated_at: '2026-04-05T00:00:00Z' }),
      t('e', 'done'),
    ];
    const board = buildBoard(tasks, tasks, all);
    expect(ids(board.find((c) => c.id === 'in_progress')!.cards)).toEqual(['b', 'a']);
    expect(ids(board.find((c) => c.id === 'done')!.cards)).toEqual(['d', 'c', 'e']);
  });

  it('judges readiness and next-up against all tasks, not just the visible ones', () => {
    const allTasks = [
      t('T-1', 'todo', { phase: 0 }),
      t('T-2', 'todo', { phase: 1, dependencies: ['T-3'] }),
      t('T-3', 'done'),
    ];
    const visible = allTasks.filter((x) => x.phase === 1);
    const todo = buildBoard(visible, allTasks, all)[0];
    expect(todo.cards[0].readiness).toEqual({ ready: true });
    // T-1 (hidden by the filter) is still the loop's next pick
    expect(todo.cards[0].nextUp).toBe(false);
  });
});

describe('a custom vocabulary', () => {
  const vocab = resolveVocabulary({
    statuses: [
      { id: 'backlog', label: 'Backlog', kind: 'todo' },
      { id: 'doing', label: 'Doing', kind: 'active' },
      { id: 'awaiting_user', label: 'Awaiting you', kind: 'review' },
      { id: 'shipped', label: 'Shipped', kind: 'done' },
      { id: 'dropped', label: 'Dropped', kind: 'skipped' },
    ],
  });
  const tasks = [
    t('T-1', 'shipped', { phase: 0 }),
    t('T-2', 'backlog', { phase: 0, dependencies: ['T-1'] }),
    t('T-3', 'backlog', { phase: 0, dependencies: ['T-4'] }),
    t('T-4', 'awaiting_user', { phase: 0 }),
    t('T-5', 'dropped', { phase: 0 }),
    t('T-6', 'todo', { phase: 0 }),
  ];
  const options = { ...all, vocab };

  it('makes its columns, in its order and with its labels; skipped-kind columns behind the toggle', () => {
    const board = buildBoard(tasks, tasks, options);
    expect(board.map((c) => [c.id, c.label, c.kind])).toEqual([
      ['backlog', 'Backlog', 'todo'],
      ['doing', 'Doing', 'active'],
      ['awaiting_user', 'Awaiting you', 'review'],
      ['shipped', 'Shipped', 'done'],
      // `todo` isn't one of its statuses
      ['other', 'Other', undefined],
    ]);
    expect(buildBoard(tasks, tasks, { ...options, showSkipped: true }).map((c) => c.id)).toContain('dropped');
  });

  it('judges readiness and next-up by kind: done-kind meets a dependency, review-kind does not', () => {
    const backlog = buildBoard(tasks, tasks, options)[0];
    expect(backlog.cards.map((c) => [c.task.id, c.readiness, c.nextUp])).toEqual([
      ['T-2', { ready: true }, true],
      ['T-3', { ready: false, waitingOn: ['T-4'] }, false],
    ]);
    expect(nextUp(tasks, vocab)?.id).toBe('T-2');
  });

  it('counts done-kind tasks as done in lanes', () => {
    expect(buildLanes(tasks, tasks, options)[0].done).toBe(1);
  });
});

describe('buildLanes', () => {
  it('makes one lane per phase with progress, all with the same columns', async () => {
    const { buildLanes } = await import('../../src/lib/kanban');
    const tasks = [
      t('a', 'done', { phase: 0 }),
      t('b', 'todo', { phase: 0 }),
      t('c', 'review', { phase: 1 }),
      t('d', 'in_progress', { phase: 1 }),
    ];
    const lanes = buildLanes(tasks, tasks, all);
    expect(lanes.map((l) => [l.phase, l.done, l.total])).toEqual([
      [0, 1, 2],
      [1, 0, 2],
    ]);
    // "Other" exists because of phase 1; phase 0 gets it too (empty) so lanes line up
    for (const lane of lanes)
      expect(lane.columns.map((c) => c.id)).toEqual(['todo', 'in_progress', 'in_review', 'blocked', 'done', 'other']);
    expect(lanes[0].columns.find((c) => c.id === 'other')!.cards).toEqual([]);
    expect(ids(lanes[1].columns.find((c) => c.id === 'other')!.cards)).toEqual(['c']);
  });
});
