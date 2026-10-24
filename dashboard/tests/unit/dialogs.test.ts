import { describe, expect, it } from 'vitest';
import { parseDialogHash, withDialogHash } from '../../src/lib/dialogs';
import { formatHash, hashParams } from '../../src/lib/hash';

describe('formatHash', () => {
  it('writes flags without "=" and keeps the order', () => {
    expect(formatHash(hashParams('#view=kanban&about'))).toBe('#view=kanban&about');
    expect(formatHash(hashParams('#about='))).toBe('#about');
    expect(formatHash(hashParams(''))).toBe('#');
  });
});

describe('parseDialogHash', () => {
  it('reads the dialog flag', () => {
    expect(parseDialogHash('#about')).toBe('about');
    expect(parseDialogHash('#view=list&about')).toBe('about');
  });

  it('is null without one', () => {
    expect(parseDialogHash('')).toBeNull();
    expect(parseDialogHash('#view=about')).toBeNull();
  });
});

describe('withDialogHash', () => {
  it('opens a dialog, keeping the other parameters', () => {
    expect(withDialogHash('#view=kanban', 'about')).toBe('#view=kanban&about');
    expect(withDialogHash('', 'about')).toBe('#about');
  });

  it('closes it', () => {
    expect(withDialogHash('#view=kanban&about', null)).toBe('#view=kanban');
  });
});
