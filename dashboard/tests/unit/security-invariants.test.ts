// @vitest-environment node
// Static checks for invariants of docs/security-architecture.md that no behaviour test can show (T-234), and a check
// that every test the document names exists, so the table can't drift from the suites.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const filesIn = (dir: string, ext: string): string[] =>
  readdirSync(join(REPO, dir), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? filesIn(join(dir, d.name), ext) : d.name.endsWith(ext) ? [join(dir, d.name)] : [],
  );
const read = (file: string) => readFileSync(join(REPO, file), 'utf8');

describe('security invariants (docs/security-architecture.md)', () => {
  it('I5: atm-cli never runs a shell or evaluates code', () => {
    const modules = filesIn('atm-cli/atm', '.py');
    expect(modules.length).toBeGreaterThan(10);
    const offending = modules.flatMap((file) =>
      read(file)
        .split('\n')
        .map((line, i) => ({ line, at: `${file}:${i + 1}` }))
        .filter(({ line }) => /shell\s*=\s*True|os\.system\(|os\.popen\(|os\.exec\w*\(|\beval\(|\bexec\(/.test(line))
        .map(({ at, line }) => `${at}: ${line.trim()}`),
    );
    expect(offending).toEqual([]);
  });

  it('I15: {@html} only in the built-in icons and the bundled logo, never on data', () => {
    const using = filesIn('dashboard/src', '.svelte').filter((file) => read(file).includes('{@html'));
    expect(using.sort()).toEqual(['dashboard/src/components/Icon.svelte', 'dashboard/src/components/Logo.svelte']);
  });

  it('every test file the invariants table names exists', () => {
    const doc = read('docs/security-architecture.md');
    const rows = doc.split('\n').filter((line) => /^\| I\d+ \|/.test(line));
    expect(rows.length).toBeGreaterThanOrEqual(21);
    // Test files by name, and scenario files by path (a bare `tasks.json` in a row is data, not a test)
    const named = rows.flatMap((row) =>
      [...row.matchAll(/`([\w./-]+\.(?:test|spec)\.(?:ts|mjs)|[\w.-]+\/[\w./-]+\.json)`/g)].map((m) => m[1]),
    );
    expect(named.length).toBeGreaterThan(5);
    const known = [...filesIn('dashboard/tests', ''), ...filesIn('tests/scripts', '')];
    const missing = named.filter(
      (name) => !existsSync(join(REPO, name)) && !known.some((f) => f.endsWith(`/${name}`) || f.endsWith(name)),
    );
    expect(missing).toEqual([]);
  });
});
