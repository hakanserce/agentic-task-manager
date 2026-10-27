// @vitest-environment node
// The CI workflow keeps its hardening (docs/security-architecture.md I18, I19; T-230): a read-only token, no stored
// credentials, actions pinned by commit SHA and container images by digest.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const lines = workflow.split('\n');

describe('CI workflow hardening (T-230)', () => {
  it('the token can only read the repository', () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read$/m);
  });

  it('every action is pinned to a full commit SHA, with its version as a comment', () => {
    const uses = lines.filter((line) => /^\s*-?\s*uses:/.test(line));
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) expect(line).toMatch(/uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+/);
  });

  it('every checkout drops its credentials', () => {
    const checkouts = lines.flatMap((line, i) => (/uses: actions\/checkout@/.test(line) ? [i] : []));
    expect(checkouts.length).toBeGreaterThan(0);
    for (const i of checkouts) expect(lines.slice(i + 1, i + 3).join('\n')).toMatch(/persist-credentials: false/);
  });

  it('every container image is pinned by digest', () => {
    const images = lines.filter((line) => /^\s*(container|image):/.test(line) && !line.includes('${{'));
    expect(images.length).toBeGreaterThan(0);
    for (const line of images) expect(line).toMatch(/@sha256:[0-9a-f]{64}\s*$/);
  });
});
