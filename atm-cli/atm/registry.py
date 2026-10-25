"""The user's project registry ($ATM_HOME/projects.json): the projects the dashboard server shows.

One file per user, guarded by $ATM_HOME/.lock (not by any project's lock, and never taken while holding one), written
atomically. A linked git worktree registers its repository's main worktree. Format: docs/multi-project-api.md, 5.1.
"""

import hashlib
import os

from .core import (
    TASK_DIR,
    TASKS_FILE,
    AtmError,
    git,
    now,
    now_iso,
    out,
    parse_iso,
    read_json,
    to_json,
    write_json_atomic,
)
from .lock import locked
from .paths import find_paths

REGISTRY_FILE = "projects.json"
REGISTRY_VERSION = 1
SEEN_EVERY = 24 * 3600  # seconds between seen_at updates, so the registry isn't rewritten on every command


def atm_home():
    """The user's atm folder: ATM_HOME, else ~/.agentic-task-manager."""
    return os.path.abspath(os.path.expanduser(os.environ.get("ATM_HOME") or "~/.agentic-task-manager"))


def main_worktree(root):
    """The main worktree's folder for a project root (itself unless it is a linked git worktree)."""
    common = git(["rev-parse", "--git-common-dir"], root)
    if common:
        common = os.path.normpath(os.path.join(root, common))
        if os.path.basename(common) == ".git":
            return os.path.dirname(common)
    return root


def project_meta(path):
    """The meta of the project at `path`, or None without a readable tasks.json."""
    data = read_json(os.path.join(path, TASK_DIR, TASKS_FILE))
    if not isinstance(data, dict) or not isinstance(data.get("tasks"), list):
        return None
    return data.get("meta") if isinstance(data.get("meta"), dict) else {}


def project_id(meta, path):
    """meta.id, else "p" and 7 hex characters of the path's SHA-1 (stable until meta.id is set)."""
    if isinstance(meta.get("id"), str) and meta["id"]:
        return meta["id"]
    return "p" + hashlib.sha1(path.encode("utf-8")).hexdigest()[:7]


def project_name(meta, path):
    return meta.get("project") if isinstance(meta.get("project"), str) and meta["project"] else os.path.basename(path)


def listed(meta):
    dashboard = meta.get("dashboard")
    return not (isinstance(dashboard, dict) and dashboard.get("listed") is False)


def is_missing(entry):
    return project_meta(entry["path"]) is None


def empty_registry():
    return {"version": REGISTRY_VERSION, "projects": []}


def read_registry(home):
    """(registry, damaged): an unreadable projects.json is moved aside to projects.json.damaged-<time> (its path is
    returned as `damaged`) and replaced by an empty registry. Call it holding the registry lock."""
    path = os.path.join(home, REGISTRY_FILE)
    if not os.path.exists(path):
        return empty_registry(), None
    data = read_json(path)
    entries = data.get("projects") if isinstance(data, dict) else None
    if isinstance(entries, list) and all(isinstance(e, dict) and isinstance(e.get("path"), str) for e in entries):
        return data, None
    damaged = f"{path}.damaged-{now().strftime('%Y%m%dT%H%M%SZ')}"
    os.replace(path, damaged)
    return empty_registry(), damaged


def write_registry(home, registry):
    write_json_atomic(os.path.join(home, REGISTRY_FILE), registry)


def find_entry(registry, path):
    return next((e for e in registry["projects"] if e["path"] == path), None)


def entry_for(path, meta, stamp):
    return {
        "id": project_id(meta, path),
        "name": project_name(meta, path),
        "path": path,
        "added_at": stamp,
        "seen_at": stamp,
    }


def seen_long_ago(entry):
    """True when the entry's seen_at is a day old (or unreadable): time to refresh it."""
    try:
        return (now() - parse_iso(entry.get("seen_at"))).total_seconds() >= SEEN_EVERY
    except (TypeError, ValueError):
        return True


def update_entry(registry, path, meta):
    """Add, refresh or (when the project opted out) remove the entry for `path`. Returns what happened: "added",
    "updated", "unchanged", "removed" or "unlisted"."""
    entry = find_entry(registry, path)
    if not listed(meta):
        if entry:
            registry["projects"].remove(entry)
            return "removed"
        return "unlisted"
    stamp = now_iso()
    if entry is None:
        registry["projects"].append(entry_for(path, meta, stamp))
        return "added"
    fresh = {"id": project_id(meta, path), "name": project_name(meta, path)}
    changed = any(entry.get(k) != v for k, v in fresh.items())
    if not (changed or seen_long_ago(entry)):
        return "unchanged"
    entry.update(fresh)
    entry["seen_at"] = stamp
    return "updated"


