// Colors and icons, lifted from the legacy dashboard (v0.4.0).

export interface ColorStyle {
  color: string;
  bg: string;
}

export const TYPE_COLORS: Record<string, ColorStyle> = {
  feature: { color: 'var(--green)', bg: 'rgba(63,185,80,0.15)' },
  bugfix: { color: 'var(--red)', bg: 'rgba(248,81,73,0.15)' },
  bug: { color: 'var(--red)', bg: 'rgba(248,81,73,0.15)' },
  test: { color: 'var(--purple)', bg: 'rgba(188,140,255,0.15)' },
  infra: { color: 'var(--orange)', bg: 'rgba(209,134,22,0.15)' },
  docs: { color: 'var(--cyan)', bg: 'rgba(57,210,192,0.15)' },
  refactor: { color: 'var(--yellow)', bg: 'rgba(210,153,34,0.15)' },
  polish: { color: 'var(--pink)', bg: 'rgba(247,120,186,0.15)' },
};

export const FALLBACK_TYPE: ColorStyle = { color: 'var(--text-muted)', bg: 'rgba(139,148,158,0.15)' };

export const STATUS_COLORS: Record<string, ColorStyle> = {
  todo: { color: 'var(--text-muted)', bg: 'rgba(139,148,158,0.15)' },
  in_progress: { color: 'var(--accent)', bg: 'rgba(88,166,255,0.15)' },
  done: { color: 'var(--green)', bg: 'rgba(63,185,80,0.15)' },
  blocked: { color: 'var(--red)', bg: 'rgba(248,81,73,0.15)' },
  skipped: { color: 'var(--text-muted)', bg: 'rgba(139,148,158,0.1)' },
};

export const PHASE_PALETTE = [
  'var(--green)',
  'var(--accent)',
  'var(--purple)',
  'var(--orange)',
  'var(--pink)',
  'var(--cyan)',
  'var(--yellow)',
  'var(--red)',
];

/** Darker node fills for the dependency graph. */
export const GRAPH_NODE_BG: Record<string, string> = {
  feature: '#1a3324',
  bugfix: '#3d1518',
  bug: '#3d1518',
  test: '#2d1f4e',
  infra: '#3d2a0f',
  docs: '#1a3333',
  refactor: '#33300a',
  polish: '#3d1a2e',
};
export const FALLBACK_GRAPH_NODE_BG = 'var(--surface2)';

export const TYPE_EMOJI: Record<string, string> = {
  test: '\u{1F9EA}',
  bugfix: '\u{1F41B}',
  bug: '\u{1F41B}',
  feature: '\u{2728}',
  infra: '\u{2699}️',
  docs: '\u{1F4DD}',
  refactor: '\u{1F527}',
  polish: '\u{2728}',
};

export const STATUS_EMOJI: Record<string, string> = {
  todo: '\u{26AA}',
  in_progress: '\u{1F535}',
  done: '\u{2705}',
  blocked: '\u{1F534}',
  skipped: '\u{23ED}',
};

export function phaseColor(phase: number): string {
  return PHASE_PALETTE[phase % PHASE_PALETTE.length];
}

export function typeStyle(type: string): ColorStyle {
  return TYPE_COLORS[type] ?? FALLBACK_TYPE;
}

/** Unknown statuses are styled like todo. */
export function statusStyle(status: string): ColorStyle {
  return STATUS_COLORS[status] ?? STATUS_COLORS.todo;
}

export function graphNodeBg(type: string): string {
  return GRAPH_NODE_BG[type] ?? FALLBACK_GRAPH_NODE_BG;
}

/** "in_progress" → "in progress" */
export function statusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}
