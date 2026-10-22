import { describe, expect, it } from 'vitest';
import {
  FALLBACK_TYPE,
  graphNodeBg,
  PHASE_PALETTE,
  phaseColor,
  STATUS_COLORS,
  statusLabel,
  statusStyle,
  TYPE_COLORS,
  typeStyle,
} from '../../src/lib/theme';

describe('theme', () => {
  it('styles known types and falls back for unknown ones', () => {
    expect(typeStyle('feature')).toBe(TYPE_COLORS.feature);
    expect(typeStyle('bug')).toEqual(typeStyle('bugfix'));
    expect(typeStyle('spike')).toBe(FALLBACK_TYPE);
  });

  it('styles unknown statuses like todo', () => {
    expect(statusStyle('done')).toBe(STATUS_COLORS.done);
    expect(statusStyle('review')).toBe(STATUS_COLORS.todo);
  });

  it('cycles the phase palette', () => {
    expect(phaseColor(0)).toBe(PHASE_PALETTE[0]);
    expect(phaseColor(PHASE_PALETTE.length + 2)).toBe(PHASE_PALETTE[2]);
  });

  it('has a graph fill for every type and a fallback', () => {
    for (const type of Object.keys(TYPE_COLORS)) expect(graphNodeBg(type)).toMatch(/^#/);
    expect(graphNodeBg('spike')).toBe('var(--surface2)');
  });

  it('formats status labels', () => {
    expect(statusLabel('in_progress')).toBe('in progress');
    expect(statusLabel('done')).toBe('done');
  });
});
