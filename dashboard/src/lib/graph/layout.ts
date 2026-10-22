import type { Task } from '../types';

export const NODE_W = 160;
export const NODE_H = 52;
const PAD_X = 60;
const PAD_Y = 24;
const START_X = 30;
const START_Y = 20;
export const LABEL_MAX = 22;

export interface GraphNode {
  task: Task;
  x: number;
  y: number;
  cx: number;
  cy: number;
  /** Task name truncated to LABEL_MAX characters */
  label: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  /** SVG path data: a horizontal bezier from the right edge of `from` to the left edge of `to` */
  d: string;
}

export interface GraphLayout {
  width: number;
  height: number;
  /** Topological columns, left to right */
  layers: Task[][];
  /** In input order */
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function truncate(str: string, max: number): string {
  return str.length > max ? str.substring(0, max - 1) + '…' : str;
}

/**
 * Columns by dependency depth. Only dependencies on tasks in `tasks` count, so filtered-out
 * tasks don't hold anything back. A cycle puts all remaining tasks into one final column.
 */
export function topologicalLayers(tasks: Task[]): Task[][] {
  const visible = new Set(tasks.map((t) => t.id));
  const placed = new Set<string>();
  let remaining = [...tasks];
  const layers: Task[][] = [];

  while (remaining.length > 0) {
    let layer = remaining.filter((t) =>
      (t.dependencies ?? []).filter((d) => visible.has(d)).every((d) => placed.has(d)),
    );
    if (layer.length === 0) layer = remaining;
    remaining = remaining.filter((t) => !layer.includes(t));
    for (const t of layer) placed.add(t.id);
    layers.push(layer);
  }
  return layers;
}

export function layoutGraph(tasks: Task[]): GraphLayout {
  if (tasks.length === 0) return { width: 0, height: 0, layers: [], nodes: [], edges: [] };

  const layers = topologicalLayers(tasks);
  const width = layers.length * (NODE_W + PAD_X) + START_X + 20;
  const height = Math.max(...layers.map((l) => l.length)) * (NODE_H + PAD_Y) + START_Y * 2;

  const byId = new Map<string, GraphNode>();
  layers.forEach((layer, li) => {
    const x = START_X + li * (NODE_W + PAD_X);
    const offsetY = (height - (layer.length * (NODE_H + PAD_Y) - PAD_Y)) / 2;
    layer.forEach((task, ti) => {
      const y = offsetY + ti * (NODE_H + PAD_Y);
      byId.set(task.id, { task, x, y, cx: x + NODE_W / 2, cy: y + NODE_H / 2, label: truncate(task.name, LABEL_MAX) });
    });
  });

  const edges: GraphEdge[] = [];
  for (const t of tasks) {
    for (const dep of t.dependencies ?? []) {
      const from = byId.get(dep);
      const to = byId.get(t.id);
      if (!from || !to) continue;
      const x1 = from.x + NODE_W;
      const y1 = from.cy;
      const x2 = to.x;
      const y2 = to.cy;
      const mx = (x1 + x2) / 2;
      edges.push({ from: dep, to: t.id, d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}` });
    }
  }

  return { width, height, layers, nodes: tasks.map((t) => byId.get(t.id)!), edges };
}
