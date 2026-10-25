// `atm serve`: one detached dashboard server per user (ATM_HOME), serving every registered project. Each test has its
// own ATM_HOME, so it has its own server; ports come from a test range so a developer's own server is never touched,
// and every test stops what it started.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { PLUGIN_BUILD, PLUGIN_VERSION, REPO, baseEnv, makeProject, removeDir, runAtm, tempDir } from './helpers.mjs';

const TASKS = { meta: { id: 'abcd1234', project: 'Serve' }, tasks: [] };
// A different range per run: ports of the previous run can still be in TIME_WAIT, and the server deliberately doesn't
// use SO_REUSEADDR (on macOS it would let it share a port another server is listening on).
let nextPort = 20000 + (process.pid % 400) * 50;
/** A block of ports for one test, so tests never collide even if a stop fails. */
const ports = () => (nextPort += 10) - 10;

const record = (home) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(home, 'server.json'), 'utf8'));
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

/** A user folder (ATM_HOME); its server is killed and the folder removed when the tests end. */
function home() {
  const dir = tempDir('atm-home-');
  cleanups.push(() => {
    const r = record(dir);
    if (r && alive(r.pid)) process.kill(r.pid, 'SIGTERM');
    removeDir(dir);
  });
  return dir;
}

/** A project with tasks.json in the new folder, removed when the tests end. */
function project(tasks = TASKS, files = {}) {
  const root = makeProject({ git: true, files: { '.agentic-task-manager/tasks.json': tasks, ...files } });
  cleanups.push(() => removeDir(root));
  return root;
}

const atmIn = (atmHome) => (args, cwd) => runAtm(args, cwd, { ATM_HOME: atmHome });

