// Which page the dashboard shows: a project ("#project=<id>"), the overview of all projects ("#overview"), or, with
// neither in the URL, the landing page's choice (docs/multi-project-dashboard-proposal.md 3.5). Other hash
// parameters (the view, a dialog) are kept.
import { formatHash, hashParams } from './hash';
import type { ProjectEntry } from './load';

export type Route =
  | { page: 'project'; id: string }
  | { page: 'overview' }
  /** No project is registered (or none of them is there): how to add one */
  | { page: 'none' }
  /** The URL names a project the server doesn't list, or one whose folder is gone */
  | { page: 'unknown'; id: string };

/** The project named in a location hash, if any. */
export function parseProjectHash(hash: string): string | null {
  return hashParams(hash).get('project') || null;
}

/** Whether the hash asks for the overview. */
export function hasOverviewHash(hash: string): boolean {
  return hashParams(hash).has('overview');
}

/** `hash` showing project `id`, or the overview for null; the view and other parameters are kept. */
export function withProjectHash(hash: string, id: string | null): string {
  const params = hashParams(hash);
  params.delete('project');
  params.delete('overview');
  if (id === null) params.set('overview', '');
  else params.set('project', id);
  return formatHash(params);
}

/**
 * The page for a hash. A named project is shown if the server lists it and its files are there; #overview is the
 * overview. Without either, the landing page: the overview with two or more projects, the project itself with one,
 * and how to add a project with none.
 */
export function routeFor(projects: readonly ProjectEntry[], hash: string): Route {
  const present = projects.filter((p) => !p.missing);
  const named = parseProjectHash(hash);
  if (named !== null) {
    return present.some((p) => p.id === named) ? { page: 'project', id: named } : { page: 'unknown', id: named };
  }
  if (hasOverviewHash(hash)) return { page: 'overview' };
  if (present.length === 0) return { page: 'none' };
  if (present.length === 1) return { page: 'project', id: present[0].id };
  return { page: 'overview' };
}
