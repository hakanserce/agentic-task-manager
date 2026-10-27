import { describe, expect, it } from 'vitest';
import { projectStats } from '../../src/lib/projectstats';
import type { Task } from '../../src/lib/types';

// Times in minutes from T0
const T0 = Date.parse('2026-05-01T08:00:00Z');
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();
const t = (min: number) => T0 + min * 60_000;
const task = (id: string, fields: Partial<Task>): Task =>
  ({ id, name: id, phase: 0, type: 'feature', description: '', status: 'todo', ...fields }) as Task;

// A (a) 0–30 and B (b, interactive) 10–40 then in review until 60, both with a commit in PR #5; C skipped, D open
const TASKS = [
  task('A', {
    created_at: at(-60),
    started_by: 'claude:a',
    started_at: at(0),
    completed_at: at(30),
    status: 'done',
    commit: 'abc',
    pr: { number: 5 },
  }),
  task('B', {
    created_at: at(-30),
    started_by: 'claude:b',
    started_at: at(10),
    review_requested_at: at(40),
    completed_at: at(60),
    status: 'done',
    labels: ['interactive'],
    commit: 'def',
    pr: { number: 5 },
  }),
  task('C', { phase: 1, created_at: at(-10), status: 'skipped' }),
  task('D', { phase: 1 }),
];
const NOW = t(120);

describe('projectStats (T-253)', () => {
  const s = projectStats(TASKS, { workflow: { type: 'pull-request' } }, NOW, undefined, 2);

  it('started: the earliest created_at; duration from the first start, ongoing while tasks are open', () => {
    expect(s.started).toBe(t(-60));
    expect(s.duration).toEqual({ from: t(0), to: NOW, ongoing: true });
  });

  it('tasks and phases: archived tasks not loaded count as done', () => {
    expect(s.tasks).toEqual({ total: 6, done: 4, open: 1, skipped: 1 });
    expect(s.phases).toEqual({ total: 2, finished: 1 });
  });

  it('task commits and distinct pull requests', () => {
    expect([s.taskCommits, s.pullRequests]).toEqual([2, 1]);
  });

  it('agent time (alone and with you), most at once, and the average while any agent works', () => {
    expect([s.agentMs, s.aloneMs, s.withYouMs].map((v) => v / 60_000)).toEqual([60, 30, 30]);
    expect(s.maxAgents).toBe(2);
    // 60 m of agent time over 40 m (0–40) with someone at work
    expect(s.parallelism).toBe(1.5);
  });

  it('all finished: the duration ends at the last completion', () => {
    const done = TASKS.slice(0, 3);
    expect(projectStats(done, undefined, NOW).duration).toEqual({ from: t(0), to: t(60), ongoing: false });
  });

  it("without created_at, meta.created; a direct project's pull requests are –", () => {
    const s2 = projectStats([task('X', {})], { created: '2026-04-01', workflow: { type: 'direct' } }, NOW);
    expect(s2.started).toBe(Date.parse('2026-04-01'));
    expect(s2.pullRequests).toBeNull();
    expect(projectStats([task('X', { pr: { number: 3 } })], { workflow: { type: 'direct' } }, NOW).pullRequests).toBe(
      1,
    );
  });

  it("a person's own work isn't agent time", () => {
    const person = task('P', { started_by: 'Ana', started_at: at(0), completed_at: at(90), status: 'done' });
    expect(projectStats([...TASKS, person], undefined, NOW).agentMs / 60_000).toBe(60);
  });

  it('nothing started: no duration, no agent time, no parallelism', () => {
    const s3 = projectStats([task('X', {})], undefined, NOW);
    expect([s3.started, s3.duration, s3.agentMs, s3.maxAgents, s3.parallelism]).toEqual([null, null, 0, 0, null]);
  });
});
