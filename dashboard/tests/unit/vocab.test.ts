import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRIORITIES,
  DEFAULT_STATUSES,
  DEFAULT_TYPES,
  DEFAULT_VOCABULARY,
  humanize,
  kindOf,
  phaseLabel,
  priorityLabel,
  priorityOf,
  priorityRank,
  resolveVocabulary,
  statusLabel,
  statusRank,
  typeLabel,
} from '../../src/lib/vocab';

const custom = {
  statuses: [
    { id: 'backlog', label: 'Backlog', kind: 'todo' },
    { id: 'doing', label: 'Doing', kind: 'active' },
    { id: 'awaiting_user', label: 'Awaiting you', kind: 'review' },
    { id: 'shipped', label: 'Shipped', kind: 'done' },
  ],
  types: [{ id: 'spike', label: 'Spike' }, { id: 'chore' }],
  priorities: [
    { id: 'must', label: 'Must' },
    { id: 'should', label: 'Should' },
    { id: 'could', label: 'Could' },
  ],
  default_priority: 'should',
  phases: [{ id: 1, name: 'Foundations' }, { id: 2 }, { id: 'x', name: 'ignored' }],
};

describe('resolveVocabulary', () => {
  it('uses the defaults without meta, in_review included', () => {
    expect(resolveVocabulary(undefined)).toEqual(DEFAULT_VOCABULARY);
    expect(DEFAULT_STATUSES.map((s) => `${s.id}:${s.kind}`)).toEqual([
      'todo:todo',
      'in_progress:active',
      'in_review:review',
      'blocked:blocked',
      'done:done',
      'skipped:skipped',
    ]);
    expect(DEFAULT_TYPES.map((t) => t.id)).toEqual([
      'feature',
      'bugfix',
      'test',
      'infra',
      'docs',
      'refactor',
      'polish',
    ]);
    expect(DEFAULT_PRIORITIES.map((p) => p.id)).toEqual(['P0', 'P1', 'P2', 'P3']);
    expect(DEFAULT_VOCABULARY.defaultPriority).toBe('P2');
  });

  it("takes the project's lists, filling in missing labels", () => {
    const v = resolveVocabulary(custom);
    expect(v.statuses.map((s) => s.id)).toEqual(['backlog', 'doing', 'awaiting_user', 'shipped']);
    expect(v.types).toEqual([
      { id: 'spike', label: 'Spike' },
      { id: 'chore', label: 'Chore' },
    ]);
    expect(v.priorities.map((p) => p.id)).toEqual(['must', 'should', 'could']);
    expect(v.defaultPriority).toBe('should');
    expect([...v.phaseNames]).toEqual([[1, 'Foundations']]);
  });

  it('replaces a list it cannot use by the default, list by list', () => {
    const noDone = custom.statuses.filter((s) => s.kind !== 'done');
    expect(resolveVocabulary({ ...custom, statuses: noDone }).statuses).toBe(DEFAULT_STATUSES);
    const badKind = [...custom.statuses, { id: 'x', label: 'X', kind: 'waiting' }];
    expect(resolveVocabulary({ ...custom, statuses: badKind }).statuses).toBe(DEFAULT_STATUSES);
    const duplicate = [...custom.types, { id: 'spike' }];
    expect(resolveVocabulary({ ...custom, types: duplicate }).types).toBe(DEFAULT_TYPES);
    expect(resolveVocabulary({ ...custom, types: [] }).types).toBe(DEFAULT_TYPES);
    expect(resolveVocabulary({ ...custom, types: [{ label: 'no id' }] }).types).toBe(DEFAULT_TYPES);
    // The other lists are still the project's
    expect(resolveVocabulary({ ...custom, types: [] }).statuses[0].id).toBe('backlog');
  });

  it('picks a default priority that exists', () => {
    expect(resolveVocabulary({ ...custom, default_priority: 'nope' }).defaultPriority).toBe('should');
    expect(resolveVocabulary({ priorities: custom.priorities }).defaultPriority).toBe('should');
    expect(resolveVocabulary({ default_priority: 'P1' }).defaultPriority).toBe('P1');
  });
});

describe('lookups', () => {
  const v = resolveVocabulary(custom);

  it('finds kinds, falling back to the default statuses, else none', () => {
    expect(kindOf(v, 'awaiting_user')).toBe('review');
    expect(kindOf(v, 'in_progress')).toBe('active'); // a default status the project didn't list
    expect(kindOf(v, 'weird')).toBeUndefined();
  });

  it('labels statuses, types and phases', () => {
    expect(statusLabel(v, 'shipped')).toBe('Shipped');
    expect(statusLabel(v, 'in_review')).toBe('In Review');
    expect(statusLabel(v, 'on_hold')).toBe('On hold');
    expect(typeLabel(v, 'chore')).toBe('Chore');
    expect(typeLabel(v, 'bug')).toBe('Bug');
    expect(phaseLabel(v, 1)).toBe('Phase 1 · Foundations');
    expect(phaseLabel(v, 2)).toBe('Phase 2');
    expect(humanize('in_progress')).toBe('In progress');
  });

  it('resolves priorities: missing or unknown ones are the default, ranked like it', () => {
    expect(priorityOf(v, { priority: 'must' })).toBe('must');
    expect(priorityOf(v, {})).toBe('should');
    expect(priorityOf(v, { priority: 'P0' })).toBe('should');
    expect([priorityRank(v, 'must'), priorityRank(v, 'could'), priorityRank(v, 'nope')]).toEqual([0, 2, 1]);
    expect(priorityLabel(v, 'could')).toBe('Could');
    expect(priorityLabel(v, 'P0')).toBe('P0');
  });

  it("ranks statuses in the vocabulary's order, unknown ones last", () => {
    expect(statusRank(v, 'backlog')).toBe(0);
    expect(statusRank(v, 'shipped')).toBe(3);
    expect(statusRank(v, 'weird')).toBe(4);
  });
});
