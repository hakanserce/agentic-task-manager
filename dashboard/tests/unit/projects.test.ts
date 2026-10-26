import { describe, expect, it } from 'vitest';
import type { ProjectEntry, ProjectSummary } from '../../src/lib/load';
import { isActive, needsYou, openTasks, orderProjects } from '../../src/lib/projects';

const NOW = Date.parse('2026-03-01T12:00:00Z');

function project(id: string, fields: Partial<ProjectSummary> | null = {}, missing = false): ProjectEntry {
  const summary: ProjectSummary | null =
    fields === null
      ? null
      : {
          total: 10,
          done: 5,
          skipped: 0,
          percent: 50,
          current_phase: null,
          agents_working: 0,
          needs_you: { review: 0, blocked_on_user: 0 },
          last_activity: '2026-03-01T10:00:00Z',
          completions_14d: [],
          recent_phases: [],
          ...fields,
        };
  return { id, name: id, path: `/${id}`, missing, summary };
}

describe('needsYou and openTasks', () => {
  it('count reviews and questions for the user; open work is neither done nor skipped', () => {
    const p = project('a', { total: 10, done: 4, skipped: 3, needs_you: { review: 2, blocked_on_user: 1 } });
    expect([needsYou(p), openTasks(p)]).toEqual([3, 3]);
    expect([needsYou(project('b', null)), openTasks(project('b', null))]).toEqual([0, 0]);
  });
});

describe('isActive', () => {
  it('open work, or activity in the last 14 days', () => {
    const finished = { total: 4, done: 4 };
    expect(isActive(project('open', { last_activity: '2025-01-01T00:00:00Z' }), NOW)).toBe(true);
    expect(isActive(project('recent', { ...finished, last_activity: '2026-02-20T00:00:00Z' }), NOW)).toBe(true);
    expect(isActive(project('idle', { ...finished, last_activity: '2026-02-01T00:00:00Z' }), NOW)).toBe(false);
    expect(isActive(project('never', { ...finished, last_activity: null }), NOW)).toBe(false);
    expect(isActive(project('idle', { ...finished, last_activity: '2026-02-01T00:00:00Z' }), NOW, 60)).toBe(true);
  });

  it('a project whose folder is gone, or without a summary, stays visible', () => {
    expect(isActive(project('gone', null, true), NOW)).toBe(true);
    expect(isActive(project('unsummarized', null), NOW)).toBe(true);
  });
});

describe('orderProjects', () => {
  it('needs you first, then the most recent activity, then the name; gone ones last', () => {
    const list = [
      project('gone', null, true),
      project('old', { last_activity: '2026-01-01T00:00:00Z' }),
      project('asks', { needs_you: { review: 1, blocked_on_user: 0 }, last_activity: '2025-12-01T00:00:00Z' }),
      project('new', { last_activity: '2026-02-28T00:00:00Z' }),
      project('b-quiet', { last_activity: null }),
      project('a-quiet', { last_activity: null }),
    ];
    expect(orderProjects(list).map((p) => p.id)).toEqual(['asks', 'new', 'old', 'a-quiet', 'b-quiet', 'gone']);
  });
});
