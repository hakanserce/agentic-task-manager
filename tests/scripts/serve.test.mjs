// `atm serve`: start/status/stop of the detached dashboard server. Ports come from a test range so a
// developer's own server on 8000 is never touched; every test stops what it started.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { makeProject, removeDir, runAtm } from './helpers.mjs';

const TASKS = { meta: { project: 'Serve' }, tasks: [] };
// A different range per run: ports of the previous run can still be in TIME_WAIT, and the server deliberately doesn't
// use SO_REUSEADDR (on macOS it would let it share a port another server is listening on).
let nextPort = 20000 + (process.pid % 400) * 50;
/** A block of ports for one test, so tests never collide even if a stop fails. */
const ports = () => (nextPort += 10) - 10;

const record = (root) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, '.agentic-task-manager/.server.json'), 'utf8'));
  } catch {
    return null;
  }
};
/** Running, and not a zombie (an exited process nobody reaped yet, as happens in containers without an init). */
const alive = (pid) => {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 1).trim()[0] !== 'Z';
  } catch {
    return true; // no /proc (macOS): orphans are reaped right away
  }
};
const portOf = (stdout) => Number(/localhost:(\d+)\//.exec(stdout)?.[1]);

const cleanups = [];
after(() => cleanups.forEach((fn) => fn()));

/** A project with tasks.json in the new folder; stopped (and its server killed) when the tests end. */
function project(files = {}) {
  const root = makeProject({
    git: true,
    files: { '.agentic-task-manager/tasks.json': TASKS, ...files },
  });
  cleanups.push(() => {
    const r = record(root);
    if (r && alive(r.pid)) process.kill(r.pid, 'SIGTERM');
    removeDir(root);
  });
  return root;
}

const atm = (args, cwd) => runAtm(args, cwd);

describe('serve', () => {
  test('start, reuse, status, stop', async () => {
    const root = project();
    const port = ports();
    const started = atm(['serve', '--port', String(port)], root);
    assert.equal(started.code, 0, started.stderr);
    assert.match(started.stdout, new RegExp(`Dashboard server started: http://localhost:${port}/tasks-dashboard.html`));
    // The launching process has exited; the server keeps running and serves the folder
    const r = record(root);
    assert.equal(r.port, port);
    assert.equal(r.folder, path.join(root, '.agentic-task-manager'));
    const dashboard = await fetch(`http://localhost:${port}/tasks-dashboard.html`);
    assert.equal(dashboard.status, 200);
    assert.match(dashboard.headers.get('content-type'), /^text\/html/);
    assert.match(await dashboard.text(), /atm-dashboard-version/);
    assert.deepEqual(await (await fetch(`http://localhost:${port}/tasks.json?ts=1`)).json(), TASKS);

    const again = atm(['serve', 'start', '--port', String(port + 5)], root);
    assert.match(again.stdout, new RegExp(`already running: http://localhost:${port}/`));
    assert.equal(record(root).pid, r.pid);

    assert.match(atm(['serve', 'status'], root).stdout, new RegExp(`running: http://localhost:${port}/.*pid ${r.pid}`));
    const status = JSON.parse(atm(['serve', 'status', '--json'], root).stdout);
    assert.equal(status.running, true);
    assert.equal(status.url, `http://localhost:${port}/tasks-dashboard.html`);

    assert.equal(atm(['serve', 'stop'], root).stdout, `Dashboard server stopped (pid ${r.pid}).\n`);
    assert.equal(alive(r.pid), false);
    assert.equal(record(root), null);
    assert.equal(atm(['serve', 'status'], root).stdout, 'Dashboard server is not running.\n');
    assert.equal(atm(['serve', 'stop'], root).stdout, 'Dashboard server is not running.\n');
  });

  test('tasks.json has an ETag; a poll with it gets 304 until the file changes, even within a second', async () => {
    const root = project();
    const port = ports();
    assert.equal(atm(['serve', '--port', String(port)], root).code, 0);
    const url = `http://localhost:${port}/tasks.json`;
    const first = await fetch(url);
    const etag = first.headers.get('etag');
    assert.match(etag, /^"[0-9a-f]+-[0-9a-f]+"$/);
    const unchanged = await fetch(url, { headers: { 'If-None-Match': etag } });
    assert.equal(unchanged.status, 304);
    assert.equal(unchanged.headers.get('etag'), etag);
    // An atm change right away (same second): a new ETag and the new content
    assert.equal(atm(['add', '--name', 'New', '--phase', '0', '--type', 'feature'], root).code, 0);
    const changed = await fetch(url, { headers: { 'If-None-Match': etag } });
    assert.equal(changed.status, 200);
    assert.notEqual(changed.headers.get('etag'), etag);
    assert.equal((await changed.json()).tasks.length, 1);
    // Not for other files (the dashboard)
    assert.equal((await fetch(`http://localhost:${port}/tasks-dashboard.html`)).headers.get('etag'), null);
    atm(['serve', 'stop'], root);
  });

  test('a busy port moves the server to the next free one', async () => {
    const root = project();
    const port = ports();
    const blocker = net.createServer();
    await new Promise((resolve) => blocker.listen(port, '127.0.0.1', resolve));
    try {
      const started = atm(['serve', '--port', String(port)], root);
      assert.equal(portOf(started.stdout), port + 1, started.stdout + started.stderr);
    } finally {
      blocker.close();
      atm(['serve', 'stop'], root);
    }
  });

  test('a stale record (process gone) is cleaned up, and start works', () => {
    const root = project();
    const port = ports();
    const stale = {
      pid: 999999,
      port,
      folder: path.join(root, '.agentic-task-manager'),
      started_at: 'x',
    };
    fs.writeFileSync(path.join(root, '.agentic-task-manager/.server.json'), JSON.stringify(stale));
    assert.equal(atm(['serve', 'status'], root).stdout, 'Dashboard server is not running.\n');
    assert.equal(record(root), null);
    fs.writeFileSync(path.join(root, '.agentic-task-manager/.server.json'), JSON.stringify(stale));
    assert.match(atm(['serve', '--port', String(port)], root).stdout, /Dashboard server started/);
    assert.notEqual(record(root).pid, 999999);
    atm(['serve', 'stop'], root);
  });

  test('stop never kills a process that is not this project’s server', () => {
    const a = project();
    const b = project();
    const port = ports();
    // An unrelated process
    const sleeper = spawn('sleep', ['30'], { stdio: 'ignore' });
    cleanups.push(() => sleeper.kill());
    const fake = {
      pid: sleeper.pid,
      port,
      folder: path.join(a, '.agentic-task-manager'),
      started_at: 'x',
    };
    fs.writeFileSync(path.join(a, '.agentic-task-manager/.server.json'), JSON.stringify(fake));
    assert.match(atm(['serve', 'stop'], a).stdout, /not running \(removed a stale record for pid \d+\)/);
    assert.equal(alive(sleeper.pid), true);

    // Another project's real server, wrongly recorded as ours
    atm(['serve', '--port', String(port + 1)], b);
    const theirs = record(b);
    fs.writeFileSync(path.join(a, '.agentic-task-manager/.server.json'), JSON.stringify(theirs));
    assert.match(atm(['serve', 'stop'], a).stdout, /removed a stale record/);
    assert.equal(alive(theirs.pid), true);
    atm(['serve', 'stop'], b);
    assert.equal(alive(theirs.pid), false);
  });

  test('keeps serving after the directory it was started from is deleted', async () => {
    const root = project({ 'sub/x.txt': 'x' });
    const port = ports();
    atm(['serve', '--port', String(port)], path.join(root, 'sub'));
    removeDir(path.join(root, 'sub'));
    assert.equal((await fetch(`http://localhost:${port}/tasks.json`)).status, 200);
    atm(['serve', 'stop'], root);
  });

  test('migrates an old docs/tasks.json and installs the dashboard before serving', () => {
    const root = makeProject({
      commit: true,
      files: { 'docs/tasks.json': TASKS },
    });
    cleanups.push(() => removeDir(root));
    const r = atm(['serve', '--port', String(ports())], root);
    assert.match(r.stdout, /Moved docs\/tasks.json to .agentic-task-manager\/tasks.json/);
    assert.match(r.stdout, /Dashboard v[\d.]+ installed/);
    assert.ok(fs.existsSync(path.join(root, '.agentic-task-manager/tasks-dashboard.html')));
    atm(['serve', 'stop'], root);
  });

  test('--dir acts on another project: start, status and stop from elsewhere', async () => {
    const root = project();
    const elsewhere = makeProject({});
    cleanups.push(() => removeDir(elsewhere));
    const port = ports();
    const started = atm(['serve', '--dir', root, '--port', String(port)], elsewhere);
    assert.equal(started.code, 0, started.stderr);
    assert.equal(portOf(started.stdout), port);
    assert.equal(record(root)?.port, port);
    assert.equal(record(elsewhere), null, 'nothing started for the current directory');
    assert.match(atm(['serve', 'status', '--dir', root], elsewhere).stdout, new RegExp(`localhost:${port}/`));
    const stopped = atm(['serve', 'stop', '--dir', root], elsewhere);
    assert.match(stopped.stdout, /Dashboard server stopped/);
    assert.equal(record(root), null);
    assert.equal(atm(['serve', 'status', '--dir', path.join(root, 'nope')], elsewhere).code, 2);
  });

  test('without a task file: an error, nothing started', () => {
    const root = makeProject({ git: true });
    cleanups.push(() => removeDir(root));
    const r = atm(['serve'], root);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /no tasks.json to serve/);
    assert.equal(atm(['serve', 'restart'], root).code, 2);
  });
});
