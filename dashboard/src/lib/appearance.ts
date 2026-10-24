// Light/dark mode and theme (FR-2, FR-3): chosen per browser, applied as data-theme / data-mode on <html>, where the
// theme stylesheets (src/themes/*.css) pick them up. index.html applies the stored choice before the first paint
// with the same rules; keep resolveMode() and that script in step.

export type Mode = 'light' | 'dark';
export type ModePref = 'system' | Mode;
export const MODE_PREFS: ModePref[] = ['system', 'light', 'dark'];
export const MODE_LABELS: Record<ModePref, string> = { system: 'System', light: 'Light', dark: 'Dark' };

export interface ThemeInfo {
  id: string;
  name: string;
}

/** Built-in themes, in picker order. Each has src/themes/<id>.css with light and dark token sets. */
export const THEMES: ThemeInfo[] = [{ id: 'default', name: 'Default' }];
export const DEFAULT_THEME = 'default';

export function isModePref(value: unknown): value is ModePref {
  return (MODE_PREFS as unknown[]).includes(value);
}

export function knownTheme(id: unknown): string {
  return THEMES.some((t) => t.id === id) ? (id as string) : DEFAULT_THEME;
}

export function resolveMode(pref: ModePref, systemPrefersLight: boolean): Mode {
  return pref === 'system' ? (systemPrefersLight ? 'light' : 'dark') : pref;
}

export function applyAppearance(root: HTMLElement, theme: string, mode: Mode) {
  root.dataset.theme = theme;
  root.dataset.mode = mode;
}
