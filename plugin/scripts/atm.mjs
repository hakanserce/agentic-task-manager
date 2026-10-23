// atm: the Agentic Task Manager helper (Node implementation).
//
// Twin of atm.py: both must behave identically (same commands, output, exit codes and files), and are kept in the same
// structure so a change to one maps line by line onto the other. Run through the `atm` launcher. Node built-ins only.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.dirname(SCRIPT_DIR);
const TASK_DIR = '.agentic-task-manager';
const TASKS_FILE = 'tasks.json';
const DASHBOARD_FILE = 'tasks-dashboard.html';
const LEGACY_DIRS = ['docs', '.'];
const TEMPLATE = path.join(PLUGIN_ROOT, 'templates', DASHBOARD_FILE);
// Runtime files in the task folder that must not be committed (the dashboard is a copy of the plugin's template)
const IGNORED = ['tasks-dashboard.html', '.server.json', '.server.log', 'claims.json', '.lock/'];
const VERSION_META = /<meta name="atm-dashboard-version" content="([^"]*)"/;
const RUNTIME = 'node';
const SERVER_RECORD = '.server.json';
const SERVER_LOG = '.server.log';
const DEFAULT_PORT = 8000;
const PORT_TRIES = 100;
const WHOAMI = '/__atm/whoami';
const CONTENT_TYPES = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.log': 'text/plain',
};

const USAGE = `usage: atm <command> [options]

commands:
  version        print the plugin version
  paths [--json] print where this project's task files are
  migrate [--json]
                 move tasks.json from docs/ or the root into .agentic-task-manager/,
                 and set up the folder (.gitignore, current dashboard)
  serve [start|stop|status] [--open] [--port N]
                 run the dashboard server for this project in the background
  help           show this help
`;

class AtmError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

// ---- helpers ----

function out(text = '') {
  process.stdout.write(text + '\n');
}

function toJson(value) {
  return JSON.stringify(value, null, 2);
}

/** Run git; return stdout trimmed, or null if git fails or isn't installed. */
function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim();
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function pluginVersion() {
  return JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version;
}

/** Split args into positionals, set flags and option values. Unknown --options are usage errors. */
function parseOptions(args, flags = [], options = []) {
  const positional = [];
  const values = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (flags.includes(a)) {
      values[a] = true;
    } else if (options.includes(a)) {
      if (i + 1 >= args.length) throw new AtmError(`${a} needs a value`, 2);
      values[a] = args[i + 1];
      i++;
    } else if (a.startsWith('--')) {
      throw new AtmError(`unknown option ${a}`, 2);
    } else {
      positional.push(a);
    }
  }
  return [positional, values];
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z');
}

function parseIso(text) {
  return new Date(text);
}

