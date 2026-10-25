// atm commit, atm pr and atm merged (docs/v4/atm-cli.md §4.5, data-model.md §4): commit stages exactly the files
// named plus tasks.json, builds the message from meta.workflow, and records the commit on the task.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { git, makeProject, removeDir, runAtm } from './helpers.mjs';

const ENV = { ATM_AGENT: 'alice', ATM_NOW: '2026-05-01T12:00:00Z' };
const TASKS = '.agentic-task-manager/tasks.json';

function project(meta = {}, tasks = [{ id: 'T-001', name: 'Add login', phase: 1, type: 'feature', status: 'done' }]) {
  return makeProject({ commit: true, files: { [TASKS]: { meta, tasks }, 'src/a.txt': 'a\n', 'src/b.txt': 'b\n' } });
}

const read = (root) => JSON.parse(fs.readFileSync(path.join(root, TASKS), 'utf8'));
const write = (root, file, text) => fs.writeFileSync(path.join(root, file), text);
const committedFiles = (root) => git(['show', '--name-only', '--format=', 'HEAD'], root).split('\n').sort();

describe('atm commit', () => {
  test('commits only the named files and tasks.json; other changes, staged or not, stay out', () => {
    const root = project();
    try {
      write(root, 'src/a.txt', 'a2\n');
      write(root, 'src/b.txt', 'b2\n');
      write(root, 'src/new.txt', 'new\n');
      write(root, 'other.txt', 'someone else\n');
      git(['add', 'other.txt'], root); // another agent's staged work
      const tasks = read(root);
      tasks.tasks[0].notes = [{ text: 'changed by atm' }];
      write(root, TASKS, JSON.stringify(tasks, null, 2) + '\n');

      const result = runAtm(['commit', 'T-001', '--file', 'src/a.txt', '--file', 'src/new.txt'], root, ENV);
      assert.equal(result.code, 0, result.stderr);
      const sha = git(['rev-parse', 'HEAD'], root);
      assert.match(result.stdout, new RegExp(`^T-001: committed ${sha.slice(0, 7)} feat\\(T-001\\): Add login\\n`));
      assert.deepEqual(committedFiles(root), [TASKS, 'src/a.txt', 'src/new.txt']);
      assert.equal(git(['log', '-1', '--format=%B'], root), 'feat(T-001): Add login');
      // other.txt is still staged, b.txt still modified
      assert.match(git(['status', '--porcelain'], root), /^A {2}other\.txt$/m);
      assert.match(git(['status', '--porcelain'], root), /^ M src\/b\.txt$/m);
      // The SHA is recorded afterwards, as a change for the next commit
      const task = read(root).tasks[0];
      assert.equal(task.commit, sha);
      assert.equal(task.updated_by, 'alice');
    } finally {
      removeDir(root);
    }
  });

  test('a deleted file can be named; paths are relative to where atm runs', () => {
    const root = project();
    try {
      fs.rmSync(path.join(root, 'src/b.txt'));
      const result = runAtm(['commit', 'T-001', '--file', 'b.txt'], path.join(root, 'src'), ENV);
      assert.equal(result.code, 0, result.stderr);
      assert.deepEqual(committedFiles(root), ['src/b.txt']);
      assert.equal(git(['ls-files', 'src/b.txt'], root), '');
    } finally {
      removeDir(root);
    }
  });

  test('refuses whole-tree pathspecs, directories, paths outside the repository, and a missing --file', () => {
    const root = project();
    try {
      for (const [file, message] of [
        ['.', /would stage the whole tree/],
        ['-A', /would stage the whole tree/],
        [':/', /would stage the whole tree/],
        ['src', /is a directory/],
        ['../elsewhere.txt', /outside the repository/],
      ]) {
        const result = runAtm(['commit', 'T-001', `--file=${file}`], root, ENV);
        assert.equal(result.code, 2, `${file}: ${result.stderr}`);
        assert.match(result.stderr, message);
      }
      const missing = runAtm(['commit', 'T-001'], root, ENV);
      assert.equal(missing.code, 2);
      assert.match(missing.stderr, /--file/);
      const gone = runAtm(['commit', 'T-001', '--file', 'nope.txt'], root, ENV);
      assert.equal(gone.code, 1);
      assert.match(gone.stderr, /no such file/);
      assert.equal(git(['rev-list', '--count', 'HEAD'], root), '1');
    } finally {
      removeDir(root);
    }
  });

  test('the template and the trailer rule shape the message; --message replaces the template', () => {
    const forbid = project({
      workflow: { type: 'direct', commit_template: '{type}: {name} ({id})', trailers: 'forbid' },
    });
    const require = project({
      workflow: { type: 'direct', trailers: { require: ['Signed-off-by: Alice <a@example.com>'] } },
    });
    try {
      write(forbid, 'src/a.txt', 'a2\n');
      const msg = 'fix: {name}\n\nCo-Authored-By: Claude <noreply@anthropic.com>';
      assert.equal(runAtm(['commit', 'T-001', '--file', 'src/a.txt', '--message', msg], forbid, ENV).code, 0);
      assert.equal(git(['log', '-1', '--format=%B'], forbid), 'fix: Add login');
      write(forbid, 'src/a.txt', 'a3\n');
      assert.equal(runAtm(['commit', 'T-001', '--file', 'src/a.txt'], forbid, ENV).code, 0);
      assert.equal(git(['log', '-1', '--format=%B'], forbid), 'feature: Add login (T-001)');

      write(require, 'src/a.txt', 'a2\n');
      const result = runAtm(['commit', 'T-001', '--file', 'src/a.txt', '--json'], require, ENV);
      assert.equal(result.code, 0, result.stderr);
      const expected = 'feat(T-001): Add login\n\nSigned-off-by: Alice <a@example.com>';
      assert.equal(git(['log', '-1', '--format=%B'], require), expected);
      const json = JSON.parse(result.stdout);
      assert.deepEqual(json, {
        task: 'T-001',
        commit: git(['rev-parse', 'HEAD'], require),
        message: expected,
        files: ['src/a.txt', TASKS],
      });
    } finally {
      removeDir(forbid);
      removeDir(require);
    }
  });

  test('nothing to commit is an error from git, and nothing is recorded', () => {
    const root = project();
    try {
      const result = runAtm(['commit', 'T-001', '--file', 'src/a.txt'], root, ENV);
      assert.equal(result.code, 1);
      assert.match(result.stderr, /git commit failed/);
      assert.equal(read(root).tasks[0].commit, undefined);
    } finally {
      removeDir(root);
    }
  });
});
