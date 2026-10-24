import { describe, expect, it } from 'vitest';
import {
  anyNodeVisible,
  AUTO_FIT_MIN_K,
  autoFitView,
  clampView,
  fitView,
  isFullyVisible,
  MAX_K,
  MIN_K,
  panToContent,
  toViewBox,
  zoomAt,
  type Size,
  type View,
} from '../../src/lib/graph/view';

const viewport: Size = { w: 1000, h: 500 };

describe('fitView', () => {
  it('never scales small content above 100% and centers it', () => {
    expect(fitView({ w: 400, h: 200 }, viewport)).toEqual({ k: 1, x: 300, y: 150 });
  });

  it('shrinks large content to fit inside the padding', () => {
    const v = fitView({ w: 1904, h: 200 }, viewport);
    expect(v.k).toBeCloseTo(0.5);
    expect(v.x).toBeCloseTo(24);
    expect(isFullyVisible(v, { w: 1904, h: 200 }, viewport)).toBe(true);
  });

  it('respects a minimum scale and anchors overflowing content at the padding', () => {
    const v = fitView({ w: 5000, h: 200 }, viewport, AUTO_FIT_MIN_K);
    expect(v.k).toBe(AUTO_FIT_MIN_K);
    expect(v.x).toBe(24);
  });

  it('clamps to the global zoom range', () => {
    expect(fitView({ w: 1e6, h: 10 }, viewport).k).toBe(MIN_K);
  });
});

describe('autoFitView', () => {
  it('centers the focus node when content overflows', () => {
    const content = { w: 5000, h: 200 };
    const v = autoFitView(content, viewport, { cx: 2500, cy: 100 });
    expect(v.k).toBe(AUTO_FIT_MIN_K);
    expect(v.x + 2500 * v.k).toBeCloseTo(viewport.w / 2);
  });

  it('does not scroll past the ends to center a focus near the start', () => {
    const v = autoFitView({ w: 5000, h: 200 }, viewport, { cx: 10, cy: 100 });
    expect(v.x).toBe(24);
  });

  it('behaves like fitView when everything fits', () => {
    expect(autoFitView({ w: 400, h: 200 }, viewport, { cx: 0, cy: 0 })).toEqual(fitView({ w: 400, h: 200 }, viewport));
  });
});

describe('zoomAt', () => {
  it('keeps the point under the cursor fixed', () => {
    const v: View = { k: 1, x: 100, y: 50 };
    const z = zoomAt(v, 2, 300, 200);
    expect(z.k).toBe(2);
    expect((300 - z.x) / z.k).toBeCloseTo((300 - v.x) / v.k);
    expect((200 - z.y) / z.k).toBeCloseTo((200 - v.y) / v.k);
  });

  it('clamps the scale', () => {
    expect(zoomAt({ k: 1, x: 0, y: 0 }, 100, 0, 0).k).toBe(MAX_K);
    expect(zoomAt({ k: 1, x: 0, y: 0 }, 0, 0, 0).k).toBe(MIN_K);
  });
});

describe('clampView', () => {
  it('keeps at least 60px of content on screen', () => {
    const content = { w: 400, h: 200 };
    expect(clampView({ k: 1, x: -10_000, y: 10_000 }, content, viewport)).toEqual({ k: 1, x: 60 - 400, y: 500 - 60 });
  });

  it('leaves reasonable views alone', () => {
    const v = { k: 1, x: 10, y: 10 };
    expect(clampView(v, { w: 400, h: 200 }, viewport)).toEqual(v);
  });
});

describe('isFullyVisible', () => {
  it('is true only when the scaled content is inside the viewport', () => {
    expect(isFullyVisible({ k: 1, x: 0, y: 0 }, { w: 1000, h: 500 }, viewport)).toBe(true);
    expect(isFullyVisible({ k: 1, x: 1, y: 0 }, { w: 1000, h: 500 }, viewport)).toBe(false);
    expect(isFullyVisible({ k: 0.5, x: 500, y: 0 }, { w: 1000, h: 500 }, viewport)).toBe(true);
  });
});

describe('toViewBox', () => {
  it('maps a view onto an SVG viewBox in content coordinates', () => {
    expect(toViewBox({ k: 2, x: -100, y: 40 }, viewport)).toBe('50 -20 500 250');
  });
});

describe('anyNodeVisible', () => {
  const node = { w: 160, h: 52 };
  const at = (x: number, y: number) => ({ x, y });

  it('detects a node inside the viewport', () => {
    expect(anyNodeVisible({ k: 1, x: 0, y: 0 }, [at(100, 100)], node, viewport)).toBe(true);
  });

  it('counts partially visible nodes', () => {
    // right edge of the node pokes 10px into the viewport from the left
    expect(anyNodeVisible({ k: 1, x: -150, y: 0 }, [at(0, 100)], node, viewport)).toBe(true);
  });

  it('is false when every node is off-screen', () => {
    const nodes = [at(0, 0), at(2000, 0), at(0, 900)];
    expect(anyNodeVisible({ k: 1, x: -170, y: 0 }, nodes, node, viewport)).toBe(false);
  });

  it('applies the zoom level', () => {
    // at 2x the node at x=480 starts at 960 + 0 and reaches past 1000: visible
    expect(anyNodeVisible({ k: 2, x: 0, y: 0 }, [at(480, 10)], node, viewport)).toBe(true);
    expect(anyNodeVisible({ k: 2, x: 0, y: 0 }, [at(500, 10)], node, viewport)).toBe(false);
  });

  it('is false for no nodes', () => {
    expect(anyNodeVisible({ k: 1, x: 0, y: 0 }, [], node, viewport)).toBe(false);
  });
});

describe('panToContent', () => {
  it('never changes the zoom level', () => {
    expect(panToContent({ k: 1.7, x: -9999, y: 9999 }, { w: 5000, h: 200 }, viewport).k).toBe(1.7);
  });

  it('centers content that fits along an axis', () => {
    expect(panToContent({ k: 1, x: -9999, y: -9999 }, { w: 400, h: 200 }, viewport)).toEqual({ k: 1, x: 300, y: 150 });
  });

  it('centers the focus node when content overflows', () => {
    const v = panToContent({ k: 2, x: 0, y: 0 }, { w: 5000, h: 2000 }, viewport, { cx: 2500, cy: 1000 });
    expect(v.x + 2500 * v.k).toBeCloseTo(viewport.w / 2);
    expect(v.y + 1000 * v.k).toBeCloseTo(viewport.h / 2);
  });

  it('starts at the padding without a focus', () => {
    expect(panToContent({ k: 1, x: -9999, y: 0 }, { w: 5000, h: 200 }, viewport)).toMatchObject({ x: 24 });
  });

  it('leaves at least one node visible afterwards', () => {
    const content = { w: 5000, h: 200 };
    const v = panToContent({ k: 1, x: -99999, y: 0 }, content, viewport, { cx: 4900, cy: 100 });
    expect(anyNodeVisible(v, [{ x: 4820, y: 74 }], { w: 160, h: 52 }, viewport)).toBe(true);
  });
});