function formatDuration(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function writeJsonAtomic(p, value) {
  const tmp = `${p}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, toJson(value) + '\n');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, p);
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function rel(root, p) {
  return path.relative(root, p);
}

function isTracked(root, p) {
  return git(['ls-files', '--error-unmatch', '--', rel(root, p)], root) !== null;
}

function inGit(root) {
  return git(['rev-parse', '--git-dir'], root) !== null;
}

function parseVersion(text) {
  return (text || '').split('.').map((part) => {
    const m = /^\d+/.exec(part);
    return m ? Number(m[0]) : 0;
  });
}

/** Compare two parsed versions like Python compares lists: -1, 0 or 1. */
function compareVersions(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return Math.sign(a.length - b.length);
}

function dashboardVersion(p) {
  let text;
  try {
    text = fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
  const m = VERSION_META.exec(text);
  return m ? m[1] : '';
}

/** Copy the plugin's dashboard if the project's is missing or older. Returns [action, old, new]. */
function ensureDashboard(dashboard) {
  const next = dashboardVersion(TEMPLATE);
  const old = dashboardVersion(dashboard);
  if (old !== null && compareVersions(parseVersion(old), parseVersion(next)) >= 0) return ['current', old, next];
  fs.mkdirSync(path.dirname(dashboard), { recursive: true });
  fs.copyFileSync(TEMPLATE, dashboard);
  return [old === null ? 'installed' : 'updated', old, next];
}

/** Add any missing runtime entries to the folder's .gitignore, keeping the user's lines. Returns true if changed. */
function ensureGitignore(taskDir) {
  const p = path.join(taskDir, '.gitignore');
  let text;
  try {
    text = fs.readFileSync(p, 'utf8');
  } catch {
    text = '';
  }
  const lines = text.split(/\r?\n/);
  const missing = IGNORED.filter((entry) => !lines.includes(entry));
  if (missing.length === 0) return false;
  if (!text) text = '# atm runtime files (managed by atm)\n';
  else if (!text.endsWith('\n')) text += '\n';
  fs.writeFileSync(p, text + missing.map((entry) => entry + '\n').join(''));
  return true;
}

/** The git top level; outside git, the nearest directory with a task folder or docs/tasks.json, else cwd. */
function projectRoot(cwd) {
  const top = git(['rev-parse', '--show-toplevel'], cwd);
  if (top) return top;
  let d = cwd;
  for (;;) {
    if (isDir(path.join(d, TASK_DIR)) || isFile(path.join(d, 'docs', TASKS_FILE))) return d;
    const parent = path.dirname(d);
    if (parent === d) return cwd;
    d = parent;
  }
}

function findPaths(cwd) {
  const root = projectRoot(cwd);
  const taskDir = path.join(root, TASK_DIR);
  let legacy = null;
  for (const d of LEGACY_DIRS) {
    const candidate = path.join(root, d, TASKS_FILE);
    if (isFile(candidate)) {
      const dashboard = path.join(path.dirname(candidate), DASHBOARD_FILE);
      legacy = {
        tasks: candidate,
        dashboard: isFile(dashboard) ? dashboard : null,
      };
      break;
    }
  }
  const tasks = path.join(taskDir, TASKS_FILE);
  return {
    root,
    dir: taskDir,
    tasks,
    tasks_exists: isFile(tasks),
    dashboard: path.join(taskDir, DASHBOARD_FILE),
    legacy,
  };
}

// ---- commands ----

function cmdVersion() {
  out(pluginVersion());
}

function cmdPaths(args) {
  const paths = findPaths(process.cwd());
  if (args.includes('--json')) {
    out(toJson(paths));
    return;
  }
  for (const key of ['root', 'dir', 'tasks', 'dashboard']) out(`${key}: ${paths[key]}`);
  if (paths.legacy) out(`legacy: ${paths.legacy.tasks}`);
}

/** Move a legacy tasks.json into the task folder and set the folder up. Never commits. */
function migrate(paths) {
  const { root, dir: taskDir, legacy } = paths;
  const result = {
    moved: null,
    removed_dashboard: null,
    warning: null,
    gitignore_updated: false,
    dashboard: null,
  };
  let legacyVersion = null;
  if (legacy && paths.tasks_exists) {
    result.warning =
      `both ${rel(root, legacy.tasks)} and ${rel(root, paths.tasks)} exist; ` +
      `using ${rel(root, paths.tasks)}. Remove the old file when you no longer need it.`;
  } else if (legacy) {
    fs.mkdirSync(taskDir, { recursive: true });
    const tracked = isTracked(root, legacy.tasks);
    if (tracked) {
      if (git(['mv', '--', rel(root, legacy.tasks), rel(root, paths.tasks)], root) === null)
        throw new AtmError(`git mv ${rel(root, legacy.tasks)} failed`);
    } else {
      fs.renameSync(legacy.tasks, paths.tasks);
    }
    result.moved = {
      from: rel(root, legacy.tasks),
      to: rel(root, paths.tasks),
      git: tracked,
    };
    if (legacy.dashboard) {
      legacyVersion = dashboardVersion(legacy.dashboard);
      if (isTracked(root, legacy.dashboard)) git(['rm', '--cached', '-q', '--', rel(root, legacy.dashboard)], root);
      fs.rmSync(legacy.dashboard);
      result.removed_dashboard = rel(root, legacy.dashboard);
    }
  }
  if (!isFile(paths.tasks)) return result;
  if (ensureGitignore(taskDir)) {
    result.gitignore_updated = true;
    if (inGit(root)) git(['add', '--', rel(root, path.join(taskDir, '.gitignore'))], root);
  }
  let [action, old, next] = ensureDashboard(paths.dashboard);
  if (action === 'installed' && legacyVersion !== null) {
    // Report against the dashboard the project had before the move
    old = legacyVersion;
    action = compareVersions(parseVersion(old), parseVersion(next)) >= 0 ? 'current' : 'updated';
  }
  result.dashboard = { action, from: old, to: next };
  return result;
}

function describeMigration(r, paths) {
  const lines = [];
  if (r.warning) lines.push('warning: ' + r.warning);
  if (r.moved) {
    let line = `Moved ${r.moved.from} to ${r.moved.to}`;
    if (r.moved.git) line += ' (staged with git mv, not committed)';
    if (r.removed_dashboard)
      line += `; removed ${r.removed_dashboard} (a current copy now sits next to tasks.json, ignored by git)`;
    lines.push(line + '.');
  } else if (!isFile(paths.tasks)) {
    lines.push('No tasks.json found. Run /atm:create-tasks to create one.');
  }
  const d = r.dashboard;
  if (d && d.action === 'installed') lines.push(`Dashboard v${d.to} installed.`);
  else if (d && d.action === 'updated') lines.push(`Dashboard updated from v${d.from || '?'} to v${d.to}.`);
  if (lines.length === 0) lines.push('Nothing to migrate.');
  return lines;
}

function cmdMigrate(args) {
  const paths = findPaths(process.cwd());
  const r = migrate(paths);
  if (args.includes('--json')) {
    out(toJson(r));
    return;
  }
  for (const line of describeMigration(r, paths)) out(line);
}

// ---- dashboard server ----

function serverUrl(port) {
  return `http://localhost:${port}/${DASHBOARD_FILE}`;
}

/** Ask the server on this port who it is; null if nothing (or not an atm server) answers. */
function whoami(port) {
  return new Promise((resolve) => {
    const request = http.get({ host: '127.0.0.1', port, path: WHOAMI, timeout: 1000 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => (body += chunk));
      response.on('end', () => {
        try {
          const info = JSON.parse(body);
          resolve(info && typeof info === 'object' && info.atm ? info : null);
        } catch {
          resolve(null);
        }
      });
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(null));
  });
}

/** The record of this folder's running server, or null. A stale record is removed. */
async function liveServer(taskDir) {
  const recordPath = path.join(taskDir, SERVER_RECORD);
  const record = readJson(recordPath);
  if (record === null) return null;
  const info = Number.isInteger(record.port) ? await whoami(record.port) : null;
  if (info && info.folder === taskDir && info.pid === record.pid) return record;
  fs.rmSync(recordPath);
  return null;
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

function openBrowser(url) {
  const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
  const child = spawn(opener, [url], { stdio: 'ignore', detached: true });
  child.on('error', () => out(`Could not open a browser; open ${url} yourself.`));
  child.unref();
}

async function serveStart(paths, values) {
  for (const line of describeMigration(migrate(paths), paths)) if (line !== 'Nothing to migrate.') out(line);
  if (!isFile(paths.tasks)) throw new AtmError('no tasks.json to serve. Run /atm:create-tasks first.');
  const taskDir = paths.dir;
  let record = await liveServer(taskDir);
  if (record) {
    out(`Dashboard server already running: ${serverUrl(record.port)}`);
    return record;
  }
  const port = parseInt(values['--port'] ?? DEFAULT_PORT, 10);
  const log = fs.openSync(path.join(taskDir, SERVER_LOG), 'a');
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '_serve-child', taskDir, String(port)], {
    cwd: taskDir,
    stdio: ['ignore', log, log],
    detached: true,
  });
  fs.closeSync(log);
  let exited = false;
  child.on('exit', () => (exited = true));
  child.unref();
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    record = readJson(path.join(taskDir, SERVER_RECORD));
    if (record && record.pid === child.pid && (await whoami(record.port))) {
      out(`Dashboard server started: ${serverUrl(record.port)}`);
      return record;
    }
    if (exited) break;
    await sleep(50);
  }
  throw new AtmError(`the dashboard server did not start; see ${path.join(taskDir, SERVER_LOG)}`);
}

