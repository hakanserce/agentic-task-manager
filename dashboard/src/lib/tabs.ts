// The selected dashboard view lives in the URL hash ("#view=kanban") so it survives reloads and can be shared.
// Other hash parameters are preserved.

export const VIEWS = ['graph', 'kanban', 'progress'] as const;
export type ViewId = (typeof VIEWS)[number];
export const DEFAULT_VIEW: ViewId = 'graph';

export const VIEW_LABELS: Record<ViewId, string> = {
  graph: 'Dependency Graph',
  kanban: 'Kanban',
  progress: 'Progress',
};

function isView(value: string | null): value is ViewId {
  return (VIEWS as readonly string[]).includes(value ?? '');
}

/** The view named in a location hash; anything missing or unknown means the default view. */
export function parseViewHash(hash: string): ViewId {
  const view = new URLSearchParams(hash.replace(/^#/, '')).get('view');
  return isView(view) ? view : DEFAULT_VIEW;
}

/** Whether the hash names a view at all (a link that should win over the saved tab). */
export function hasViewHash(hash: string): boolean {
  return new URLSearchParams(hash.replace(/^#/, '')).has('view');
}

/** `hash` with its view parameter set to `view`, keeping any other parameters. */
export function withViewHash(hash: string, view: ViewId): string {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  params.set('view', view);
  return '#' + params.toString();
}

/** The neighbouring view for arrow-key navigation, wrapping around at the ends. */
export function adjacentView(view: ViewId, step: 1 | -1): ViewId {
  const i = VIEWS.indexOf(view);
  return VIEWS[(i + step + VIEWS.length) % VIEWS.length];
}
