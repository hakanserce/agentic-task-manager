import { describe, expect, it } from 'vitest';
import { clampWindow, keepWindow, MIN_SPAN, panWindow, resolveWindow, zoomWindow } from '../../src/lib/time-window';

const H = 3_600_000;
const bounds = { start: 0, end: 10 * H };

describe('clampWindow', () => {
  it('moves a window back inside the bounds, keeping its span', () => {
    expect(clampWindow({ start: -H, end: H }, bounds)).toEqual({ start: 0, end: 2 * H });
    expect(clampWindow({ start: 9 * H, end: 11 * H }, bounds)).toEqual({ start: 8 * H, end: 10 * H });
  });

  it('never gets wider than the bounds or narrower than the minimum span', () => {
    expect(clampWindow({ start: -H, end: 20 * H }, bounds)).toEqual(bounds);
    expect(clampWindow({ start: H, end: H + 1000 }, bounds)).toEqual({ start: H, end: H + MIN_SPAN });
  });

  it('allows a window as narrow as the bounds when they are shorter than the minimum span', () => {
    expect(clampWindow({ start: 0, end: 1000 }, { start: 0, end: 60_000 })).toEqual({ start: 0, end: 60_000 });
  });
});

describe('zoomWindow', () => {
  it('keeps the anchor time in place', () => {
    expect(zoomWindow(bounds, bounds, 2, 0.5)).toEqual({ start: 2.5 * H, end: 7.5 * H });
    expect(zoomWindow(bounds, bounds, 2, 0)).toEqual({ start: 0, end: 5 * H });
    expect(zoomWindow(bounds, bounds, 2, 1)).toEqual({ start: 5 * H, end: 10 * H });
  });

  it('zooming out stops at the bounds', () => {
    expect(zoomWindow({ start: 4 * H, end: 6 * H }, bounds, 0.1)).toEqual(bounds);
  });
});

describe('panWindow', () => {
  it('shifts the window and stops at the edges', () => {
    const w = { start: 2 * H, end: 4 * H };
    expect(panWindow(w, bounds, H)).toEqual({ start: 3 * H, end: 5 * H });
    expect(panWindow(w, bounds, -5 * H)).toEqual({ start: 0, end: 2 * H });
    expect(panWindow(w, bounds, 50 * H)).toEqual({ start: 8 * H, end: 10 * H });
  });
});

describe('keepWindow and resolveWindow', () => {
  it('a window showing everything is not kept, so it keeps showing everything as the data grows', () => {
    expect(keepWindow({ start: -H, end: 11 * H }, bounds)).toBeNull();
    expect(resolveWindow(null, { start: 0, end: 12 * H })).toEqual({ start: 0, end: 12 * H });
  });

  it('a window at the newest end follows it', () => {
    const kept = keepWindow({ start: 8 * H, end: 10 * H }, bounds);
    expect(kept).toEqual({ start: 8 * H, end: 10 * H, followEnd: true });
    expect(resolveWindow(kept, { start: 0, end: 11 * H })).toEqual({ start: 9 * H, end: 11 * H });
  });

  it('a window in the past stays where it is', () => {
    const kept = keepWindow({ start: 2 * H, end: 4 * H }, bounds);
    expect(kept?.followEnd).toBe(false);
    expect(resolveWindow(kept, { start: 0, end: 11 * H })).toEqual({ start: 2 * H, end: 4 * H });
  });

  it('a kept window is clamped when the data shrinks, e.g. after filtering', () => {
    const kept = keepWindow({ start: 6 * H, end: 8 * H }, bounds);
    expect(resolveWindow(kept, { start: 0, end: 5 * H })).toEqual({ start: 3 * H, end: 5 * H });
  });
});
