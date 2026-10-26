// Links to a task's commit and pull request, built from the project's repository address (meta.repository, set by
// atm init from origin or with `atm repository set`), never stored per task. GitHub only for now; other hosts show
// plain text, and without an address a click explains how to set one.

/** Where a commit or PR reference goes: a link, plain text (a host we can't build links for), or a hint to set the
 * repository's address */
export type RepoRef = { kind: 'link'; href: string } | { kind: 'plain' } | { kind: 'hint' };

export const REPOSITORY_HINT =
  "Set the repository's address to link commits and pull requests: `atm repository set <url>` (or ask your agent).";

/** The repository's web address from meta, without a trailing slash; null when it isn't set */
export function repositoryOf(meta: { repository?: unknown } | undefined): string | null {
  const url = meta?.repository;
  return typeof url === 'string' && /^https?:\/\//.test(url) ? url.replace(/\/+$/, '') : null;
}

const GITHUB = /^https:\/\/(www\.)?github\.com\/[^/]+\/[^/]+$/;

/** Link builders for a repository address, or null for a host we don't know yet */
export function repoLinks(repository: string): { commit: (sha: string) => string; pull: (n: number) => string } | null {
  if (!GITHUB.test(repository)) return null;
  return {
    commit: (sha) => `${repository}/commit/${encodeURIComponent(sha)}`,
    pull: (n) => `${repository}/pull/${n}`,
  };
}

function refFor(
  meta: { repository?: unknown } | undefined,
  build: (links: NonNullable<ReturnType<typeof repoLinks>>) => string,
): RepoRef {
  const repository = repositoryOf(meta);
  if (!repository) return { kind: 'hint' };
  const links = repoLinks(repository);
  return links ? { kind: 'link', href: build(links) } : { kind: 'plain' };
}

export function commitRef(meta: { repository?: unknown } | undefined, sha: string): RepoRef {
  return refFor(meta, (links) => links.commit(sha));
}

/** A PR's link: the address atm recorded with it (`atm pr --url`), else one built from the repository */
export function pullRef(meta: { repository?: unknown } | undefined, pr: { number: number; url?: string }): RepoRef {
  if (pr.url && /^https?:\/\//.test(pr.url)) return { kind: 'link', href: pr.url };
  return refFor(meta, (links) => links.pull(pr.number));
}
