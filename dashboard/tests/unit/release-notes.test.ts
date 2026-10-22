// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseChangelog } from '../../src/lib/changelog';
import { dashboardVersion, releaseNotes } from '../../src/lib/release-notes';

describe('releaseNotes', () => {
  it('is plugin/CHANGELOG.md, parsed at build time', () => {
    const file = readFileSync(new URL('../../../plugin/CHANGELOG.md', import.meta.url), 'utf8');
    expect(releaseNotes).toEqual(parseChangelog(file));
    expect(releaseNotes.length).toBeGreaterThan(5);
  });
});

describe('dashboardVersion', () => {
  const docWithMeta = (content?: string) =>
    ({ querySelector: () => (content === undefined ? null : { content }) }) as unknown as Document;

  it('reads the version meta tag', () => {
    expect(dashboardVersion(docWithMeta('0.7.0'))).toBe('0.7.0');
  });

  it('is undefined without the tag or with an empty one', () => {
    expect(dashboardVersion(docWithMeta())).toBeUndefined();
    expect(dashboardVersion(docWithMeta(''))).toBeUndefined();
  });
});
