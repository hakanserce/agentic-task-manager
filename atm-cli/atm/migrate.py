"""`atm migrate`: move a legacy tasks.json into the task folder and set the folder up (.gitignore, merge driver), and
clean up after per-project dashboards (0.10.0-0.14.0): the dashboard now comes from the plugin, served by
`atm serve` for all projects."""

import os
import re
import signal

from .claims import CLAIMS_SNAPSHOT, read_store, write_claims_snapshot
from .core import (
    DASHBOARD_FILE,
    PLUGIN_ROOT,
    AtmError,
    git,
    in_git,
    is_tracked,
    out,
    read_json,
    rel,
    to_json,
    whoami,
    write_json_atomic,
)
from .lock import locked
from .merge import ensure_merge_driver
from .model import archive_hint, archive_path, kind_of, load_archive, load_tasks, vocabulary
from .paths import find_paths
from .registry import register

TEMPLATE = os.path.join(PLUGIN_ROOT, "templates", DASHBOARD_FILE)
# Runtime files in the task folder that must not be committed (the dashboard and server files are from before
# 0.15.0; they stay listed so leftovers stay out of git)
IGNORED = ["tasks-dashboard.html", ".server.json", ".server.log", "claims.json", "claims-store.json", ".lock/"]
OLD_SERVER_RECORD = ".server.json"
OLD_SERVER_LOG = ".server.log"
VERSION_META = re.compile(r'<meta name="atm-dashboard-version" content="([^"]*)"')
BUILD_META = re.compile(r'<meta name="atm-dashboard-build" content="([^"]*)"')
# The tags sit at the top of the page; reading this much finds them without reading the whole (inlined) dashboard
HEAD_BYTES = 16384


def page_tags(head):
    """(version, build ID) from the start of a dashboard page (text), "" for a missing tag."""
    version, build = VERSION_META.search(head), BUILD_META.search(head)
    return (version.group(1) if version else "", build.group(1) if build else "")


def dashboard_head(p):
    """(version, build ID) of a dashboard file, "" for a missing tag; None if there is no file."""
    try:
        with open(p, encoding="utf-8", errors="replace") as f:
            head = f.read(HEAD_BYTES)
    except OSError:
        return None
    return page_tags(head)


def clean_up_old_dashboard(task_dir):
    """Per-project dashboards (0.10.0-0.14.0): delete the project's copy of the dashboard, stop its server if one still
    runs (only when whoami confirms it serves this folder), and remove the server's record and log. Returns what was
    done, or None when there was nothing left."""
    removed = False
    copy = os.path.join(task_dir, DASHBOARD_FILE)
    if os.path.isfile(copy):
        os.remove(copy)
        removed = True
    stopped = None
    record_path = os.path.join(task_dir, OLD_SERVER_RECORD)
    record = read_json(record_path)
    if record is not None:
        info = whoami(record.get("port")) if isinstance(record, dict) else None
        if info and info.get("folder") == task_dir and info.get("pid") == record.get("pid"):
            try:
                os.kill(record["pid"], signal.SIGTERM)
                stopped = record["pid"]
            except OSError:
                pass
    had_files = False
    for name in (OLD_SERVER_RECORD, OLD_SERVER_LOG):
        p = os.path.join(task_dir, name)
        if os.path.exists(p):
            os.remove(p)
            had_files = True
    if not (removed or stopped or had_files):
        return None
    return {"dashboard": removed, "server": stopped}


FINISH_FIELDS = {"done": "completed_at", "skipped": "skipped_at"}


def missing_finish_times(tasks, vocab):
    """The finished tasks without their finish time (done ones from before completed_at existed; skipped ones from
    before skipped_at existed), with the field each one needs."""
    result = []
    for task in tasks:
        field = FINISH_FIELDS.get(kind_of(vocab, task.get("status"))) if isinstance(task, dict) else None
        if field and not task.get(field) and task.get("updated_at"):
            result.append((task, field))
    return result


def backfill_finish_times(paths):
    """Give finished tasks without a finish time their updated_at, which is what the dashboard showed for them anyway,
    so a later edit (which moves updated_at) doesn't move them in time. In tasks.json and the archive; once per task;
    updated_at and updated_by stay. Returns how many tasks were filled in."""
    archive = archive_path(paths)
    try:
        data = load_tasks(paths)
        vocab = vocabulary(data)
        if not missing_finish_times(data["tasks"], vocab) and not missing_finish_times(load_archive(paths)["tasks"], vocab):
            return 0
    except AtmError:
        return 0  # an unreadable file: the command the skill runs next reports the problem
    filled = 0
    with locked(paths["dir"]):
        data = load_tasks(paths)
        files = [(paths["tasks"], data)] + ([(archive, load_archive(paths))] if os.path.isfile(archive) else [])
        for path, contents in files:
            missing = missing_finish_times(contents["tasks"], vocab)
            for task, field in missing:
                task[field] = task["updated_at"]
            if missing:
                write_json_atomic(path, contents)
                filled += len(missing)
    return filled


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
        "cleaned_up": None,
        "finish_times_filled": 0,
    }
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
    result["merge_driver_updated"] = ensure_merge_driver(paths)
    if not os.path.exists(os.path.join(task_dir, CLAIMS_SNAPSHOT)):
        # So the dashboard finds the file from the start instead of logging a 404 on every refresh
        write_claims_snapshot(paths, read_store(paths)["claims"])
    result["cleaned_up"] = clean_up_old_dashboard(task_dir)
    result["finish_times_filled"] = backfill_finish_times(paths)
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
            line += f"; removed {r['removed_dashboard']} (the dashboard now comes with the plugin: /atm:serve)"
        lines.append(line + ".")
    elif not os.path.isfile(paths["tasks"]):
        lines.append("No tasks.json found. Run /atm:create-tasks to create one.")
    cleaned = r["cleaned_up"]
    if cleaned:
        line = "Removed this project's old dashboard files"
        if cleaned["server"]:
            line += f" and stopped its old dashboard server (pid {cleaned['server']})"
        lines.append(line + ": one dashboard for all your projects now comes with the plugin (/atm:serve).")
    filled = r.get("finish_times_filled")
    if filled:
        tasks = "1 finished task" if filled == 1 else f"{filled} finished tasks"
        lines.append(f"Filled in the finish time of {tasks} that had none, from the last update (completed_at/skipped_at).")
    if not lines:
        lines.append("Nothing to migrate.")
    if r.get("suggest"):
        lines.append(r["suggest"]["archive"]["text"])
    return lines


def cmd_migrate(args):
    paths = find_paths(os.getcwd())
    r = migrate(paths)
    if os.path.isfile(paths["tasks"]):
        register(paths)  # the dashboard lists every project atm runs in (every skill runs migrate first)
    if args.json:
        out(to_json(r))
        return
    for line in describe_migration(r, paths):
        out(line)
