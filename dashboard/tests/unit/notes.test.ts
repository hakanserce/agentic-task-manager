import { describe, expect, it } from 'vitest';
import { noteKindLabel, shortSha, taskNotes } from '../../src/lib/notes';
import type { Task } from '../../src/lib/types';

const task = (fields: Partial<Task> = {}): Task => ({
  id: 'T-1',
  name: 'x',
  phase: 0,
  type: 'feature',
  description: '',
  status: 'todo',
  ...fields,
});

describe('taskNotes', () => {
  it('lists the notes newest first', () => {
    const notes = taskNotes(
      task({
        notes: [
          { at: '2026-04-01T08:00:00Z', kind: 'handoff', text: 'half done' },
          { at: '2026-04-02T08:00:00Z', by: 'claude:1', kind: 'outcome', text: 'shipped' },
          { at: '2026-04-01T12:00:00Z', kind: 'rejection', text: 'rename it' },
        ],
      }),
    );
    expect(notes.map((n) => n.kind)).toEqual(['outcome', 'rejection', 'handoff']);
  });

  it('shows a legacy last_failure as a failure note, once', () => {
    const legacy = { at: '2026-04-01T09:00:00Z', reason: 'tests failed' };
    expect(taskNotes(task({ last_failure: legacy }))).toEqual([
      { at: '2026-04-01T09:00:00Z', kind: 'failure', text: 'tests failed' },
    ]);
    const both = task({
      last_failure: legacy,
      notes: [{ at: '2026-04-01T09:00:00Z', kind: 'failure', text: 'tests failed' }],
    });
    expect(taskNotes(both)).toHaveLength(1);
  });

  it('ignores malformed notes and has none for a task without', () => {
    expect(taskNotes(task())).toEqual([]);
    expect(taskNotes(task({ notes: [null, { kind: 'note' }] as unknown as Task['notes'] }))).toEqual([]);
  });
});

describe('labels and SHAs', () => {
  it('names the kinds, and keeps unknown ones as they are', () => {
    expect(noteKindLabel('rejection')).toBe('Rejected');
    expect(noteKindLabel('custom')).toBe('custom');
  });

  it('shortens a SHA to 7 characters', () => {
    expect(shortSha('e4969ae1234567890')).toBe('e4969ae');
  });
});
