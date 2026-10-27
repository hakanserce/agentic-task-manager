import { describe, expect, it } from 'vitest';
import { allBoard, allBoardLanes, BOARD_COLUMNS } from '../../src/lib/allboard';
import type { BoardCard, BoardColumnId, ProjectBoard, ProjectEntry, ProjectSummary } from '../../src/lib/load';

const card = (id: string, fields: Partial<BoardCard> = {}): BoardCard => ({
  id,
  name: id,
  type: 'feature',
  phase: 1,
  priority: 'P2',
  labels: [],
  ...fields,
});

function project(
  id: string,
  lastActivity: string | null,
  columns: Partial<Record<BoardColumnId, BoardCard[]>>,
  counts: Partial<Record<BoardColumnId, number>> = {},
  extra: Partial<ProjectEntry> = {},
): ProjectEntry {
  const board = Object.fromEntries(
    BOARD_COLUMNS.map(({ id: c }) => [c, { count: counts[c] ?? (columns[c] ?? []).length, cards: columns[c] ?? [] }]),
  ) as ProjectBoard;
  return {
    id,
    name: id,
    path: `/${id}`,
    missing: false,
    summary: { last_activity: lastActivity, board } as ProjectSummary,
    ...extra,
  };
}

const ids = (columns: ReturnType<typeof allBoard>, id: BoardColumnId) =>
  columns.find((c) => c.id === id)!.cards.map((c) => `${c.project.id}/${c.card.id}`);

describe('allBoard', () => {
  it('has the five columns, empty ones saying why', () => {
    const columns = allBoard([]);
    expect(columns.map((c) => c.id)).toEqual(['todo', 'active', 'review', 'blocked', 'done']);
    expect(columns[0]).toMatchObject({ cards: [], more: [], empty: 'Nothing ready to start' });
    expect(columns[4].empty).toBe('Nothing finished in the last 24 hours');
  });

  it('To Do: the most recently active project first, each in its own order', () => {
    const a = project('a', '2026-03-01T10:00:00Z', { todo: [card('A-2'), card('A-1')] });
    const b = project('b', '2026-03-01T11:00:00Z', { todo: [card('B-1')] });
    const never = project('n', null, { todo: [card('N-1')] });
    expect(ids(allBoard([never, a, b]), 'todo')).toEqual(['b/B-1', 'a/A-2', 'a/A-1', 'n/N-1']);
  });

  it('in progress and review: the longest first; unknown times last', () => {
    const a = project('a', null, {
      active: [card('A-1', { since: '2026-03-01T10:00:00Z' }), card('A-2', { since: null })],
      review: [card('A-3', { since: '2026-03-01T09:00:00Z' })],
    });
    const b = project('b', null, {
      active: [card('B-1', { since: '2026-03-01T08:00:00Z' })],
      review: [card('B-2', { since: '2026-03-01T10:00:00Z' })],
    });
    const columns = allBoard([a, b]);
    expect(ids(columns, 'active')).toEqual(['b/B-1', 'a/A-1', 'a/A-2']);
    expect(ids(columns, 'review')).toEqual(['a/A-3', 'b/B-2']);
  });

  it('blocked: on you first, then the longest waiting', () => {
    const a = project('a', null, {
      blocked: [
        card('A-1', { since: '2026-03-01T06:00:00Z', waiting_on: 'agent' }),
        card('A-2', { since: '2026-03-01T11:00:00Z', waiting_on: 'user' }),
      ],
    });
    const b = project('b', null, { blocked: [card('B-1', { since: '2026-03-01T09:00:00Z', waiting_on: 'user' })] });
    expect(ids(allBoard([a, b]), 'blocked')).toEqual(['b/B-1', 'a/A-2', 'a/A-1']);
  });

  it('done: the most recent first; unknown times last', () => {
    const a = project('a', null, {
      done: [card('A-1', { completed_at: '2026-03-01T10:00:00Z' }), card('A-2', { completed_at: null })],
    });
    const b = project('b', null, { done: [card('B-1', { completed_at: '2026-03-01T11:00:00Z' })] });
    expect(ids(allBoard([a, b]), 'done')).toEqual(['b/B-1', 'a/A-1', 'a/A-2']);
  });

  it('one cap per column; "+ N more" per project counts what the server and the cap left out', () => {
    const a = project('a', '2026-03-01T11:00:00Z', { todo: [card('A-1'), card('A-2')] }, { todo: 12 });
    const b = project('b', '2026-03-01T10:00:00Z', { todo: [card('B-1'), card('B-2')] });
    const todo = allBoard([a, b], 3)[0];
    expect(todo.cards.map((c) => c.card.id)).toEqual(['A-1', 'A-2', 'B-1']);
    expect(todo.more.map((m) => [m.project.id, m.count])).toEqual([
      ['a', 10],
      ['b', 1],
    ]);
  });

  it('grouped by project: a lane each, the most recently active first; no lane without cards (T-260)', () => {
    const a = project('a', '2026-03-01T10:00:00Z', { todo: [card('A-1')] });
    const b = project('b', '2026-03-01T11:00:00Z', { done: [card('B-1')] }, { done: 3 });
    const empty = project('e', '2026-03-01T12:00:00Z', {});
    const gone = project('g', null, { todo: [card('G-1')] }, {}, { missing: true });
    const lanes = allBoardLanes([a, b, empty, gone]);
    expect(lanes.map((l) => l.project.id)).toEqual(['b', 'a']);
    const done = lanes[0].columns.find((c) => c.id === 'done')!;
    expect([done.cards.length, done.more.map((m) => m.count)]).toEqual([1, [2]]);
  });

  it('projects without a board (gone, or an older server) add nothing', () => {
    const gone = project('g', null, { todo: [card('G-1')] }, {}, { missing: true });
    const older = { ...project('o', null, {}), summary: { last_activity: null } as ProjectSummary };
    expect(allBoard([gone, older]).every((c) => c.cards.length === 0 && c.more.length === 0)).toBe(true);
  });
});
