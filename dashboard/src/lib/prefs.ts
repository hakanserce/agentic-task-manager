// Per-browser dashboard preferences in localStorage. Storage can be missing, blocked (private mode, file://,
// sandboxed previews) or hold junk, so every access falls back to defaults instead of throwing.

export const PREFS_KEY = 'atm-dashboard';

export interface Prefs {
  autoRefresh: boolean;
  autoRefreshSeconds: number;
  /** Last dashboard version whose release notes were opened */
  lastSeenVersion: string;
  kanbanGroupByPhase: boolean;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** True only if values can actually be written and read back (not just if localStorage exists). */
export function storageAvailable(): boolean {
  try {
    const s = storage();
    if (!s) return false;
    const probe = PREFS_KEY + ':probe';
    s.setItem(probe, '1');
    const ok = s.getItem(probe) === '1';
    s.removeItem(probe);
    return ok;
  } catch {
    return false;
  }
}

function readAll(): Partial<Prefs> {
  try {
    const raw = storage()?.getItem(PREFS_KEY);
    const value: unknown = raw ? JSON.parse(raw) : {};
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

/** The stored value, or `fallback` when it is missing, unreadable or of the wrong type. */
export function getPref<K extends keyof Prefs>(key: K, fallback: Prefs[K]): Prefs[K] {
  const value = readAll()[key];
  return typeof value === typeof fallback ? (value as Prefs[K]) : fallback;
}

/** Stores the value; silently does nothing when storage is unavailable. */
export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  try {
    storage()?.setItem(PREFS_KEY, JSON.stringify({ ...readAll(), [key]: value }));
  } catch {
    // Quota exceeded or storage blocked: preferences are a convenience, not state we must keep.
  }
}
