// Pan/zoom math for the dependency graph. A view maps content coordinates to screen pixels:
// screen = content * k + (x, y).

export interface View {
  k: number;
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export const MIN_K = 0.1;
export const MAX_K = 2.5;
/** Auto-fit never shrinks below this; the user pans instead (or presses "fit"). */
export const AUTO_FIT_MIN_K = 0.6;
export const PAD = 24;
/** Pan limit: at least this much of the graph stays on screen. */
export const KEEP_VISIBLE = 60;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Scale to fit inside the padding (never above 100%, optionally not below minK); center whatever fits. */
export function fitView(content: Size, viewport: Size, minK?: number): View {
  let k = Math.min((viewport.w - PAD * 2) / content.w, (viewport.h - PAD * 2) / content.h, 1);
  if (minK !== undefined) k = Math.max(k, minK);
  k = clamp(k, MIN_K, MAX_K);
  const cw = content.w * k;
  const ch = content.h * k;
  return {
    k,
    x: cw <= viewport.w ? (viewport.w - cw) / 2 : PAD,
    y: ch <= viewport.h ? (viewport.h - ch) / 2 : PAD,
  };
}

/** The initial view: readable scale, centered on `focus` along any axis that overflows. */
export function autoFitView(content: Size, viewport: Size, focus?: { cx: number; cy: number }): View {
  const v = fitView(content, viewport, AUTO_FIT_MIN_K);
  if (!focus) return v;
  const cw = content.w * v.k;
  const ch = content.h * v.k;
  return {
    k: v.k,
    x: cw > viewport.w ? clamp(viewport.w / 2 - focus.cx * v.k, viewport.w - cw - PAD, PAD) : v.x,
    y: ch > viewport.h ? clamp(viewport.h / 2 - focus.cy * v.k, viewport.h - ch - PAD, PAD) : v.y,
  };
}

/** Zoom to `k` keeping the screen point (px, py) over the same content point. */
export function zoomAt(v: View, k: number, px: number, py: number): View {
  const nk = clamp(k, MIN_K, MAX_K);
  return { k: nk, x: px - (px - v.x) * (nk / v.k), y: py - (py - v.y) * (nk / v.k) };
}

export function clampView(v: View, content: Size, viewport: Size): View {
  const cw = content.w * v.k;
  const ch = content.h * v.k;
  return {
    k: v.k,
    x: clamp(v.x, KEEP_VISIBLE - cw, viewport.w - KEEP_VISIBLE),
    y: clamp(v.y, KEEP_VISIBLE - ch, viewport.h - KEEP_VISIBLE),
  };
}

export function isFullyVisible(v: View, content: Size, viewport: Size): boolean {
  return v.x >= 0 && v.y >= 0 && v.x + content.w * v.k <= viewport.w && v.y + content.h * v.k <= viewport.h;
}

/** The SVG viewBox (in content coordinates) that shows `v` in a viewport of this size. */
export function toViewBox(v: View, viewport: Size): string {
  return `${-v.x / v.k} ${-v.y / v.k} ${viewport.w / v.k} ${viewport.h / v.k}`;
}

/** True if at least one node rectangle (content coordinates, top-left x/y) overlaps the viewport. */
export function anyNodeVisible(v: View, nodes: { x: number; y: number }[], nodeSize: Size, viewport: Size): boolean {
  return nodes.some((n) => {
    const left = n.x * v.k + v.x;
    const top = n.y * v.k + v.y;
    return left < viewport.w && left + nodeSize.w * v.k > 0 && top < viewport.h && top + nodeSize.h * v.k > 0;
  });
}

/**
 * Bring the content into view without changing the zoom level: along each axis, center the content if it fits,
 * otherwise center the focus node (clamped like autoFitView), or put the content's start at the padding.
 */
export function panToContent(v: View, content: Size, viewport: Size, focus?: { cx: number; cy: number }): View {
  const axis = (size: number, view: number, center: number | undefined) => {
    const scaled = size * v.k;
    if (scaled <= view) return (view - scaled) / 2;
    if (center === undefined) return PAD;
    return clamp(view / 2 - center * v.k, view - scaled - PAD, PAD);
  };
  return { k: v.k, x: axis(content.w, viewport.w, focus?.cx), y: axis(content.h, viewport.h, focus?.cy) };
}
