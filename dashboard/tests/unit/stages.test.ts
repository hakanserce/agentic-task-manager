import { describe, expect, it } from 'vitest';
import type { KanbanCard } from '../../src/lib/kanban';
import { doneSections, hasStage, stageOf, workflowType } from '../../src/lib/stages';
import type { Task } from '../../src/lib/types';

const task = (id: string, fields: Partial<Task> = {}): Task => ({
  id,
  name: id,
  phase: 0,
  type: 'feature',
  description: '',
  status: 'done',
  ...fields,
});
const card = (t: Task): KanbanCard => ({ task: t, nextUp: false });

describe('stageOf', () => {
  it('a done task is Done, In PR with a pr, Merged with merged_at', () => {
    expect(stageOf(task('A'))).toBe('done');
    expect(stageOf(task('A', { pr: { number: 3, url: 'u' } }))).toBe('in_pr');
    expect(stageOf(task('A', { pr: { number: 3 }, merged_at: '2026-04-01T00:00:00Z' }))).toBe('merged');
  });

  it('tasks that are not done have no stage; a malformed pr is ignored', () => {
    expect(stageOf(task('A', { status: 'in_progress', pr: { number: 3 } }))).toBeUndefined();
    expect(stageOf(task('A', { pr: { url: 'u' } as unknown as Task['pr'] }))).toBe('done');
    expect(hasStage(task('A'))).toBe(false);
    expect(hasStage(task('A', { merged_at: '2026-04-01T00:00:00Z' }))).toBe(true);
  });
});

describe('doneSections', () => {
  it('In PR per PR (newest PR first), then Done, then Merged; empty sections left out; order kept', () => {
    const cards = [
      task('A', { pr: { number: 7, url: 'u7' } }),
      task('B'),
      task('C', { pr: { number: 9, url: 'u9' } }),
      task('D', { pr: { number: 5 }, merged_at: '2026-04-01T00:00:00Z' }),
      task('E', { pr: { number: 7, url: 'u7' } }),
    ].map(card);
    const sections = doneSections(cards);
    expect(sections.map((s) => [s.label, s.cards.map((c) => c.task.id)])).toEqual([
      ['In PR #9', ['C']],
      ['In PR #7', ['A', 'E']],
      ['Done', ['B']],
      ['Merged', ['D']],
    ]);
    expect(sections[1].url).toBe('u7');
    expect(doneSections([card(task('B'))]).map((s) => s.id)).toEqual(['done']);
  });
});

describe('workflowType', () => {
  it('reads meta.workflow.type', () => {
    expect(workflowType({ workflow: { type: 'pull-request' } })).toBe('pull-request');
    expect(workflowType({ workflow: 'direct' })).toBeUndefined();
    expect(workflowType(undefined)).toBeUndefined();
  });
});
