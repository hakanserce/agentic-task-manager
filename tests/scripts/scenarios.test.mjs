// Language-neutral conformance scenarios (scenarios/*.json), each run against every runtime. A scenario is:
// {
//   "name": "...",
//   "setup": { "files": {...}, "git": true, "commit": true, "commands": [[...]] },   see makeProject()
//   "cwd": "docs",                          optional, relative to the project root
//   "args": ["paths", "--json"],
//   "expect": {
//     "exit": 0,
//     "stdout": "exact text", "json": <value parsed from stdout>, "stdoutIncludes": ["..."], "stderrIncludes": ["..."],
//     "files": { "path": "exact text" | <JSON value> | true (exists) | false (absent) },
//     "git": { "staged": ["path", ...] }    `git diff --cached --name-status` lines, e.g. "R docs/a .agentic-task-manager/a"
//   }
// }
// Strings may use {root} (the project's real path) and {version} (the plugin version); setup only {version}.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { PLUGIN_VERSION, REPO, RUNTIMES, fill, git, makeProject, removeDir, runAtm } from './helpers.mjs';

const dir = path.join(REPO, 'tests/scripts/scenarios');
const scenarios = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .flatMap((f) => {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    return (Array.isArray(data) ? data : [data]).map((s) => ({
      ...s,
      file: f,
    }));
  });

function checkFile(root, file, expected) {
  const full = path.join(root, file);
  if (expected === false) return assert.ok(!fs.existsSync(full), `${file} should not exist`);
  assert.ok(fs.existsSync(full), `${file} should exist`);
  if (expected === true) return;
  const text = fs.readFileSync(full, 'utf8');
  if (typeof expected === 'string') assert.equal(text, expected, file);
  else assert.deepEqual(JSON.parse(text), expected, file);
}

for (const runtime of RUNTIMES) {
  describe(`conformance (${runtime})`, () => {
    for (const s of scenarios) {
      test(`${s.file}: ${s.name}`, () => {
        const root = makeProject(fill(s.setup, { root: '{root}', version: PLUGIN_VERSION }), runtime);
        try {
          const vars = { root, version: PLUGIN_VERSION };
          const e = fill(s.expect, vars);
          const r = runAtm(runtime, s.args, path.join(root, s.cwd || '.'));
          const context = `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`;
          assert.equal(r.code, e.exit ?? 0, `exit code\n${context}`);
          if ('stdout' in e) assert.equal(r.stdout, e.stdout, context);
          if ('json' in e) assert.deepEqual(JSON.parse(r.stdout), e.json, context);
          for (const s of e.stdoutIncludes || [])
            assert.ok(r.stdout.includes(s), `stdout should include "${s}"\n${context}`);
          for (const s of e.stderrIncludes || [])
            assert.ok(r.stderr.includes(s), `stderr should include "${s}"\n${context}`);
          for (const [file, expected] of Object.entries(e.files || {})) checkFile(root, file, expected);
          if (e.git?.staged) {
            const staged = git(['diff', '--cached', '--name-status', '-M'], root)
              .split('\n')
              .filter(Boolean)
              .map((l) => l.replace(/^R\d+/, 'R').replace(/\t/g, ' '))
              .sort();
            assert.deepEqual(staged, [...e.git.staged].sort());
          }
        } finally {
          removeDir(root);
        }
      });
    }
  });
}
