"""atm: the Agentic Task Manager helper (Python implementation).

Twin of atm.mjs: both must behave identically (same commands, output, exit codes and files), and are kept in the same
structure so a change to one maps line by line onto the other. Run through the `atm` launcher. Standard library only.
"""

import json
import os
import re
import shutil
import subprocess
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PLUGIN_ROOT = os.path.dirname(SCRIPT_DIR)
TASK_DIR = ".agentic-task-manager"
TASKS_FILE = "tasks.json"
DASHBOARD_FILE = "tasks-dashboard.html"
LEGACY_DIRS = ["docs", "."]
TEMPLATE = os.path.join(PLUGIN_ROOT, "templates", DASHBOARD_FILE)
# Runtime files in the task folder that must not be committed (the dashboard is a copy of the plugin's template)
IGNORED = ["tasks-dashboard.html", ".server.json", ".server.log", "claims.json", ".lock/"]
VERSION_META = re.compile(r'<meta name="atm-dashboard-version" content="([^"]*)"')

USAGE = """usage: atm <command> [options]

commands:
  version        print the plugin version
  paths [--json] print where this project's task files are
  migrate [--json]
                 move tasks.json from docs/ or the root into .agentic-task-manager/,
                 and set up the folder (.gitignore, current dashboard)
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


def rel(root, p):
    return os.path.relpath(p, root)


def is_tracked(root, p):
    return git(["ls-files", "--error-unmatch", "--", rel(root, p)], root) is not None


def in_git(root):
    return git(["rev-parse", "--git-dir"], root) is not None


def parse_version(text):
    parts = []
    for part in (text or "").split("."):
        m = re.match(r"\d+", part)
        parts.append(int(m.group()) if m else 0)
    return parts


def dashboard_version(p):
    try:
        with open(p, encoding="utf-8") as f:
            m = VERSION_META.search(f.read())
    except OSError:
        return None
    return m.group(1) if m else ""


def ensure_dashboard(dashboard):
    """Copy the plugin's dashboard if the project's is missing or older. Returns (action, old, new)."""
    new = dashboard_version(TEMPLATE)
    old = dashboard_version(dashboard)
    if old is not None and parse_version(old) >= parse_version(new):
        return ("current", old, new)
    os.makedirs(os.path.dirname(dashboard), exist_ok=True)
    shutil.copyfile(TEMPLATE, dashboard)
    return ("installed" if old is None else "updated", old, new)


def ensure_gitignore(task_dir):
    """Add any missing runtime entries to the folder's .gitignore, keeping the user's lines. Returns True if changed."""
    p = os.path.join(task_dir, ".gitignore")
    try:
        with open(p, encoding="utf-8") as f:
            text = f.read()
    except OSError:
        text = ""
    lines = text.splitlines()
    missing = [entry for entry in IGNORED if entry not in lines]
    if not missing:
        return False
    if not text:
        text = "# atm runtime files (managed by atm)\n"
    elif not text.endswith("\n"):
        text += "\n"
    with open(p, "w", encoding="utf-8") as f:
        f.write(text + "".join(entry + "\n" for entry in missing))
    return True


def project_root(cwd):
    """The git top level; outside git, the nearest directory with a task folder or docs/tasks.json, else cwd."""
    top = git(["rev-parse", "--show-toplevel"], cwd)
    if top:
        return top
    d = cwd
    while True:
        if os.path.isdir(os.path.join(d, TASK_DIR)) or os.path.isfile(os.path.join(d, "docs", TASKS_FILE)):
            return d
        parent = os.path.dirname(d)
        if parent == d:
            return cwd
        d = parent


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


def migrate(paths):
    """Move a legacy tasks.json into the task folder and set the folder up. Never commits."""
    root, task_dir, legacy = paths["root"], paths["dir"], paths["legacy"]
    result = {"moved": None, "removed_dashboard": None, "warning": None, "gitignore_updated": False, "dashboard": None}
    if legacy and paths["tasks_exists"]:
        result["warning"] = (
            f"both {rel(root, legacy['tasks'])} and {rel(root, paths['tasks'])} exist; "
            f"using {rel(root, paths['tasks'])}. Remove the old file when you no longer need it."
        )
    elif legacy:
        os.makedirs(task_dir, exist_ok=True)
        tracked = is_tracked(root, legacy["tasks"])
        if tracked:
            if git(["mv", "--", rel(root, legacy["tasks"]), rel(root, paths["tasks"])], root) is None:
                raise AtmError(f"git mv {rel(root, legacy['tasks'])} failed")
        else:
            os.rename(legacy["tasks"], paths["tasks"])
        result["moved"] = {"from": rel(root, legacy["tasks"]), "to": rel(root, paths["tasks"]), "git": tracked}
        if legacy["dashboard"]:
            if is_tracked(root, legacy["dashboard"]):
                git(["rm", "--cached", "-q", "--", rel(root, legacy["dashboard"])], root)
            os.remove(legacy["dashboard"])
            result["removed_dashboard"] = rel(root, legacy["dashboard"])
    if not os.path.isfile(paths["tasks"]):
        return result
    if ensure_gitignore(task_dir):
        result["gitignore_updated"] = True
        if in_git(root):
            git(["add", "--", rel(root, os.path.join(task_dir, ".gitignore"))], root)
    action, old, new = ensure_dashboard(paths["dashboard"])
    result["dashboard"] = {"action": action, "from": old, "to": new}
    return result


def describe_migration(r, paths):
    lines = []
    if r["warning"]:
        lines.append("warning: " + r["warning"])
    if r["moved"]:
        line = f"Moved {r['moved']['from']} to {r['moved']['to']}"
        if r["moved"]["git"]:
            line += " (staged with git mv, not committed)"
        if r["removed_dashboard"]:
            line += f"; removed {r['removed_dashboard']} (a current copy now sits next to tasks.json, ignored by git)"
        lines.append(line + ".")
    elif not os.path.isfile(paths["tasks"]):
        lines.append("No tasks.json found. Run /atm:create-tasks to create one.")
    d = r["dashboard"]
    if d and d["action"] == "installed":
        lines.append(f"Dashboard v{d['to']} installed.")
    elif d and d["action"] == "updated":
        lines.append(f"Dashboard updated from v{d['from'] or '?'} to v{d['to']}.")
    if not lines:
        lines.append("Nothing to migrate.")
    return lines


def cmd_migrate(args):
    paths = find_paths(os.getcwd())
    r = migrate(paths)
    if "--json" in args:
        out(to_json(r))
        return
    for line in describe_migration(r, paths):
        out(line)


def cmd_help(args):
    sys.stdout.write(USAGE)


COMMANDS = {"version": cmd_version, "paths": cmd_paths, "migrate": cmd_migrate, "help": cmd_help}


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
