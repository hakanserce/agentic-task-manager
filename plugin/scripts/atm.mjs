// atm: the Agentic Task Manager helper (Node implementation).
//
// Twin of atm.py: both must behave identically (same commands, output, exit codes and files), and are kept in the same
// structure so a change to one maps line by line onto the other. Run through the `atm` launcher. Node built-ins only.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
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

const USAGE = `usage: atm <command> [options]

commands:
  version        print the plugin version
  paths [--json] print where this project's task files are
  migrate [--json]
                 move tasks.json from docs/ or the root into .agentic-task-manager/,
                 and set up the folder (.gitignore, current dashboard)
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
  const [action, old, next] = ensureDashboard(paths.dashboard);
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

function cmdHelp() {
  process.stdout.write(USAGE);
}

const COMMANDS = {
  version: cmdVersion,
  paths: cmdPaths,
  migrate: cmdMigrate,
  help: cmdHelp,
};

function main(argv) {
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
    command(argv.slice(1));
  } catch (e) {
    if (!(e instanceof AtmError)) throw e;
    process.stderr.write(`atm: ${e.message}\n`);
    return e.code;
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
