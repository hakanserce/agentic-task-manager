// The visible part of a timeline: zoom around a point, pan, and keep the window inside the data.

export interface TimeWindow {
  start: number;
  end: number;
}

/** A zoomed-in window; `followEnd` keeps it pinned to the newest data as live work extends the timeline. */
export interface ViewWindow extends TimeWindow {
  followEnd: boolean;
}

/** The narrowest window, so bars never get absurdly wide */
export const MIN_SPAN = 5 * 60_000;

/** `w` moved and shrunk to fit inside `bounds`, and no narrower than MIN_SPAN (or the whole range, if shorter). */
export function clampWindow(w: TimeWindow, bounds: TimeWindow): TimeWindow {
  const full = Math.max(1, bounds.end - bounds.start);
  const span = Math.min(Math.max(w.end - w.start, Math.min(MIN_SPAN, full)), full);
  const start = Math.min(Math.max(w.start, bounds.start), bounds.end - span);
  return { start, end: start + span };
}

/** Zoom by `factor` (> 1 zooms in) keeping the time at `anchor` (0 = left edge, 1 = right edge) in place. */
export function zoomWindow(w: TimeWindow, bounds: TimeWindow, factor: number, anchor = 0.5): TimeWindow {
  const span = (w.end - w.start) / factor;
  const at = w.start + anchor * (w.end - w.start);
  return clampWindow({ start: at - anchor * span, end: at + (1 - anchor) * span }, bounds);
}

/** Shift the window by `delta` milliseconds, stopping at the edges. */
export function panWindow(w: TimeWindow, bounds: TimeWindow, delta: number): TimeWindow {
  const span = w.end - w.start;
  return clampWindow({ start: w.start + delta, end: w.start + delta + span }, bounds);
}

/** The window to keep after a zoom or pan: null when it shows everything, so it keeps showing everything. */
export function keepWindow(w: TimeWindow, bounds: TimeWindow): ViewWindow | null {
  const c = clampWindow(w, bounds);
  if (c.start <= bounds.start && c.end >= bounds.end) return null;
  return { ...c, followEnd: c.end >= bounds.end };
}

/** What a kept window shows now that `bounds` may have grown: all of it, or the same span at the newest end. */
export function resolveWindow(w: ViewWindow | null, bounds: TimeWindow): TimeWindow {
  if (!w) return bounds;
  const span = w.end - w.start;
  return clampWindow(w.followEnd ? { start: bounds.end - span, end: bounds.end } : w, bounds);
}