async function serveStop(paths) {
  const taskDir = paths.dir;
  const recordPath = path.join(taskDir, SERVER_RECORD);
  const record = readJson(recordPath);
  if (record === null) {
    out('Dashboard server is not running.');
    return;
  }
  const info = Number.isInteger(record.port) ? await whoami(record.port) : null;
  if (!(info && info.folder === taskDir && info.pid === record.pid)) {
    fs.rmSync(recordPath);
    out(`Dashboard server is not running (removed a stale record for pid ${record.pid}).`);
    return;
  }
  const pid = record.pid;
  process.kill(pid, 'SIGTERM');
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && pidAlive(pid)) await sleep(50);
  fs.rmSync(recordPath, { force: true });
  out(`Dashboard server stopped (pid ${pid}).`);
}

async function serveStatus(paths, values) {
  const record = await liveServer(paths.dir);
  if (values['--json']) {
    out(toJson({ running: Boolean(record), ...(record || {}), url: record ? serverUrl(record.port) : null }));
    return;
  }
  if (!record) {
    out('Dashboard server is not running.');
    return;
  }
  const up = formatDuration((Date.now() - parseIso(record.started_at).getTime()) / 1000);
  out(`Dashboard server running: ${serverUrl(record.port)} (pid ${record.pid}, ${record.runtime}, up ${up})`);
}

