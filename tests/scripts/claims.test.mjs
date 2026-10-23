// Claims and leases: who works on which task, shared across the worktrees of a clone, expiring when an agent stops
// renewing its lease. Time is controlled with ATM_NOW.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { git, makeProject, removeDir, runAtm, tempDir } from './helpers.mjs';

const T0 = '2026-05-01T10:00:00Z';
const at = (minutes) => new Date(Date.parse(T0) + minutes * 60_000).toISOString().replace(/\.\d+Z$/, 'Z');
const task = (id, status = 'todo', deps = []) => ({
  id,
  name: id,
  phase: 0,
  type: 'feature',
  status,
  dependencies: deps,
});
const TASKS = { meta: { project: 'Claims' }, tasks: [task('T-001'), task('T-002'), task('T-003', 'todo', ['T-001'])] };

const tasksOf = (root) => JSON.parse(fs.readFileSync(path.join(root, '.agentic-task-manager/tasks.json'), 'utf8'));
const statusOf = (root, id) => tasksOf(root).tasks.find((t) => t.id === id);
const snapshot = (root) => JSON.parse(fs.readFileSync(path.join(root, '.agentic-task-manager/claims.json'), 'utf8'));

/** A committed repo with the task list, so worktrees get their own copy of it. */
function repo(tasks = TASKS) {
  return makeProject({ commit: true, files: { '.agentic-task-manager/tasks.json': tasks } });
}
const as = (agent, minutes = 0) => ({ ATM_AGENT: agent, ATM_NOW: at(minutes) });

describe('claims', () => {
  test('start claims the task: agent, branch, worktree, lease; done drops the claim', () => {
    const root = repo();
    try {
      const r = runAtm(['start', 'T-001', '--json'], root, as('alice'));
      assert.equal(r.code, 0, r.stderr);
      const claim = JSON.parse(r.stdout).claim;
      assert.deepEqual(claim, {
        task: 'T-001',
        agent: 'alice',
        branch: 'main',
        worktree: root,
        claimed_at: T0,
        lease_expires_at: at(30),
      });
      // The claims store is in the git common directory; the task folder gets a snapshot for the dashboard
      const store = JSON.parse(fs.readFileSync(path.join(root, '.git/atm/claims.json'), 'utf8'));
      assert.deepEqual(store.claims['T-001'], claim);
      assert.deepEqual(snapshot(root).claims, [claim]);

      assert.match(runAtm(['claims'], root, as('bob', 5)).stdout, /^T-001 {2}alice {2}main {2}25m left/);
      assert.equal(runAtm(['done', 'T-001'], root, as('alice', 10)).code, 0);
      assert.deepEqual(JSON.parse(runAtm(['claims', '--json'], root, as('bob', 11)).stdout), []);
      assert.deepEqual(snapshot(root).claims, []);
    } finally {
      removeDir(root);
    }
  });

  test("another agent can't finish, release, fail or heartbeat a claimed task", () => {
    const root = repo();
    try {
      runAtm(['start', 'T-001'], root, as('alice'));
      for (const cmd of ['done', 'release', 'fail', 'heartbeat']) {
        const r = runAtm([cmd, 'T-001'], root, as('bob', 1));
        assert.equal(r.code, 4, `${cmd}: ${r.stderr}`);
        assert.match(r.stderr, new RegExp(`can't ${cmd} T-001: it is claimed by alice until ${at(30)}`));
      }
      assert.equal(statusOf(root, 'T-001').status, 'in_progress');
      // --agent on the command line identifies the holder too
      assert.equal(runAtm(['release', 'T-001', '--agent', 'alice'], root, as('bob', 2)).code, 0);
    } finally {
      removeDir(root);
    }
  });

  test('heartbeat extends the lease from now; meta.lease_minutes sets its length', () => {
    const root = repo({ ...TASKS, meta: { project: 'Claims', lease_minutes: 10 } });
    try {
      runAtm(['start', 'T-001'], root, as('alice'));
      const r = runAtm(['heartbeat', 'T-001'], root, as('alice', 8));
      assert.equal(r.stdout, `T-001: lease extended to ${at(18)}\n`);
      assert.equal(runAtm(['heartbeat', 'T-002'], root, as('alice', 8)).code, 4);
    } finally {
      removeDir(root);
    }
  });

  test('an expired lease frees the task: back to todo, with a note on who held it', () => {
    const root = repo();
    try {
      runAtm(['start', 'T-001'], root, as('alice'));
      const r = runAtm(['claims', '--json'], root, as('bob', 31));
      assert.deepEqual(JSON.parse(r.stdout), []);
      const t = statusOf(root, 'T-001');
      assert.equal(t.status, 'todo');
      assert.equal(t.started_at, undefined);
      assert.deepEqual(t.last_failure, { at: at(31), reason: 'lease expired (alice)' });
      // Now bob can take it; alice's late heartbeat is told what happened
      assert.equal(runAtm(['start', 'T-001'], root, as('bob', 32)).code, 0);
      const late = runAtm(['heartbeat', 'T-001'], root, as('alice', 33));
      assert.equal(late.code, 4);
      assert.match(late.stderr, /claimed by bob/);
    } finally {
      removeDir(root);
    }
  });

  test('worktrees of one clone share claims', () => {
    const root = repo();
    const wt = path.join(tempDir(), 'wt2');
    try {
      git(['worktree', 'add', '-q', '-b', 'agent-2', wt], root);
      runAtm(['start', 'T-001'], root, as('alice'));
      // The second worktree has its own tasks.json (T-001 still todo there) but sees alice's claim
      assert.equal(statusOf(wt, 'T-001').status, 'todo');
      const r = runAtm(['start', 'T-001'], wt, as('bob', 1));
      assert.equal(r.code, 4);
      assert.match(r.stderr, /claimed by alice/);
      assert.equal(runAtm(['start', 'T-002'], wt, as('bob', 1)).code, 0);
      const live = JSON.parse(runAtm(['claims', '--json'], root, as('carol', 2)).stdout);
      assert.deepEqual(
        live.map((c) => [c.task, c.agent, c.branch, c.worktree]),
        [
          ['T-001', 'alice', 'main', root],
          ['T-002', 'bob', 'agent-2', wt],
        ],
      );
    } finally {
      removeDir(root);
      removeDir(path.dirname(wt));
    }
  });

  test('outside git, claims are kept in the task folder', () => {
    const root = makeProject({ files: { '.agentic-task-manager/tasks.json': TASKS } });
    try {
      assert.equal(runAtm(['start', 'T-002'], root, as('alice')).code, 0);
      const store = JSON.parse(fs.readFileSync(path.join(root, '.agentic-task-manager/claims-store.json'), 'utf8'));
      assert.equal(store.claims['T-002'].agent, 'alice');
      assert.equal(store.claims['T-002'].branch, null);
      assert.equal(runAtm(['start', 'T-002'], root, as('bob')).code, 4, 'claimed by alice');
    } finally {
      removeDir(root);
    }
  });

  test('the default identity is this Claude Code session, else user@host:worktree', () => {
    const root = repo();
    try {
      const session = JSON.parse(
        runAtm(['start', 'T-001', '--json'], root, { CLAUDE_CODE_SESSION_ID: 'abcdef1234567890' }).stdout,
      );
      assert.equal(session.claim.agent, 'claude:abcdef12');
      const plain = JSON.parse(runAtm(['start', 'T-002', '--json'], root).stdout);
      assert.match(plain.claim.agent, new RegExp(`@.+:${root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    } finally {
      removeDir(root);
    }
  });
});
