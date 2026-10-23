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

const USAGE = `usage: atm <command> [options]

commands:
  version        print the plugin version
  paths [--json] print where this project's task files are
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

function pluginVersion() {
  return JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version;
}

function projectRoot(cwd) {
  return git(['rev-parse', '--show-toplevel'], cwd) || cwd;
}

function findPaths(cwd) {
  const root = projectRoot(cwd);
  const taskDir = path.join(root, TASK_DIR);
  let legacy = null;
  for (const d of LEGACY_DIRS) {
    const candidate = path.join(root, d, TASKS_FILE);
    if (isFile(candidate)) {
      const dashboard = path.join(path.dirname(candidate), DASHBOARD_FILE);
      legacy = { tasks: candidate, dashboard: isFile(dashboard) ? dashboard : null };
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

function cmdHelp() {
  process.stdout.write(USAGE);
}

const COMMANDS = { version: cmdVersion, paths: cmdPaths, help: cmdHelp };

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
