// The tasks.json merge driver, with real `git merge`s: the experiments from docs/parallel-agents-design.md §2
// (Evidence), now with the driver registered by `atm migrate`/`atm init`.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { git, makeProject, removeDir, runAtm, tempDir } from './helpers.mjs';

const FILE = '.agentic-task-manager/tasks.json';
const id = (n) => `T-${String(n).padStart(3, '0')}`;
const BASE = {
  meta: { project: 'Merge' },
  tasks: Array.from({ length: 40 }, (_, i) => ({
    id: id(i + 1),
    name: `Task ${i + 1}`,
    phase: Math.floor(i / 10),
    type: 'feature',
    description: `Do thing ${i + 1}.`,
    status: i < 10 ? 'done' : 'todo',
    dependencies: i ? [id(i)] : [],
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
  })),
};

const read = (root) => JSON.parse(fs.readFileSync(path.join(root, FILE), 'utf8'));
const write = (root, data) => fs.writeFileSync(path.join(root, FILE), JSON.stringify(data, null, 2) + '\n');
const find = (data, taskId) => data.tasks.find((t) => t.id === taskId);

/** A repo on `main` with the base task list and the merge driver registered (as any atm skill would leave it). */
function repo() {
  const root = makeProject({ commit: true, files: { [FILE]: BASE } });
  assert.equal(runAtm(['init'], root).code, 0);
  git(['commit', '-q', '-m', 'atm init'], root);
  return root;
}

/** Change tasks.json on a new branch `other` and on `main`, then merge `other` into `main`. */
function mergeBranches(root, onOther, onMain) {
  git(['switch', '-q', '-c', 'other'], root);
  const theirs = read(root);
  onOther(theirs);
  write(root, theirs);
  git(['commit', '-q', '-am', 'other'], root);
  git(['switch', '-q', 'main'], root);
  const ours = read(root);
  onMain(ours);
  write(root, ours);
  git(['commit', '-q', '-am', 'main'], root);
  const r = spawnSync('git', ['merge', '--no-edit', 'other'], { cwd: root, encoding: 'utf8' });
  return { clean: r.status === 0, output: r.stdout + r.stderr, merged: read(root) };
}

function withRepo(fn) {
  const root = repo();
  try {
    fn(root);
  } finally {
    removeDir(root);
  }
}

const progress = (task, status, at, extra = {}) => Object.assign(task, { status, updated_at: at, ...extra });

