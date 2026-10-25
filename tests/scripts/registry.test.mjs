// The project registry ($ATM_HOME/projects.json): what scenarios can't express, git worktrees and several processes
// registering at once.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { ATM, baseEnv, git, makeProject, removeDir, runAtm, tempDir } from './helpers.mjs';

const tasks = (id, project) => ({ meta: { id, project }, tasks: [] });
const registry = (home) => JSON.parse(fs.readFileSync(path.join(home, 'projects.json'), 'utf8'));

/** Start `atm args...` without waiting; resolves with its exit code and stderr. */
function startAtm(args, cwd, env) {
  const child = spawn(ATM, args, { cwd, env: { ...baseEnv(), ...env } });
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d));
  return new Promise((resolve) => child.on('exit', (code) => resolve({ code, stderr })));
}

describe('project registry', () => {
  test('a linked git worktree registers its main worktree', () => {
    const root = makeProject({
      files: { '.agentic-task-manager/tasks.json': tasks('abcd1234', 'Demo') },
      commit: true,
    });
    const home = tempDir('atm-home-');
    const linked = path.join(tempDir('atm-wt-'), 'second');
    try {
      git(['worktree', 'add', '-q', '-b', 'second', linked], root);
      const r = runAtm(['projects', 'add', '--json'], linked, { ATM_HOME: home });
      assert.equal(r.code, 0, r.stderr);
      assert.deepEqual(
        registry(home).projects.map((p) => [p.id, p.path]),
        [['abcd1234', root]],
      );
      // Adding the main worktree too doesn't make a second entry
      const again = runAtm(['projects', 'add'], root, { ATM_HOME: home });
      assert.match(again.stdout, /^Already registered: abcd1234/);
      assert.equal(registry(home).projects.length, 1);
    } finally {
      git(['worktree', 'remove', '--force', linked], root);
      removeDir(path.dirname(linked));
      removeDir(home);
      removeDir(root);
    }
  });

  test('projects registering at the same time all end up in one valid file', async () => {
    const home = tempDir('atm-home-');
    const roots = Array.from({ length: 8 }, (_, i) =>
      makeProject({ files: { '.agentic-task-manager/tasks.json': tasks(`0000000${i}`, `P${i}`) } }),
    );
    try {
      const results = await Promise.all(roots.map((root) => startAtm(['projects', 'add'], root, { ATM_HOME: home })));
      for (const r of results) assert.equal(r.code, 0, r.stderr);
      const ids = registry(home)
        .projects.map((p) => p.id)
        .sort();
      assert.deepEqual(
        ids,
        roots.map((_, i) => `0000000${i}`),
      );
      assert.equal(fs.existsSync(path.join(home, '.lock')), false);
    } finally {
      for (const root of roots) removeDir(root);
      removeDir(home);
    }
  });
});
