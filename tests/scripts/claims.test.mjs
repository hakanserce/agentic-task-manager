// Claims and leases: who works on which task, shared across the worktrees of a clone, expiring when an agent stops
// renewing its lease. Time is controlled with ATM_NOW.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { ATM, baseEnv, git, makeProject, removeDir, runAtm, tempDir } from './helpers.mjs';

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

  test('heartbeat --auto renews only claims last renewed ten minutes ago, silently, without touching tasks.json', () => {
    const root = repo();
    const store = () => JSON.parse(fs.readFileSync(path.join(root, '.git/atm/claims.json'), 'utf8'));
    try {
      runAtm(['start', 'T-001'], root, as('alice'));
      runAtm(['start', 'T-002'], root, as('bob'));
      const before = fs.readFileSync(path.join(root, '.agentic-task-manager/tasks.json'), 'utf8');
      const storeMtime = fs.statSync(path.join(root, '.git/atm/claims.json')).mtimeMs;

      // Fresh: nothing is written
      const fresh = runAtm(['heartbeat', '--auto'], root, as('alice', 9));
      assert.deepEqual([fresh.code, fresh.stdout, fresh.stderr], [0, '', '']);
      assert.equal(fs.statSync(path.join(root, '.git/atm/claims.json')).mtimeMs, storeMtime);

      // Ten minutes after the claim: alice's lease is renewed, bob's is left alone
      const due = runAtm(['heartbeat', '--auto'], root, as('alice', 10));
      assert.deepEqual([due.code, due.stdout, due.stderr], [0, '', '']);
      assert.equal(store().claims['T-001'].lease_expires_at, at(40));
      assert.equal(store().claims['T-001'].renewed_at, at(10));
      assert.equal(store().claims['T-002'].lease_expires_at, at(30));
      // The next renewal counts from the last one
      runAtm(['heartbeat', '--auto'], root, as('alice', 15));
      assert.equal(store().claims['T-001'].lease_expires_at, at(40));
      assert.equal(fs.readFileSync(path.join(root, '.agentic-task-manager/tasks.json'), 'utf8'), before);
    } finally {
      removeDir(root);
    }
  });

  test('heartbeat --auto as a hook: the session and cwd come from stdin; it never fails', () => {
    const root = repo();
    const elsewhere = tempDir();
    try {
      runAtm(['start', 'T-001'], root, { CLAUDE_CODE_SESSION_ID: 'abcdef1234', ATM_NOW: T0 });
      const hook = (input, cwd = elsewhere) =>
        spawnSync(ATM, ['heartbeat', '--auto'], {
          cwd,
          input,
          encoding: 'utf8',
          env: { ...baseEnv(), ATM_NOW: at(12) },
        });
      const r = hook(JSON.stringify({ session_id: 'abcdef1234-rest', cwd: root, hook_event_name: 'PostToolUse' }));
      assert.deepEqual([r.status, r.stdout, r.stderr], [0, '', '']);
      const store = JSON.parse(fs.readFileSync(path.join(root, '.git/atm/claims.json'), 'utf8'));
      assert.equal(store.claims['T-001'].lease_expires_at, at(42));
      // Outside a project, with garbage on stdin: still exit 0, nothing printed
      for (const input of ['not json', '']) {
        const quiet = hook(input);
        assert.deepEqual([quiet.status, quiet.stdout, quiet.stderr], [0, '', '']);
      }
      assert.equal(runAtm(['heartbeat'], root, as('alice')).code, 2);
    } finally {
      removeDir(root);
      removeDir(elsewhere);
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
      assert.equal(t.started_by, undefined);
      assert.deepEqual(t.notes, [{ at: at(31), kind: 'failure', text: 'lease expired (alice)' }]);
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

  test('a task done in one worktree is not handed out again in another before the branches merge', () => {
    const root = repo();
    const wt = path.join(tempDir(), 'wt2');
    try {
      git(['worktree', 'add', '-q', '-b', 'agent-2', wt], root);
      runAtm(['start', 'T-001'], root, as('alice'));
      runAtm(['done', 'T-001'], root, as('alice', 5));
      // In the other worktree T-001 is still todo, and unclaimed, but it is done
      assert.equal(statusOf(wt, 'T-001').status, 'todo');
      const next = JSON.parse(runAtm(['next', '--json'], wt, as('bob', 6)).stdout);
      assert.equal(next.task.id, 'T-002');
      // T-003 depends on T-001, which isn't done in this worktree's file yet, so nothing else is available
      runAtm(['next', '--claim'], wt, as('bob', 6));
      const none = runAtm(['next'], wt, as('bob', 7));
      assert.equal(none.code, 3);
      assert.match(none.stdout, /done in another worktree, not merged yet: T-001/);
      // Starting it explicitly is still possible (deliberate rework)
      assert.equal(runAtm(['start', 'T-001'], wt, as('bob', 8)).code, 0);
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

  test('the default identity is this Claude Code session, else the git user, else user@host', () => {
    const root = repo();
    const outside = makeProject({ files: { '.agentic-task-manager/tasks.json': TASKS } });
    try {
      const session = JSON.parse(
        runAtm(['start', 'T-001', '--json'], root, { CLAUDE_CODE_SESSION_ID: 'abcdef1234567890' }).stdout,
      );
      assert.equal(session.claim.agent, 'claude:abcdef12');
      assert.equal(session.started_by, 'claude:abcdef12');
      // A person in a terminal: their git name (the test repository's is "atm test")
      const person = JSON.parse(runAtm(['start', 'T-002', '--json'], root).stdout);
      assert.equal(person.claim.agent, 'atm test');
      assert.equal(person.started_by, 'atm test');
      // Outside git (and with no global git name in the test environment's HOME), user@host
      const env = { HOME: outside, GIT_CONFIG_NOSYSTEM: '1', XDG_CONFIG_HOME: outside };
      const plain = JSON.parse(runAtm(['start', 'T-002', '--json'], outside, env).stdout);
      assert.match(plain.claim.agent, /^[^@:]+@[^:]+$/);
    } finally {
      removeDir(root);
      removeDir(outside);
    }
  });
});
