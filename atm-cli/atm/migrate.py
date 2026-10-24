"""`atm migrate`: move a legacy tasks.json into the task folder and set the folder up (.gitignore, merge driver,
the current dashboard)."""

import os
import re
import shutil

from .claims import CLAIMS_SNAPSHOT, read_store, write_claims_snapshot
from .core import DASHBOARD_FILE, PLUGIN_ROOT, AtmError, git, in_git, is_tracked, out, parse_version, rel, to_json
from .merge import ensure_merge_driver
from .model import archive_hint, load_tasks
from .paths import find_paths

TEMPLATE = os.path.join(PLUGIN_ROOT, "templates", DASHBOARD_FILE)
# Runtime files in the task folder that must not be committed (the dashboard is a copy of the plugin's template)
IGNORED = ["tasks-dashboard.html", ".server.json", ".server.log", "claims.json", "claims-store.json", ".lock/"]
VERSION_META = re.compile(r'<meta name="atm-dashboard-version" content="([^"]*)"')
BUILD_META = re.compile(r'<meta name="atm-dashboard-build" content="([^"]*)"')
# The tags sit at the top of the page; reading this much finds them without reading the whole (inlined) dashboard
HEAD_BYTES = 16384


def dashboard_head(p):
    """(version, build ID) of a dashboard file, "" for a missing tag; None if there is no file."""
    try:
        with open(p, encoding="utf-8", errors="replace") as f:
            head = f.read(HEAD_BYTES)
    except OSError:
        return None
    version, build = VERSION_META.search(head), BUILD_META.search(head)
    return (version.group(1) if version else "", build.group(1) if build else "")


def dashboard_version(p):
    head = dashboard_head(p)
    return None if head is None else head[0]


def ensure_dashboard(dashboard):
    """Copy the plugin's dashboard if the project's is missing, older, or the same version but another build (a fix
    shipped without a new version number). Returns (action, old, new): action is installed, updated, rebuilt or
    current."""
    new, new_build = dashboard_head(TEMPLATE)
    head = dashboard_head(dashboard)
    old, old_build = head if head is not None else (None, None)
    if old is not None:
        if parse_version(old) > parse_version(new):
            return ("current", old, new)  # a newer dashboard is left alone
        if parse_version(old) == parse_version(new) and (not new_build or old_build == new_build):
            return ("current", old, new)
    os.makedirs(os.path.dirname(dashboard), exist_ok=True)
    shutil.copyfile(TEMPLATE, dashboard)
    if old is None:
        return ("installed", old, new)
    return ("rebuilt" if parse_version(old) == parse_version(new) else "updated", old, new)


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


def migrate(paths):
    """Move a legacy tasks.json into the task folder and set the folder up. Never commits."""
    root, task_dir, legacy = paths["root"], paths["dir"], paths["legacy"]
    result = {
        "moved": None,
        "removed_dashboard": None,
        "warning": None,
        "gitignore_updated": False,
        "merge_driver_updated": False,
        "dashboard": None,
    }
    legacy_version = None
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
            legacy_version = dashboard_version(legacy["dashboard"])
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
    result["merge_driver_updated"] = ensure_merge_driver(paths)
    if not os.path.exists(os.path.join(task_dir, CLAIMS_SNAPSHOT)):
        # So the dashboard finds the file from the start instead of logging a 404 on every refresh
        write_claims_snapshot(paths, read_store(paths)["claims"])
    action, old, new = ensure_dashboard(paths["dashboard"])
    if action == "installed" and legacy_version is not None:
        # Report against the dashboard the project had before the move
        old = legacy_version
        action = "current" if parse_version(old) >= parse_version(new) else "updated"
    result["dashboard"] = {"action": action, "from": old, "to": new}
    try:
        hint = archive_hint(paths, load_tasks(paths))
    except AtmError:
        hint = None  # the command the skill runs next reports the problem
    if hint:
        result["suggest"] = {"archive": hint}
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
    elif d and d["action"] == "rebuilt":
        lines.append(f"Dashboard updated (same version, v{d['to']}, new build).")
    if not lines:
        lines.append("Nothing to migrate.")
    if r.get("suggest"):
        lines.append(r["suggest"]["archive"]["text"])
    return lines


def cmd_migrate(args):
    paths = find_paths(os.getcwd())
    r = migrate(paths)
    if args.json:
        out(to_json(r))
        return
    for line in describe_migration(r, paths):
        out(line)