def register(paths, wait=True):
    """Register the project of `paths` (its main worktree). With wait=False the registry lock is tried once and the
    project is skipped if the lock is taken (the plugin's hook must never wait). Returns update_entry's result,
    "busy" when skipped, or None when the project has no tasks.json."""
    path = main_worktree(paths["root"])
    meta = project_meta(path)
    if meta is None:
        meta = project_meta(paths["root"])
    if meta is None:
        return None
    home = atm_home()
    try:
        with locked(home, timeout=None if wait else 0):
            registry, _ = read_registry(home)
            result = update_entry(registry, path, meta)
            if result not in ("unchanged", "unlisted"):
                write_registry(home, registry)
            return result
    except AtmError:
        if wait:
            raise
        return "busy"


def register_if_needed(paths):
    """The plugin hook's cheap path, run after every tool call: one read of projects.json, and registering (without
    waiting for the lock) only when the project isn't listed yet or was last seen a day ago."""
    path = main_worktree(paths["root"])
    registry = read_json(os.path.join(atm_home(), REGISTRY_FILE))
    entries = registry.get("projects") if isinstance(registry, dict) else None
    entry = next((e for e in entries or [] if isinstance(e, dict) and e.get("path") == path), None)
    if entry is not None and not seen_long_ago(entry):
        return "unchanged"
    return register(paths, wait=False)


def resolve_project(target):
    """The main worktree folder of the project at `target` (a path), and its meta; refuses a folder without tasks."""
    folder = os.path.abspath(os.path.expanduser(target or os.getcwd()))
    if not os.path.isdir(folder):
        raise AtmError(f"{target}: not a directory", 2)
    paths = find_paths(folder)
    path = main_worktree(paths["root"])
    meta = project_meta(path) or project_meta(paths["root"])
    if meta is None:
        raise AtmError(f"no tasks.json in {os.path.join(path, TASK_DIR)}. Run /atm:create-tasks there first.")
    return path, meta


def describe_entry(entry):
    return f"{entry['id']}  {entry['name']}  {entry['path']}"


def damaged_notice(damaged):
    return f"projects.json was unreadable: moved it to {damaged} and started an empty registry." if damaged else None


def projects_list(home, as_json):
    with locked(home):
        registry, damaged = read_registry(home)
        if damaged:
            write_registry(home, registry)
    entries = [{**e, "missing": is_missing(e)} for e in registry["projects"]]
    if as_json:
        out(to_json({"projects": entries, "damaged": damaged}))
        return
    if damaged:
        out(damaged_notice(damaged))
    if not entries:
        out("No projects registered. `atm projects add [PATH]` adds one; atm adds a project when it runs there.")
    for e in entries:
        out(describe_entry(e) + ("  (not found)" if e["missing"] else ""))


def projects_add(home, target, as_json):
    path, meta = resolve_project(target)
    if not listed(meta):
        raise AtmError(f"{path} opts out of the dashboard (meta.dashboard.listed is false)")
    with locked(home):
        registry, damaged = read_registry(home)
        result = update_entry(registry, path, meta)
        write_registry(home, registry)
    entry = find_entry(registry, path)
    if as_json:
        out(to_json({"result": result, "project": entry, "damaged": damaged}))
        return
    if damaged:
        out(damaged_notice(damaged))
    out(f"{'Added' if result == 'added' else 'Already registered'}: {describe_entry(entry)}")


def projects_remove(home, target, as_json):
    if not target:
        raise AtmError("remove needs a project ID or path (see `atm projects`)", 2)
    candidates = {target, os.path.abspath(os.path.expanduser(target))}
    if os.path.isdir(target):
        candidates.add(main_worktree(find_paths(os.path.abspath(target))["root"]))
    with locked(home):
        registry, damaged = read_registry(home)
        entry = next((e for e in registry["projects"] if e.get("id") in candidates or e["path"] in candidates), None)
        if entry:
            registry["projects"].remove(entry)
        if entry or damaged:
            write_registry(home, registry)
    if entry is None:
        raise AtmError(f"no registered project {target} (see `atm projects`)")
    if as_json:
        out(to_json({"removed": entry, "damaged": damaged}))
        return
    out(f"Removed: {describe_entry(entry)}")


def projects_prune(home, as_json):
    with locked(home):
        registry, damaged = read_registry(home)
        gone = [e for e in registry["projects"] if is_missing(e)]
        registry["projects"] = [e for e in registry["projects"] if e not in gone]
        if gone or damaged:
            write_registry(home, registry)
    if as_json:
        out(to_json({"removed": gone, "damaged": damaged}))
        return
    if damaged:
        out(damaged_notice(damaged))
    if not gone:
        out("Nothing to prune: every registered project is there.")
    for e in gone:
        out(f"Removed: {describe_entry(e)}")


def cmd_projects(args):
    home = atm_home()
    if args.action == "add":
        projects_add(home, args.target, args.json)
    elif args.action == "remove":
        projects_remove(home, args.target, args.json)
    elif args.action == "prune":
        projects_prune(home, args.json)
    else:
        if args.target:
            raise AtmError(f"unexpected argument '{args.target}'", 2)
        projects_list(home, args.json)