describe('merge driver (real git merges)', () => {
  test('atm init registers the driver and .gitattributes; it is idempotent', () => {
    withRepo((root) => {
      assert.match(
        git(['config', '--get', 'merge.atm.driver'], root),
        /\/plugin\/scripts\/atm' merge-driver %O %A %B$/,
      );
      assert.equal(
        fs.readFileSync(path.join(root, '.agentic-task-manager/.gitattributes'), 'utf8'),
        "# 'atm' is defined in each clone's git config (merge.atm.driver), registered by the atm plugin on every run.\n# Without it, git merges tasks.json line by line as usual.\ntasks.json merge=atm\n",
      );
      assert.match(runAtm(['init'], root).stdout, /already set/);
    });
  });

  test('status changes to adjacent tasks merge cleanly', () => {
    withRepo((root) => {
      const r = mergeBranches(
        root,
        (d) => progress(find(d, 'T-030'), 'in_progress', '2026-05-01T10:00:00Z'),
        (d) => progress(find(d, 'T-031'), 'in_progress', '2026-05-01T10:01:00Z'),
      );
      assert.ok(r.clean, r.output);
      assert.equal(find(r.merged, 'T-030').status, 'in_progress');
      assert.equal(find(r.merged, 'T-031').status, 'in_progress');
    });
  });

  test('finishing adjacent tasks (new timestamp fields on both sides) merges cleanly', () => {
    withRepo((root) => {
      const r = mergeBranches(
        root,
        (d) => progress(find(d, 'T-011'), 'done', '2026-05-01T11:00:00Z', { started_at: 'a', completed_at: 'b' }),
        (d) => progress(find(d, 'T-012'), 'done', '2026-05-01T11:05:00Z', { started_at: 'c', completed_at: 'd' }),
      );
      assert.ok(r.clean, r.output);
      assert.equal(find(r.merged, 'T-011').completed_at, 'b');
      assert.equal(find(r.merged, 'T-012').completed_at, 'd');
    });
  });

  test('the same task claimed on both branches: clean, in progress, the newer claim’s timestamps', () => {
    withRepo((root) => {
      const r = mergeBranches(
        root,
        (d) =>
          progress(find(d, 'T-020'), 'in_progress', '2026-05-01T10:05:00Z', { started_at: '2026-05-01T10:05:00Z' }),
        (d) =>
          progress(find(d, 'T-020'), 'in_progress', '2026-05-01T10:00:00Z', { started_at: '2026-05-01T10:00:00Z' }),
      );
      assert.ok(r.clean, r.output);
      const t = find(r.merged, 'T-020');
      assert.equal(t.status, 'in_progress');
      assert.equal(t.started_at, '2026-05-01T10:05:00Z');
    });
  });

  test('done beats in progress, whichever side it is on', () => {
    withRepo((root) => {
      const r = mergeBranches(
        root,
        (d) => progress(find(d, 'T-015'), 'done', '2026-05-01T09:00:00Z', { completed_at: '2026-05-01T09:00:00Z' }),
        (d) => progress(find(d, 'T-015'), 'in_progress', '2026-05-01T12:00:00Z'),
      );
      assert.ok(r.clean, r.output);
      assert.equal(find(r.merged, 'T-015').status, 'done');
      assert.equal(find(r.merged, 'T-015').completed_at, '2026-05-01T09:00:00Z');
    });
  });

  test('a definition change on one side and a status change on the other both survive', () => {
    withRepo((root) => {
      const r = mergeBranches(
        root,
        (d) => (find(d, 'T-025').description = 'Clarified.'),
        (d) => progress(find(d, 'T-025'), 'in_progress', '2026-05-01T10:00:00Z'),
      );
      assert.ok(r.clean, r.output);
      assert.equal(find(r.merged, 'T-025').description, 'Clarified.');
      assert.equal(find(r.merged, 'T-025').status, 'in_progress');
    });
  });

  test('both branches add tasks with the same IDs: both kept, theirs renumbered, their dependencies follow', () => {
    withRepo((root) => {
      const add = (d, name, deps = []) =>
        d.tasks.push({ id: id(d.tasks.length + 1), name, status: 'todo', dependencies: deps });
      const r = mergeBranches(
        root,
        (d) => {
          add(d, 'theirs A');
          add(d, 'theirs B', ['T-041']);
        },
        (d) => add(d, 'ours A'),
      );
      assert.ok(r.clean, r.output);
      const tail = r.merged.tasks.slice(40).map((t) => [t.id, t.name, t.dependencies]);
      assert.deepEqual(tail, [
        ['T-041', 'ours A', []],
        ['T-043', 'theirs A', []],
        ['T-042', 'theirs B', ['T-043']],
      ]);
    });
  });

  test('the same task’s description edited differently: the merge stops and says where', () => {
    withRepo((root) => {
      const r = mergeBranches(
        root,
        (d) => (find(d, 'T-033').description = 'Their wording.'),
        (d) => (find(d, 'T-033').description = 'Our wording.'),
      );
      assert.equal(r.clean, false);
      assert.match(r.output, /T-033: both branches changed description/);
      // The file is left valid JSON with our version, for a human to resolve
      assert.equal(find(r.merged, 'T-033').description, 'Our wording.');
      assert.match(git(['status', '--porcelain'], root), /^UU \.agentic-task-manager\/tasks\.json/m);
    });
  });

  test('a task deleted on one side and untouched on the other is deleted', () => {
    withRepo((root) => {
      const r = mergeBranches(
        root,
        (d) => (d.tasks = d.tasks.filter((t) => t.id !== 'T-040')),
        (d) => progress(find(d, 'T-011'), 'in_progress', '2026-05-01T10:00:00Z'),
      );
      assert.ok(r.clean, r.output);
      assert.equal(find(r.merged, 'T-040'), undefined);
    });
  });
});

describe('merge-driver command', () => {
  const files = (base, ours, theirs) => {
    const dir = tempDir();
    const paths = ['base', 'ours', 'theirs'].map((n) => path.join(dir, n));
    [base, ours, theirs].forEach((c, i) => fs.writeFileSync(paths[i], c));
    return { dir, paths };
  };

  test('a side that is not valid JSON is a conflict, and ours is left alone', () => {
    const { dir, paths } = files('{"tasks": []}', '{"tasks": [', '{"tasks": []}');
    try {
      const r = runAtm(['merge-driver', ...paths], dir);
      assert.equal(r.code, 1);
      assert.match(r.stderr, /not valid JSON/);
      assert.equal(fs.readFileSync(paths[1], 'utf8'), '{"tasks": [');
    } finally {
      removeDir(dir);
    }
  });

  test('a file added on both branches (empty base) merges by task', () => {
    const t = (taskId, status) => ({ id: taskId, status, dependencies: [] });
    const { dir, paths } = files(
      '',
      JSON.stringify({ tasks: [t('T-1', 'todo')] }),
      JSON.stringify({ tasks: [t('T-1', 'todo'), t('T-2', 'todo')] }),
    );
    try {
      assert.equal(runAtm(['merge-driver', ...paths], dir).code, 0);
      assert.deepEqual(JSON.parse(fs.readFileSync(paths[1], 'utf8')).tasks, [t('T-1', 'todo'), t('T-2', 'todo')]);
    } finally {
      removeDir(dir);
    }
  });
});
