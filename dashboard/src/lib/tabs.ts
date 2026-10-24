// The selected dashboard view lives in the URL hash ("#view=kanban") so it survives reloads and can be shared.
// Other hash parameters are preserved.
import { formatHash, hashParams } from './hash';

export const VIEWS = ['graph', 'kanban', 'list', 'agents', 'progress'] as const;
export type ViewId = (typeof VIEWS)[number];
export const DEFAULT_VIEW: ViewId = 'graph';

export const VIEW_LABELS: Record<ViewId, string> = {
  graph: 'Dependency Graph',
  kanban: 'Kanban Board',
  list: 'Task List',
  agents: 'Agents',
  progress: 'Progress',
};

export const VIEW_ICONS = {
  graph: 'network',
  kanban: 'square-kanban',
  list: 'list-todo',
  agents: 'bot',
  progress: 'trending-up',
} as const satisfies Record<ViewId, string>;

function isView(value: string | null): value is ViewId {
  return (VIEWS as readonly string[]).includes(value ?? '');
}

/** The view named in a location hash; anything missing or unknown means the default view. */
export function parseViewHash(hash: string): ViewId {
  const view = hashParams(hash).get('view');
  return isView(view) ? view : DEFAULT_VIEW;
}

/** Whether the hash names a view at all (a link that should win over the saved tab). */
export function hasViewHash(hash: string): boolean {
  return hashParams(hash).has('view');
}

/** `hash` with its view parameter set to `view`, keeping any other parameters. */
export function withViewHash(hash: string, view: ViewId): string {
  const params = hashParams(hash);
  params.set('view', view);
  return formatHash(params);
}

/** The neighbouring view for arrow-key navigation, wrapping around at the ends. */
export function adjacentView(view: ViewId, step: 1 | -1): ViewId {
  const i = VIEWS.indexOf(view);
  return VIEWS[(i + step + VIEWS.length) % VIEWS.length];
}
