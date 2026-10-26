import { describe, expect, it } from 'vitest';
import { commitRef, pullRef, repoLinks, repositoryOf } from '../../src/lib/repo';

const github = { repository: 'https://github.com/acme/demo' };

describe('repositoryOf', () => {
  it('an http(s) address, without a trailing slash; anything else is no address', () => {
    expect(repositoryOf({ repository: 'https://github.com/acme/demo/' })).toBe('https://github.com/acme/demo');
    expect(repositoryOf({ repository: 'git@github.com:acme/demo.git' })).toBeNull();
    expect(repositoryOf({ repository: 42 })).toBeNull();
    expect(repositoryOf(undefined)).toBeNull();
  });
});

describe('repoLinks', () => {
  it('GitHub: commits and pull requests', () => {
    const links = repoLinks('https://github.com/acme/demo')!;
    expect(links.commit('abc123')).toBe('https://github.com/acme/demo/commit/abc123');
    expect(links.pull(12)).toBe('https://github.com/acme/demo/pull/12');
  });

  it('other hosts get no links (yet)', () => {
    expect(repoLinks('https://gitlab.com/acme/demo')).toBeNull();
    expect(repoLinks('https://github.com/acme')).toBeNull();
  });
});

describe('commitRef and pullRef', () => {
  it('a link with a GitHub address, plain text with another host, a hint without an address', () => {
    expect(commitRef(github, 'abc')).toEqual({ kind: 'link', href: 'https://github.com/acme/demo/commit/abc' });
    expect(commitRef({ repository: 'https://gitlab.com/acme/demo' }, 'abc')).toEqual({ kind: 'plain' });
    expect(commitRef(undefined, 'abc')).toEqual({ kind: 'hint' });
  });

  it('a PR links to the address atm recorded with it, else one built from the repository', () => {
    expect(pullRef(undefined, { number: 5, url: 'https://github.com/acme/demo/pull/5' })).toEqual({
      kind: 'link',
      href: 'https://github.com/acme/demo/pull/5',
    });
    expect(pullRef(github, { number: 7 })).toEqual({ kind: 'link', href: 'https://github.com/acme/demo/pull/7' });
    expect(pullRef(undefined, { number: 7 })).toEqual({ kind: 'hint' });
  });
});