/** A GET with a chosen Host header (fetch can't set it). */
function rawGet(port, urlPath, host) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, headers: { Host: host } }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('serve', () => {
  test('start, reuse, status, stop', async () => {
    const atmHome = home();
    const atm = atmIn(atmHome);
    const root = project();
    const port = ports();
    const started = atm(['serve', '--port', String(port)], root);
    assert.equal(started.code, 0, started.stderr);
    assert.match(started.stdout, new RegExp(`Dashboard server started: http://localhost:${port}/#project=abcd1234\n`));
    // The launching process has exited; the server keeps running, recorded in ATM_HOME
    const r = record(atmHome);
    assert.equal(r.port, port);
    assert.equal(r.version, PLUGIN_VERSION);
    assert.equal(r.build, PLUGIN_BUILD);
    const dashboard = await fetch(`http://localhost:${port}/`);
    assert.equal(dashboard.status, 200);
    assert.match(dashboard.headers.get('content-type'), /^text\/html/);
    assert.equal(dashboard.headers.get('cache-control'), 'no-store');
    assert.match(await dashboard.text(), /atm-dashboard-version/);
    assert.deepEqual(await (await fetch(`http://localhost:${port}/p/abcd1234/tasks.json?ts=1`)).json(), TASKS);
    assert.deepEqual(await (await fetch(`http://localhost:${port}/__atm/whoami`)).json(), {
      atm: true,
      pid: r.pid,
      port,
      version: PLUGIN_VERSION,
      build: PLUGIN_BUILD,
    });

    const again = atm(['serve', 'start', '--port', String(port + 5)], root);
    assert.match(again.stdout, new RegExp(`already running: http://localhost:${port}/#project=abcd1234`));
    assert.equal(record(atmHome).pid, r.pid);

    const running = atm(['serve', 'status'], root).stdout;
    assert.match(running, new RegExp(`running: http://localhost:${port}/ .*pid ${r.pid}`));
    const status = JSON.parse(atm(['serve', 'status', '--json'], root).stdout);
    assert.equal(status.running, true);
    assert.equal(status.url, `http://localhost:${port}/`);

    assert.equal(atm(['serve', 'stop'], root).stdout, `Dashboard server stopped (pid ${r.pid}).\n`);
    assert.equal(alive(r.pid), false);
    assert.equal(record(atmHome), null);
    assert.equal(atm(['serve', 'status'], root).stdout, 'Dashboard server is not running.\n');
    assert.equal(atm(['serve', 'stop'], root).stdout, 'Dashboard server is not running.\n');
  });

  test('one server for two projects; /api/projects lists them', async () => {
    const atmHome = home();
    const atm = atmIn(atmHome);
    const a = project();
    const b = project({ meta: { id: 'bbbb2222', project: 'Second' }, tasks: [] });
    const port = ports();
    assert.equal(atm(['serve', '--port', String(port)], a).code, 0);
    const second = atm(['serve', '--port', String(port)], b);
    assert.match(second.stdout, new RegExp(`already running: http://localhost:${port}/#project=bbbb2222`));
    const api = await (await fetch(`http://localhost:${port}/api/projects`)).json();
    assert.match(api.generated_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    assert.deepEqual(
      api.projects.map((p) => [p.id, p.name, p.path, p.missing, p.summary.total]),
      [
        ['abcd1234', 'Serve', a, false, 0],
        ['bbbb2222', 'Second', b, false, 0],
      ],
    );
    const secondTasks = await (await fetch(`http://localhost:${port}/p/bbbb2222/tasks.json`)).json();
    assert.equal(secondTasks.meta.project, 'Second');
    atm(['serve', 'stop'], a);
  });

  test('/api/projects summarizes each project by status kind; skipped tasks count as neither done nor open', async () => {
    const atmHome = home();
    const env = { ATM_HOME: atmHome, ATM_NOW: '2026-03-15T12:00:00Z' };
    const atm = (args, cwd) => runAtm(args, cwd, env);
    const task = (id, phase, status, extra = {}) => ({ id, name: id, phase, type: 'feature', status, ...extra });
    const root = project({
      meta: { id: 'abcd1234', project: 'Summary', phases: [{ id: 2, name: 'Two' }] },
      tasks: [
        task('T-1', 1, 'done', { completed_at: '2026-03-15T10:00:00Z' }),
        task('T-2', 1, 'done', { completed_at: '2026-03-13T10:00:00Z' }),
        task('T-3', 1, 'skipped', { updated_at: '2026-03-14T09:00:00Z' }),
        task('T-4', 2, 'done', { completed_at: '2026-02-01T10:00:00Z' }),
        task('T-5', 2, 'in_review', { review_requested_at: '2026-03-15T09:00:00Z' }),
        task('T-6', 2, 'blocked', { waiting_on: 'user', questions: ['?'], blocked_at: '2026-03-15T11:00:00Z' }),
        task('T-7', 3, 'todo'),
      ],
    });
    const skippedOnly = project({ meta: { id: 'eeee5555', project: 'Skipped' }, tasks: [task('T-1', 0, 'skipped')] });
    const gone = project({ meta: { id: 'ffff6666', project: 'Gone' }, tasks: [] });
    const port = ports();
    for (const p of [root, skippedOnly, gone]) assert.equal(atm(['projects', 'add'], p).code, 0);
    removeDir(gone);
    assert.equal(atm(['serve', '--port', String(port)], root).code, 0);
    const url = `http://localhost:${port}/api/projects`;
    const first = await fetch(url);
    const byId = Object.fromEntries((await first.json()).projects.map((p) => [p.id, p]));
    assert.deepEqual(byId.abcd1234.summary, {
      total: 7,
      done: 3,
      skipped: 1,
      percent: 50,
      current_phase: { id: 2, name: 'Two', done: 1, total: 3 },
      agents_working: 0,
      needs_you: { review: 1, blocked_on_user: 1 },
      last_activity: '2026-03-15T11:00:00Z',
      completions_14d: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
    });
    assert.deepEqual(
      [byId.eeee5555.summary.percent, byId.eeee5555.summary.current_phase, byId.eeee5555.summary.last_activity],
      [100, null, null],
    );
    assert.deepEqual([byId.ffff6666.missing, byId.ffff6666.summary], [true, null]);

    // A claim (an agent at work) changes the summary and the ETag
    const etag = first.headers.get('etag');
    assert.equal((await fetch(url, { headers: { 'If-None-Match': etag } })).status, 304);
    assert.equal(atm(['start', 'T-7', '--agent', 'claude:test'], root).code, 0);
    const changed = await fetch(url, { headers: { 'If-None-Match': etag } });
    assert.equal(changed.status, 200);
    const summary = (await changed.json()).projects.find((p) => p.id === 'abcd1234').summary;
    assert.deepEqual([summary.agents_working, summary.last_activity], [1, '2026-03-15T12:00:00Z']);
    atm(['serve', 'stop'], root);
  });

  test('files and /api/projects have ETags; a poll with one gets 304 until something changes', async () => {
    const atmHome = home();
    const atm = atmIn(atmHome);
    const root = project();
    const port = ports();
    assert.equal(atm(['serve', '--port', String(port)], root).code, 0);
    const url = `http://localhost:${port}/p/abcd1234/tasks.json`;
    const first = await fetch(url);
    const etag = first.headers.get('etag');
    assert.match(etag, /^"[0-9a-f]+-[0-9a-f]+"$/);
    const unchanged = await fetch(url, { headers: { 'If-None-Match': etag } });
    assert.equal(unchanged.status, 304);
    assert.equal(unchanged.headers.get('etag'), etag);
    const apiUrl = `http://localhost:${port}/api/projects`;
    const apiEtag = (await fetch(apiUrl)).headers.get('etag');
    assert.equal((await fetch(apiUrl, { headers: { 'If-None-Match': apiEtag } })).status, 304);
    // An atm change right away (same second): new ETags and the new content
    assert.equal(atm(['add', '--name', 'New', '--phase', '0', '--type', 'feature'], root).code, 0);
    const changed = await fetch(url, { headers: { 'If-None-Match': etag } });
    assert.equal(changed.status, 200);
    assert.notEqual(changed.headers.get('etag'), etag);
    assert.equal((await changed.json()).tasks.length, 1);
    assert.equal((await fetch(apiUrl, { headers: { 'If-None-Match': apiEtag } })).status, 200);
    // Not for the dashboard
    assert.equal((await fetch(`http://localhost:${port}/`)).headers.get('etag'), null);
    atm(['serve', 'stop'], root);
  });

  test('only the three task files of registered projects are served; the rest is 404 or 405', async () => {
    const atmHome = home();
    const atm = atmIn(atmHome);
    const root = project(TASKS, { '.agentic-task-manager/secret.json': { secret: true } });
    const port = ports();
    assert.equal(atm(['serve', '--port', String(port)], root).code, 0);
    const get = async (p, init) => {
      const r = await fetch(`http://localhost:${port}${p}`, init);
      return [r.status, (await r.json()).error];
    };
    assert.deepEqual(await get('/p/ffff0000/tasks.json'), [404, 'unknown project']);
    assert.deepEqual(await get('/p/abcd1234/secret.json'), [404, 'not found']);
    assert.deepEqual(await get('/p/abcd1234/tasks-archive.json'), [404, 'not found']); // no archive yet
    assert.equal((await fetch(`http://localhost:${port}/p/abcd1234/claims.json`)).status, 200);
    assert.deepEqual(await get('/p/abcd1234/tasks.json/x'), [404, 'not found']);
    assert.deepEqual(await get('/tasks.json'), [404, 'not found']);
    assert.deepEqual(await get('/tasks-dashboard.html'), [404, 'not found']);
    assert.deepEqual(await get('/p/'), [404, 'not found']);
    assert.deepEqual(await get('/api/projects', { method: 'POST' }), [405, 'only GET and HEAD']);
    atm(['serve', 'stop'], root);
  });

  test('a request for another Host is refused (DNS rebinding)', async () => {
    const atmHome = home();
    const atm = atmIn(atmHome);
    const root = project();
    const port = ports();
    assert.equal(atm(['serve', '--port', String(port)], root).code, 0);
    assert.equal((await rawGet(port, '/', `127.0.0.1:${port}`)).status, 200);
    const refused = await rawGet(port, '/p/abcd1234/tasks.json', `evil.example:${port}`);
    assert.equal(refused.status, 403);
    assert.deepEqual(JSON.parse(refused.body), { error: 'unexpected Host header' });
    assert.equal((await rawGet(port, '/', `localhost:${port + 1}`)).status, 403);
    atm(['serve', 'stop'], root);
  });

  test('a busy port moves the server to the next free one', async () => {
    const atm = atmIn(home());
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
    const atmHome = home();
    const atm = atmIn(atmHome);
    const root = project();
    const port = ports();
    const stale = { pid: 999999, port, version: '0.0.0', build: 'x', started_at: 'x' };
    fs.writeFileSync(path.join(atmHome, 'server.json'), JSON.stringify(stale));
    assert.equal(atm(['serve', 'status'], root).stdout, 'Dashboard server is not running.\n');
    assert.equal(record(atmHome), null);
    fs.writeFileSync(path.join(atmHome, 'server.json'), JSON.stringify(stale));
    assert.match(atm(['serve', '--port', String(port)], root).stdout, /Dashboard server started/);
    assert.notEqual(record(atmHome).pid, 999999);
    atm(['serve', 'stop'], root);
  });

  test('stop never kills a process that is not the recorded server', () => {
    const atmHome = home();
    const atm = atmIn(atmHome);
    const root = project();
    const port = ports();
    const sleeper = spawn('sleep', ['30'], { stdio: 'ignore' });
    cleanups.push(() => sleeper.kill());
    const fake = { pid: sleeper.pid, port, version: '0.0.0', build: 'x', started_at: 'x' };
    fs.writeFileSync(path.join(atmHome, 'server.json'), JSON.stringify(fake));
    assert.match(atm(['serve', 'stop'], root).stdout, /not running \(removed a stale record for pid \d+\)/);
    assert.equal(alive(sleeper.pid), true);

    // Another user's (another ATM_HOME's) real server, wrongly recorded as ours
    const otherHome = home();
    atmIn(otherHome)(['serve', '--port', String(port + 1)], root);
    const theirs = record(otherHome);
    fs.writeFileSync(path.join(atmHome, 'server.json'), JSON.stringify({ ...theirs, pid: sleeper.pid }));
    assert.match(atm(['serve', 'stop'], root).stdout, /removed a stale record/);
    assert.equal(alive(theirs.pid), true);
    atmIn(otherHome)(['serve', 'stop'], root);
    assert.equal(alive(theirs.pid), false);
  });

  test('keeps serving after the directory it was started from is deleted', async () => {
    const atm = atmIn(home());
    const root = project(TASKS, { 'sub/x.txt': 'x' });
    const port = ports();
    atm(['serve', '--port', String(port)], path.join(root, 'sub'));
    removeDir(path.join(root, 'sub'));
    assert.equal((await fetch(`http://localhost:${port}/p/abcd1234/tasks.json`)).status, 200);
    atm(['serve', 'stop'], root);
  });

  test('the dashboard is served from memory: deleting the plugin folder later changes nothing', async () => {
    // A copy of the plugin, so its dashboard file can be deleted (as Claude Code removes old plugin versions)
    const plugin = path.join(tempDir('atm-plugin-'), 'plugin');
    fs.cpSync(path.join(REPO, 'plugin'), plugin, { recursive: true });
    cleanups.push(() => removeDir(path.dirname(plugin)));
    const atmHome = home();
    const root = project();
    const port = ports();
    const run = (args) =>
      spawnSync(path.join(plugin, 'scripts/atm'), args, {
        cwd: root,
        encoding: 'utf8',
        env: { ...baseEnv(), ATM_HOME: atmHome },
      });
    assert.equal(run(['serve', '--port', String(port)]).status, 0);
    fs.rmSync(path.join(plugin, 'templates/tasks-dashboard.html'));
    const page = await fetch(`http://localhost:${port}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /atm-dashboard-version/);
    run(['serve', 'stop']);
  });

  test('migrates an old docs/tasks.json before serving', () => {
    const atm = atmIn(home());
    const root = makeProject({ commit: true, files: { 'docs/tasks.json': TASKS } });
    cleanups.push(() => removeDir(root));
    const r = atm(['serve', '--port', String(ports())], root);
    assert.match(r.stdout, /Moved docs\/tasks.json to .agentic-task-manager\/tasks.json/);
    assert.match(r.stdout, /#project=abcd1234/);
    atm(['serve', 'stop'], root);
  });

  test('--dir shows another project: start, status and stop from elsewhere', async () => {
    const atmHome = home();
    const atm = atmIn(atmHome);
    const root = project();
    const elsewhere = makeProject({});
    cleanups.push(() => removeDir(elsewhere));
    const port = ports();
    const started = atm(['serve', '--dir', root, '--port', String(port)], elsewhere);
    assert.equal(started.code, 0, started.stderr);
    assert.match(started.stdout, new RegExp(`started: http://localhost:${port}/#project=abcd1234`));
    assert.match(atm(['serve', 'status', '--dir', root], elsewhere).stdout, new RegExp(`localhost:${port}/`));
    assert.match(atm(['serve', 'stop', '--dir', root], elsewhere).stdout, /Dashboard server stopped/);
    assert.equal(record(atmHome), null);
    assert.equal(atm(['serve', 'status', '--dir', path.join(root, 'nope')], elsewhere).code, 2);
  });

  test('--all starts the server for the overview, from anywhere', async () => {
    const atm = atmIn(home());
    const elsewhere = makeProject({});
    cleanups.push(() => removeDir(elsewhere));
    const port = ports();
    const started = atm(['serve', '--all', '--port', String(port)], elsewhere);
    assert.equal(started.code, 0, started.stderr);
    assert.equal(started.stdout, `Dashboard server started: http://localhost:${port}/\n`);
    assert.deepEqual((await (await fetch(`http://localhost:${port}/api/projects`)).json()).projects, []);
    atm(['serve', 'stop'], elsewhere);
  });

  test('a project that opted out is not listed; the overview is shown', () => {
    const atm = atmIn(home());
    const root = project({ meta: { id: 'abcd1234', dashboard: { listed: false } }, tasks: [] });
    const port = ports();
    const started = atm(['serve', '--port', String(port)], root);
    assert.match(started.stdout, /isn't listed on the dashboard/);
    assert.match(started.stdout, new RegExp(`started: http://localhost:${port}/\n`));
    atm(['serve', 'stop'], root);
  });

  test('without a task file: an error, nothing started', () => {
    const atmHome = home();
    const atm = atmIn(atmHome);
    const root = makeProject({ git: true });
    cleanups.push(() => removeDir(root));
    const r = atm(['serve'], root);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /no tasks.json to serve/);
    assert.equal(record(atmHome), null);
    assert.equal(atm(['serve', 'restart'], root).code, 2);
  });
});