async function cmdServe(args) {
  const [positional, values] = parseOptions(args, ['--open', '--json'], ['--port']);
  const action = positional.length ? positional[0] : 'start';
  const paths = findPaths(process.cwd());
  if (action === 'start') {
    const record = await serveStart(paths, values);
    if (values['--open']) openBrowser(serverUrl(record.port));
  } else if (action === 'stop') {
    await serveStop(paths);
  } else if (action === 'status') {
    await serveStatus(paths, values);
  } else {
    throw new AtmError(`unknown serve action '${action}' (use start, stop or status)`, 2);
  }
}

/** The detached server process: serve taskDir on the first free port from `port`, record it, run until stopped. */
async function cmdServeChild(args) {
  const taskDir = args[0];
  const port = parseInt(args[1], 10);
  const recordPath = path.join(taskDir, SERVER_RECORD);

  const server = http.createServer((req, res) => {
    let p;
    try {
      p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      p = '';
    }
    res.setHeader('Cache-Control', 'no-store');
    if (p === WHOAMI) {
      const body = JSON.stringify({ atm: true, folder: taskDir, pid: process.pid, runtime: RUNTIME });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
      res.end(body);
      return;
    }
    if (p === '/') {
      res.writeHead(302, { Location: '/' + DASHBOARD_FILE });
      res.end();
      return;
    }
    const file = path.join(taskDir, p);
    if (!file.startsWith(taskDir + path.sep) || !isFile(file)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const type = CONTENT_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    fs.createReadStream(file).pipe(res);
  });

  const listen = (candidate) =>
    new Promise((resolve) => {
      const onError = () => resolve(false);
      server.once('error', onError);
      server.listen(candidate, '127.0.0.1', () => {
        server.off('error', onError);
        resolve(true);
      });
    });
  let bound = false;
  for (let candidate = port; candidate < port + PORT_TRIES && !bound; candidate++) bound = await listen(candidate);
  if (!bound) {
    process.stderr.write(`atm: no free port in ${port}-${port + PORT_TRIES - 1}\n`);
    process.exit(1);
  }
  const record = {
    pid: process.pid,
    port: server.address().port,
    folder: taskDir,
    runtime: RUNTIME,
    started_at: nowIso(),
  };
  writeJsonAtomic(recordPath, record);

  const stop = () => {
    if ((readJson(recordPath) || {}).pid === process.pid) fs.rmSync(recordPath, { force: true });
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

function cmdHelp() {
  process.stdout.write(USAGE);
}

const COMMANDS = {
  version: cmdVersion,
  paths: cmdPaths,
  migrate: cmdMigrate,
  serve: cmdServe,
  '_serve-child': cmdServeChild,
  help: cmdHelp,
};

async function main(argv) {
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
    process.stdout.write(USAGE);
    return 0;
  }
  const command = COMMANDS[argv[0]];
  if (!command) {
    process.stderr.write(`atm: unknown command '${argv[0]}'\n` + USAGE);
    return 2;
  }
  try {
    await command(argv.slice(1));
  } catch (e) {
    if (!(e instanceof AtmError)) throw e;
    process.stderr.write(`atm: ${e.message}\n`);
    return e.code;
  }
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
