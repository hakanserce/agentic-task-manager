import { describe, expect, it } from 'vitest';
import {
  FALLBACK_TYPE,
  graphNodeBg,
  KIND_COLORS,
  KIND_EMOJI,
  kindStyle,
  PHASE_PALETTE,
  phaseColor,
  TYPE_COLORS,
  typeStyle,
} from '../../src/lib/theme';
import { KINDS } from '../../src/lib/vocab';

describe('theme', () => {
  it('styles known types and falls back for unknown ones', () => {
    expect(typeStyle('feature')).toBe(TYPE_COLORS.feature);
    expect(typeStyle('bug')).toEqual(typeStyle('bugfix'));
    expect(typeStyle('spike')).toBe(FALLBACK_TYPE);
  });

  it('styles statuses by kind, and a status without a kind like todo', () => {
    expect(kindStyle('done')).toBe(KIND_COLORS.done);
    expect(kindStyle(undefined)).toBe(KIND_COLORS.todo);
  });

  it('has a colour and an icon for every kind', () => {
    for (const kind of KINDS) {
      expect(KIND_COLORS[kind].color).toMatch(/^var\(--/);
      expect(KIND_EMOJI[kind]).toBeTruthy();
    }
  });

  it('cycles the phase palette', () => {
    expect(phaseColor(0)).toBe(PHASE_PALETTE[0]);
    expect(phaseColor(PHASE_PALETTE.length + 2)).toBe(PHASE_PALETTE[2]);
  });

  it('has a graph fill for every type and a fallback', () => {
    for (const type of Object.keys(TYPE_COLORS)) expect(graphNodeBg(type)).toMatch(/^var\(--node-[a-z]+\)$/);
    expect(graphNodeBg('spike')).toBe('var(--surface2)');
  });
});
