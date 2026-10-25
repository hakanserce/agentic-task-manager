import { describe, expect, it } from 'vitest';
import { archivableCount, archiveNotice, archiveSettings } from '../../src/lib/archive';
import type { Task } from '../../src/lib/types';

const NOW = Date.parse('2026-05-01T00:00:00Z');
const task = (id: string, fields: Partial<Task> = {}): Task => ({
  id,
  name: id,
  phase: 0,
  type: 'feature',
  description: '',
  status: 'done',
  completed_at: '2026-03-01T00:00:00Z',
  ...fields,
});

describe('archiveSettings', () => {
  it("meta.archive's numbers, else atm-cli's defaults", () => {
    expect(archiveSettings(undefined)).toEqual({ thresholdKb: 1024, thresholdTasks: 500, keepDays: 14 });
    expect(archiveSettings({ archive: { threshold_tasks: 3, keep_days: -1, threshold_kb: 'x' } })).toEqual({
      thresholdKb: 1024,
      thresholdTasks: 3,
      keepDays: 14,
    });
  });
});

describe('archivableCount', () => {
  it('counts done and skipped tasks finished before keep_days, not in an open PR', () => {
    const tasks = [
      task('A'),
      task('B', { status: 'skipped', completed_at: undefined, updated_at: '2026-03-01T00:00:00Z' }),
      task('C', { completed_at: '2026-04-25T00:00:00Z' }), // recent
      task('D', { pr: { number: 3 } }), // open PR
      task('E', { pr: { number: 2 }, merged_at: '2026-03-02T00:00:00Z' }), // merged: archivable
      task('F', { status: 'todo' }),
      task('G', { completed_at: undefined }), // no time: archivable, like atm
    ];
    expect(archivableCount(tasks, archiveSettings(undefined), NOW)).toBe(4);
  });
});

describe('archiveNotice', () => {
  const four = ['A', 'B', 'C', 'D'].map((id) => task(id));

  it('over threshold_tasks, or over threshold_kb, with something to move', () => {
    expect(archiveNotice(four, { archive: { threshold_tasks: 3 } }, 2048, NOW)).toBe(
      'tasks.json is 2 KB: `atm archive` would move 4 finished tasks to tasks-archive.json',
    );
    expect(archiveNotice(four.slice(0, 1), {}, 3 * 1_048_576, NOW)).toBe(
      'tasks.json is 3.0 MB: `atm archive` would move 1 finished task to tasks-archive.json',
    );
  });

  it('nothing below the thresholds, or with nothing to move', () => {
    expect(archiveNotice(four, {}, 2048, NOW)).toBeNull();
    expect(archiveNotice([task('A', { status: 'todo' })], {}, 3 * 1_048_576, NOW)).toBeNull();
  });
});
