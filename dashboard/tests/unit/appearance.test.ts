import { describe, expect, it } from 'vitest';
import { applyAppearance, isModePref, knownTheme, resolveMode, THEMES } from '../../src/lib/appearance';

describe('appearance', () => {
  it('System follows the OS; Light and Dark override it', () => {
    expect(resolveMode('system', true)).toBe('light');
    expect(resolveMode('system', false)).toBe('dark');
    expect(resolveMode('light', false)).toBe('light');
    expect(resolveMode('dark', true)).toBe('dark');
  });

  it('accepts only known mode choices', () => {
    for (const ok of ['system', 'light', 'dark']) expect(isModePref(ok)).toBe(true);
    for (const bad of ['auto', '', null, 1]) expect(isModePref(bad)).toBe(false);
  });

  it('unknown themes fall back to Default', () => {
    expect(knownTheme('default')).toBe('default');
    expect(knownTheme('vaporwave')).toBe('default');
    expect(knownTheme(undefined)).toBe('default');
    expect(THEMES[0]).toEqual({ id: 'default', name: 'Default' });
  });

  it('applies theme and mode as attributes on the root element', () => {
    const root = document.createElement('html');
    applyAppearance(root, 'default', 'light');
    expect(root.dataset).toMatchObject({ theme: 'default', mode: 'light' });
  });
});
