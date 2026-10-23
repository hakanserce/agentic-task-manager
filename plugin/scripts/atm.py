"""atm: the Agentic Task Manager helper (Python implementation).

Twin of atm.mjs: both must behave identically (same commands, output, exit codes and files), and are kept in the same
structure so a change to one maps line by line onto the other. Run through the `atm` launcher. Standard library only.
"""

import json
import os
import subprocess
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PLUGIN_ROOT = os.path.dirname(SCRIPT_DIR)
TASK_DIR = ".agentic-task-manager"
TASKS_FILE = "tasks.json"
DASHBOARD_FILE = "tasks-dashboard.html"
LEGACY_DIRS = ["docs", "."]

USAGE = """usage: atm <command> [options]

commands:
  version        print the plugin version
  paths [--json] print where this project's task files are
  help           show this help
"""


class AtmError(Exception):
    def __init__(self, message, code=1):
        super().__init__(message)
        self.code = code


# ---- helpers ----


def out(text=""):
    sys.stdout.write(text + "\n")


def to_json(value):
    return json.dumps(value, indent=2, ensure_ascii=False)


def git(args, cwd):
    """Run git; return stdout stripped, or None if git fails or isn't installed."""
    try:
        result = subprocess.run(["git"] + args, cwd=cwd, capture_output=True, text=True)
    except OSError:
        return None
    return result.stdout.strip() if result.returncode == 0 else None


def plugin_version():
    with open(os.path.join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), encoding="utf-8") as f:
        return json.load(f)["version"]


def project_root(cwd):
    return git(["rev-parse", "--show-toplevel"], cwd) or cwd


def find_paths(cwd):
    root = project_root(cwd)
    task_dir = os.path.join(root, TASK_DIR)
    legacy = None
    for d in LEGACY_DIRS:
        candidate = os.path.normpath(os.path.join(root, d, TASKS_FILE))
        if os.path.isfile(candidate):
            dashboard = os.path.join(os.path.dirname(candidate), DASHBOARD_FILE)
            legacy = {"tasks": candidate, "dashboard": dashboard if os.path.isfile(dashboard) else None}
            break
    tasks = os.path.join(task_dir, TASKS_FILE)
    return {
        "root": root,
        "dir": task_dir,
        "tasks": tasks,
        "tasks_exists": os.path.isfile(tasks),
        "dashboard": os.path.join(task_dir, DASHBOARD_FILE),
        "legacy": legacy,
    }


# ---- commands ----


def cmd_version(args):
    out(plugin_version())


def cmd_paths(args):
    paths = find_paths(os.getcwd())
    if "--json" in args:
        out(to_json(paths))
        return
    for key in ["root", "dir", "tasks", "dashboard"]:
        out(f"{key}: {paths[key]}")
    if paths["legacy"]:
        out(f"legacy: {paths['legacy']['tasks']}")


def cmd_help(args):
    sys.stdout.write(USAGE)


COMMANDS = {"version": cmd_version, "paths": cmd_paths, "help": cmd_help}


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        sys.stdout.write(USAGE)
        return 0
    command = COMMANDS.get(argv[0])
    if not command:
        sys.stderr.write(f"atm: unknown command '{argv[0]}'\n" + USAGE)
        return 2
    try:
        command(argv[1:])
    except AtmError as e:
        sys.stderr.write(f"atm: {e}\n")
        return e.code
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
