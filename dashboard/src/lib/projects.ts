// The overview of all projects (docs/multi-project-dashboard-proposal.md 3.5): which projects it shows, and in what
// order. The numbers come from the server's summaries (api/projects), so the browser never loads every task file.
import type { ProjectEntry } from './load';

/** A project without open work counts as active for this long after its last activity */
export const ACTIVE_DAYS = 14;
const DAY_MS = 24 * 3_600_000;

/** Tasks that need the user: in review, or blocked on a question for the user */
export function needsYou(p: ProjectEntry): number {
  return p.summary ? p.summary.needs_you.review + p.summary.needs_you.blocked_on_user : 0;
}

/** Tasks still to do: neither done nor skipped */
export function openTasks(p: ProjectEntry): number {
  return p.summary ? p.summary.total - p.summary.done - p.summary.skipped : 0;
}

function lastActivity(p: ProjectEntry): number {
  const t = Date.parse(p.summary?.last_activity ?? '');
  return Number.isNaN(t) ? -Infinity : t;
}

/**
 * Whether "Active only" shows the project: it has open work, or activity in the last `days` days. A project whose
 * folder is gone stays visible, so it can be removed.
 */
export function isActive(p: ProjectEntry, now: number, days = ACTIVE_DAYS): boolean {
  if (p.missing || !p.summary) return true;
  return openTasks(p) > 0 || lastActivity(p) >= now - days * DAY_MS;
}

/** Projects that need the user first, then the most recently active, then by name; gone ones last. */
export function orderProjects(projects: readonly ProjectEntry[]): ProjectEntry[] {
  return [...projects].sort(
    (a, b) =>
      Number(a.missing) - Number(b.missing) ||
      Number(needsYou(b) > 0) - Number(needsYou(a) > 0) ||
      lastActivity(b) - lastActivity(a) ||
      a.name.localeCompare(b.name),
  );
}
