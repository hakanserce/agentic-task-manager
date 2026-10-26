# Generated from atm-cli/atm/ by atm-cli/build.py. Don't edit this file: edit the modules and run
# `npm run build:cli` in dashboard/ (the pre-commit hook does it too).
"""atm: the Agentic Task Manager helper that the skills run.

Run through the `atm` launcher, which checks for Python 3.9+. Standard library only: the plugin is used as cloned,
with nothing to install.
"""

import argparse
import contextlib
import hashlib
import json
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit


# ==== core.py ====
# Constants, errors, output, git, time helpers and atomic writes.

# Where the built plugin/scripts/atm.py lives (only the built file is run, never these modules)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PLUGIN_ROOT = os.path.dirname(SCRIPT_DIR)
TASK_DIR = ".agentic-task-manager"
TASKS_FILE = "tasks.json"
DASHBOARD_FILE = "tasks-dashboard.html"


class AtmError(Exception):
    def __init__(self, message, code=1):
        super().__init__(message)
        self.code = code


class AtmExit(Exception):
    """End with an exit code after normal output (not an error)."""

    def __init__(self, code):
        super().__init__(code)
        self.code = code


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


def rel(root, p):
    return os.path.relpath(p, root)


def is_tracked(root, p):
    return git(["ls-files", "--error-unmatch", "--", rel(root, p)], root) is not None


def in_git(root):
    return git(["rev-parse", "--git-dir"], root) is not None


def plugin_version():
    with open(os.path.join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), encoding="utf-8") as f:
        return json.load(f)["version"]


def parse_version(text):
    parts = []
    for part in (text or "").split("."):
        m = re.match(r"\d+", part)
        parts.append(int(m.group()) if m else 0)
    return parts


def now():
    """The current time; ATM_NOW (ISO 8601 UTC) overrides it, for tests."""
    fixed = os.environ.get("ATM_NOW")
    return parse_iso(fixed) if fixed else datetime.now(timezone.utc)


def now_iso():
    return now().strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(text):
    return datetime.strptime(text, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def format_duration(seconds):
    seconds = max(0, int(seconds))
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        return f"{seconds // 60}m"
    return f"{seconds // 3600}h {seconds % 3600 // 60}m"


def fsync_dir(directory):
    """Make a rename in `directory` durable. Not every platform can open a directory; that's fine to skip."""
    try:
        fd = os.open(directory, os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(fd)
    except OSError:
        pass
    finally:
        os.close(fd)


def write_text_atomic(p, text):
    """Replace a file so readers only ever see the complete old or the complete new content."""
    tmp = f"{p}.{os.getpid()}.{os.urandom(4).hex()}.tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, p)
    except BaseException:
        with contextlib.suppress(OSError):
            os.remove(tmp)
        raise
    fsync_dir(os.path.dirname(os.path.abspath(p)))


def write_json_atomic(p, value):
    write_text_atomic(p, to_json(value) + "\n")


def read_json(p):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def is_zombie(pid):
    """A process that has exited but wasn't reaped yet (common in containers without an init process). Linux only;
    elsewhere an orphaned process is reaped by the system right away."""
    try:
        with open(f"/proc/{pid}/stat", encoding="utf-8") as f:
            stat = f.read()
    except OSError:
        return False
    fields = stat[stat.rfind(")") + 1 :].split()
    return bool(fields) and fields[0] == "Z"


def pid_alive(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return not is_zombie(pid)


WHOAMI = "/__atm/whoami"


def whoami(port):
    """Ask the atm server on this port who it is; None if nothing (or not an atm server) answers."""
    import urllib.request

    try:
        with urllib.request.urlopen(f"http://localhost:{port}{WHOAMI}", timeout=1) as response:
            info = json.loads(response.read().decode("utf-8"))
    except (OSError, ValueError):
        return None
    return info if isinstance(info, dict) and info.get("atm") else None


# ==== paths.py ====
# Where a project's task files are: the project root, the task folder, legacy locations.

LEGACY_DIRS = ["docs", "."]


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


def cmd_paths(args):
    paths = find_paths(os.getcwd())
    if args.json:
        out(to_json(paths))
        return
    for key in ["root", "dir", "tasks", "dashboard"]:
        out(f"{key}: {paths[key]}")
    if paths["legacy"]:
        out(f"legacy: {paths['legacy']['tasks']}")


# ==== lock.py ====
# The lock directory.
#
# A lock is a directory: mkdir succeeds for exactly one process, on every OS and file system. The holder writes
# owner.json inside it and removes the directory when done. A crashed holder leaves the directory behind, so a waiter
# breaks the lock when its owner is provably gone (same host, pid not running) or it is older than LOCK_STALE. See
# docs/parallel-agents-design.md, section 4.

LOCK_DIR = ".lock"
LOCK_OWNER = "owner.json"
LOCK_TIMEOUT = 10.0  # seconds a command waits for the lock (ATM_LOCK_TIMEOUT overrides)
LOCK_STALE = 60.0  # a lock older than this is abandoned: commands hold it for milliseconds
LOCK_POLL = 0.05


def lock_timeout():
    try:
        return float(os.environ.get("ATM_LOCK_TIMEOUT", LOCK_TIMEOUT))
    except ValueError:
        return LOCK_TIMEOUT


def lock_owner(lock):
    return read_json(os.path.join(lock, LOCK_OWNER))


def lock_age(lock, owner):
    """Seconds since the lock was taken: from owner.json, or the directory itself if owner.json isn't written yet."""
    try:
        since = parse_iso(owner["acquired_at"]).timestamp() if owner else os.stat(lock).st_mtime
    except (OSError, KeyError, TypeError, ValueError):
        return 0.0
    return time.time() - since


def lock_is_stale(lock, owner):
    if owner and owner.get("host") == socket.gethostname() and isinstance(owner.get("pid"), int):
        if not pid_alive(owner["pid"]):
            return True
    return lock_age(lock, owner) > LOCK_STALE


def break_lock(lock, owner):
    """Move a stale lock aside. Re-checks the owner first, so a lock that another waiter broke and re-took meanwhile
    is left alone. Returns True if this process broke it."""
    if lock_owner(lock) != owner:
        return False
    aside = f"{lock}.stale.{os.getpid()}.{os.urandom(4).hex()}"
    try:
        os.rename(lock, aside)
    except OSError:
        return False
    shutil.rmtree(aside, ignore_errors=True)
    return True


def describe_owner(owner):
    if not owner:
        return "another process"
    return f"pid {owner.get('pid')} on {owner.get('host')} since {owner.get('acquired_at')}"


@contextlib.contextmanager
def locked(directory, timeout=None):
    """Hold the lock for `directory` (creating it if needed) for the duration of the block. `timeout` (seconds) replaces
    the usual wait; 0 tries once."""
    os.makedirs(directory, exist_ok=True)
    lock = os.path.join(directory, LOCK_DIR)
    deadline = time.time() + (lock_timeout() if timeout is None else timeout)
    while True:
        try:
            os.mkdir(lock)
            break
        except FileExistsError:
            owner = lock_owner(lock)
            if lock_is_stale(lock, owner) and break_lock(lock, owner):
                continue
            if time.time() >= deadline:
                raise AtmError(f"timed out waiting for the lock {lock} (held by {describe_owner(owner)})")
            time.sleep(LOCK_POLL)
    # SIGTERM would otherwise end the process without running the cleanup below
    previous = signal.signal(signal.SIGTERM, lambda signum, frame: sys.exit(128 + signum))
    try:
        write_json_atomic(
            os.path.join(lock, LOCK_OWNER), {"host": socket.gethostname(), "pid": os.getpid(), "acquired_at": now_iso()}
        )
        yield
    finally:
        shutil.rmtree(lock, ignore_errors=True)
        signal.signal(signal.SIGTERM, previous)


def cmd_lock_test(args):
    """Test hook: hold the task folder's lock for `seconds`, logging to .lock-test.log, so tests can check exclusion."""
    seconds = args.seconds
    task_dir = find_paths(os.getcwd())["dir"]
    log = os.path.join(task_dir, ".lock-test.log")
    with locked(task_dir):
        with open(log, "a", encoding="utf-8") as f:
            f.write(f"acquire {os.getpid()}\n")
        time.sleep(seconds)
        with open(log, "a", encoding="utf-8") as f:
            f.write(f"release {os.getpid()}\n")


# ==== registry.py ====
# The user's project registry ($ATM_HOME/projects.json): the projects the dashboard server shows.
#
# One file per user, guarded by $ATM_HOME/.lock (not by any project's lock, and never taken while holding one), written
# atomically. A linked git worktree registers its repository's main worktree. Format: docs/multi-project-api.md, 5.1.

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


def head_branch(git_dir):
    """The branch checked out per a git directory's HEAD file; a detached HEAD gives its short SHA, no file None."""
    try:
        with open(os.path.join(git_dir, "HEAD"), encoding="utf-8") as f:
            head = f.readline().strip()
    except OSError:
        return None
    if head.startswith("ref: "):
        ref = head[5:]
        return ref[len("refs/heads/") :] if ref.startswith("refs/heads/") else ref
    return head[:7] or None


def worktrees(root):
    """The git worktrees of the project whose main worktree is `root`, main first, as `git worktree list` has them:
    [{path, branch, main}]. Read from the git directory, without running git, so the server can ask on every poll.
    Linked worktrees whose folder is gone are left out; outside git (or a bare repository) the list is empty."""
    git_dir = os.path.join(root, ".git")
    if not os.path.isdir(git_dir):
        return []
    found = [{"path": root, "branch": head_branch(git_dir), "main": True}]
    linked = os.path.join(git_dir, "worktrees")
    try:
        names = sorted(os.listdir(linked))
    except OSError:
        names = []
    for name in names:
        admin = os.path.join(linked, name)
        try:
            with open(os.path.join(admin, "gitdir"), encoding="utf-8") as f:
                path = os.path.dirname(f.readline().strip())  # the worktree's .git file
        except OSError:
            continue
        if path and os.path.isdir(path):
            found.append({"path": path, "branch": head_branch(admin), "main": False})
    return found


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


# ==== model.py ====
# Loading tasks.json, the project's vocabularies, looking tasks up, and the status transitions themselves.
#
# Every rule is written against a status's kind, never its name (docs/v4/data-model.md §3): a project may name its own
# statuses in meta.statuses, each with one of the six kinds below.

KINDS = ("todo", "active", "review", "blocked", "done", "skipped")
DEFAULT_STATUSES = [
    {"id": "todo", "label": "To Do", "kind": "todo"},
    {"id": "in_progress", "label": "In Progress", "kind": "active"},
    {"id": "in_review", "label": "In Review", "kind": "review"},
    {"id": "blocked", "label": "Blocked", "kind": "blocked"},
    {"id": "done", "label": "Done", "kind": "done"},
    {"id": "skipped", "label": "Skipped", "kind": "skipped"},
]
DEFAULT_TYPES = [
    {"id": t, "label": t.capitalize()} for t in ("feature", "bugfix", "test", "infra", "docs", "refactor", "polish")
]
DEFAULT_PRIORITIES = [
    {"id": "P0", "label": "Critical"},
    {"id": "P1", "label": "High"},
    {"id": "P2", "label": "Medium"},
    {"id": "P3", "label": "Low"},
]
DEFAULT_PRIORITY = "P2"
WORKFLOW_TYPES = ("direct", "pull-request")

# command: (kinds a task may be in, kind it moves to)
STATUS_CHANGES = {
    "start": (("todo",), "active"),
    "review": (("active",), "review"),
    "done": (("active", "review"), "done"),
    "fail": (("active",), "todo"),
    "release": (("active",), "todo"),
    "reject": (("review",), "todo"),
    "block": (("todo", "active"), "blocked"),
    "unblock": (("blocked",), "todo"),
    # Undo a done (or skipped) by mistake, or work that turns out unfinished; the reason is kept as a note
    "reopen": (("done", "skipped"), "todo"),
    # A task that turns out not to be needed; reopen undoes it
    "skip": (("todo", "blocked"), "skipped"),
}
WAITING_ON = ("user", "agent")


def _terms(meta, key, defaults, need_kind=False):
    """meta[key] as a list of {id, label[, kind]}, or the defaults when absent. Raises AtmError naming the problem."""
    if key not in meta:
        return defaults
    value = meta[key]
    if not isinstance(value, list) or not value:
        raise AtmError(f"meta.{key} must be a non-empty list")
    seen, terms = set(), []
    for item in value:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str) or not item["id"]:
            raise AtmError(f"meta.{key}: every entry needs an \"id\" (a non-empty string)")
        if item["id"] in seen:
            raise AtmError(f"meta.{key}: \"{item['id']}\" is listed twice")
        seen.add(item["id"])
        term = {"id": item["id"], "label": item.get("label") or item["id"].replace("_", " ").capitalize()}
        if need_kind:
            if item.get("kind") not in KINDS:
                raise AtmError(
                    f"meta.{key}: \"{item['id']}\" has the kind {item.get('kind')!r}; use one of {', '.join(KINDS)}"
                )
            term["kind"] = item["kind"]
        terms.append(term)
    return terms


WORKFLOW_DEFAULTS = {"verify": True, "max_rounds": 3, "commit_template": "feat({id}): {name}"}


def check_workflow(workflow):
    """meta.workflow (docs/v4/skills-and-workflows.md S-1.1), when set: raises AtmError naming what's wrong."""
    if workflow is None:
        return
    if not isinstance(workflow, dict) or workflow.get("type") not in WORKFLOW_TYPES:
        raise AtmError(f"meta.workflow.type must be one of {', '.join(WORKFLOW_TYPES)}")
    checks = (
        ("base", lambda v: isinstance(v, str) and v, "a branch name"),
        ("verify", lambda v: isinstance(v, bool), "true or false"),
        ("max_rounds", lambda v: isinstance(v, int) and not isinstance(v, bool) and v > 0, "a positive whole number"),
        ("commit_template", lambda v: isinstance(v, str) and v, "a message template like \"feat({id}): {name}\""),
        (
            "trailers",
            lambda v: v == "forbid"
            or (isinstance(v, dict) and isinstance(v.get("require"), list) and all(isinstance(x, str) for x in v["require"])),
            '"forbid" or {"require": ["Co-Authored-By: ..."]}',
        ),
    )
    for key, valid, expected in checks:
        if key in workflow and not valid(workflow[key]):
            raise AtmError(f"meta.workflow.{key} must be {expected}")


def workflow_of(data):
    """The project's workflow with its defaults filled in, or None when it has none."""
    meta = data.get("meta") if isinstance(data.get("meta"), dict) else {}
    workflow = meta.get("workflow")
    if workflow is None:
        return None
    check_workflow(workflow)
    return {**WORKFLOW_DEFAULTS, **workflow}


def vocabulary(data):
    """The project's vocabularies from meta, with the defaults for what it doesn't define (DM-2). Raises AtmError,
    naming the problem, when meta defines something that can't work."""
    meta = data.get("meta") if isinstance(data.get("meta"), dict) else {}
    statuses = _terms(meta, "statuses", DEFAULT_STATUSES, need_kind=True)
    for kind in ("todo", "active", "done"):
        if not any(s["kind"] == kind for s in statuses):
            raise AtmError(f"meta.statuses needs at least one status of the kind {kind!r}")
    priorities = _terms(meta, "priorities", DEFAULT_PRIORITIES)
    ids = [p["id"] for p in priorities]
    # Without a default: P2 if the project has it, else the middle priority (as the dashboard does)
    default_priority = meta.get(
        "default_priority", DEFAULT_PRIORITY if DEFAULT_PRIORITY in ids else ids[(len(ids) - 1) // 2]
    )
    if default_priority not in ids:
        raise AtmError(f"meta.default_priority {default_priority!r} is not one of meta.priorities")
    phases = meta.get("phases", [])
    if not isinstance(phases, list) or any(
        not isinstance(p, dict) or not isinstance(p.get("id"), (int, float)) or isinstance(p.get("id"), bool)
        for p in phases
    ):
        raise AtmError('meta.phases must be a list of {"id": <number>, "name": "..."}')
    check_workflow(meta.get("workflow"))
    return {
        "statuses": statuses,
        "types": _terms(meta, "types", DEFAULT_TYPES),
        "priorities": priorities,
        "default_priority": default_priority,
        "phases": phases,
    }


def kind_of(vocab, status):
    """The status's kind. A status the project doesn't list keeps its default kind if it is a default status; any
    other status has none (None)."""
    for s in vocab["statuses"]:
        if s["id"] == status:
            return s["kind"]
    for s in DEFAULT_STATUSES:
        if s["id"] == status:
            return s["kind"]
    return None


def priority_rank(vocab, priority):
    """0 for the most urgent priority. A missing or unknown priority ranks as the default priority."""
    ids = [p["id"] for p in vocab["priorities"]]
    return ids.index(priority) if priority in ids else ids.index(vocab["default_priority"])


def statuses_of(vocab, kind):
    return [s["id"] for s in vocab["statuses"] if s["kind"] == kind]


def status_for(vocab, kind, chosen=None):
    """The status a task moving to `kind` gets: `chosen` (--status), which must be of that kind, else the first status
    of that kind the project lists."""
    options = statuses_of(vocab, kind)
    if chosen is None:
        return options[0]
    if chosen not in options:
        known = kind_of(vocab, chosen)
        what = f"its kind is {known}" if known else "the project has no such status"
        raise AtmError(f"--status {chosen} is not one of the {kind} statuses ({what}); use {' or '.join(options)}", 2)
    return chosen


ARCHIVE_FILE = "tasks-archive.json"
# The archive of the project this command works on, read only when needed (a dependency not in tasks.json, show of
# an archived task): one atm process works on one project
_archive = {"paths": None, "data": None}


def archive_path(paths):
    return os.path.join(paths["dir"], ARCHIVE_FILE)


def load_archive(paths):
    """tasks-archive.json, or an empty archive when there is none (DM-1.2)."""
    p = archive_path(paths)
    if not os.path.isfile(p):
        return {"meta": {}, "tasks": []}
    data = read_json(p)
    if not isinstance(data, dict) or not isinstance(data.get("tasks"), list):
        raise AtmError(f"{p} is not a valid archive (expected an object with a 'tasks' list)")
    return data


ARCHIVE_DEFAULTS = {"threshold_kb": 1024, "threshold_tasks": 500, "keep_days": 14, "auto": True}


def archive_settings(data):
    """meta.archive, with the defaults for what it doesn't set (DM-2)."""
    meta = data.get("meta") if isinstance(data.get("meta"), dict) else {}
    given = meta.get("archive") if isinstance(meta.get("archive"), dict) else {}
    settings = dict(ARCHIVE_DEFAULTS)
    for key, default in ARCHIVE_DEFAULTS.items():
        value = given.get(key)
        if isinstance(default, bool):
            if isinstance(value, bool):
                settings[key] = value
        elif isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0:
            settings[key] = value
    return settings


def finished_at(task):
    """When a finished task finished: completed_at (done) or skipped_at (skipped), else updated_at for files from
    before those were written (atm migrate fills them in)."""
    for key in ("completed_at", "skipped_at", "updated_at"):
        try:
            return parse_iso(task[key])
        except (KeyError, TypeError, ValueError):
            continue
    return None


def archivable(data, phases=None, before=None, keep=None):
    """The tasks `atm archive` would move (DM-5.1): done- and skipped-kind, not finished in the last `keep` days
    (default meta.archive.keep_days), not in an open PR; only `phases` and those finished before `before`, if given."""
    vocab = vocabulary(data)
    recent = now() - timedelta(days=archive_settings(data)["keep_days"] if keep is None else keep)
    result = []
    for t in data["tasks"]:
        if not isinstance(t, dict) or kind_of(vocab, t.get("status")) not in ("done", "skipped"):
            continue
        if phases and phase_of(t) not in phases:
            continue
        if isinstance(t.get("pr"), dict) and not t.get("merged_at"):
            continue  # still in an open PR
        finished = finished_at(t)
        if finished is not None and finished > recent:
            continue
        if before is not None and (finished is None or finished >= before):
            continue
        result.append(t)
    return result


def format_size(size):
    return f"{size / 1048576:.1f} MB" if size >= 1048576 else f"{size // 1024} KB"


def archive_hint(paths, data):
    """The suggestion to archive (CLI-5.1), or None: when tasks.json is over meta.archive.threshold_kb, or has more
    archivable tasks than threshold_tasks, and there is something to move."""
    settings = archive_settings(data)
    size = os.path.getsize(paths["tasks"]) if os.path.isfile(paths["tasks"]) else 0
    movable = len(archivable(data))
    if not movable or (size <= settings["threshold_kb"] * 1024 and movable <= settings["threshold_tasks"]):
        return None
    vocab = vocabulary(data)
    finished = sum(
        1 for t in data["tasks"] if isinstance(t, dict) and kind_of(vocab, t.get("status")) in ("done", "skipped")
    )
    return {
        "bytes": size,
        "finished": finished,
        "archivable": movable,
        "auto": settings["auto"],  # false: the skills only relay the hint (S-3.5)
        "text": f"tasks.json is {format_size(size)} with {finished} finished tasks; `atm archive` would move "
        f"{movable} of them to tasks-archive.json.",
    }


def archived_task(task_id):
    """The archived task with this ID, if the archive has it (the archive is read on the first lookup)."""
    if _archive["paths"] is None:
        return None
    if _archive["data"] is None:
        _archive["data"] = {t.get("id"): t for t in load_archive(_archive["paths"])["tasks"]}
    return _archive["data"].get(task_id)


def load_tasks(paths):
    if not os.path.isfile(paths["tasks"]):
        raise AtmError(f"no tasks.json in {paths['dir']}. Run /atm:create-tasks first.")
    data = read_json(paths["tasks"])
    if not isinstance(data, dict) or not isinstance(data.get("tasks"), list):
        raise AtmError(f"{paths['tasks']} is not a valid task file (expected an object with a 'tasks' list)")
    vocabulary(data)  # an unusable vocabulary stops every command before anything is written
    _archive["paths"], _archive["data"] = paths, None
    return data


def find_task(data, task_id, archived=False):
    """The task with this ID in tasks.json; with `archived`, also in the archive (for reading only)."""
    for task in data["tasks"]:
        if task.get("id") == task_id:
            return task
    if archived and archived_task(task_id):
        return archived_task(task_id)
    hint = " (it is archived: atm unarchive brings it back)" if not archived and archived_task(task_id) else ""
    raise AtmError(f"no task {task_id}{hint}")


def unfinished_dependencies(data, task):
    """Dependencies that don't have a done-kind status yet, with their status ("missing" for unknown IDs). A
    dependency that is only in the archive is done (DM-3.1)."""
    vocab = vocabulary(data)
    status = {t.get("id"): t.get("status") for t in data["tasks"]}
    return [
        (dep, status.get(dep, "missing"))
        for dep in task.get("dependencies", [])
        if (dep in status and kind_of(vocab, status[dep]) != "done") or (dep not in status and not archived_task(dep))
    ]


def natural_key(task_id):
    """Sort T-2 before T-10, like the dashboard's localeCompare(..., { numeric: true })."""
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", str(task_id))]


def phase_of(task):
    return task.get("phase") if isinstance(task.get("phase"), (int, float)) else 0


MAX_NOTE = 500


def check_note(text):
    """Notes stay short; anything longer belongs in a file in the repository."""
    if len(text) > MAX_NOTE:
        raise AtmError(
            f"a note is at most {MAX_NOTE} characters (this one has {len(text)}); "
            "put longer text in a file in the repository and mention it in the note",
            2,
        )
    return text


def add_note(task, kind, text, by, stamp):
    """Append a note (DM-4): handoff, outcome, review, rejection, failure, answer or note."""
    note = {"at": stamp, "kind": kind, "text": check_note(text)}
    if by:
        note["by"] = by
    task.setdefault("notes", []).append(note)


def touch(task, actor, stamp):
    """Every change records when and by whom (CLI-3.5)."""
    task["updated_at"] = stamp
    if actor:
        task["updated_by"] = actor


def back_to_todo(task, vocab, actor, stamp, keep_commit=False):
    """The task returns to the first todo-kind status; its attempt's timestamps and actors go (DM-4.4). The commit
    goes too, unless `keep_commit`: an expired lease or a release leaves the work in git, to be finished later."""
    task["status"] = status_for(vocab, "todo")
    touch(task, actor, stamp)
    for field in (
        "started_at",
        "completed_at",
        "skipped_at",
        "started_by",
        "completed_by",
        "agent",
        "review_requested_at",
        "waiting_on",
        "questions",
        "blocked_at",
    ):
        task.pop(field, None)
    if not keep_commit:
        task.pop("commit", None)


def answer_note(questions, answers):
    """One note for an unblocked task: each question with its answer."""
    pairs = []
    for i in range(max(len(questions), len(answers))):
        q = questions[i] if i < len(questions) else None
        a = answers[i] if i < len(answers) else None
        pairs.append(f"{q} → {a}" if q and a else (f"{q} → (no answer)" if q else a))
    return "; ".join(pairs)


def change_status(
    task,
    data,
    command,
    reason=None,
    agent=None,
    status=None,
    note=None,
    commit=None,
    waiting_on=None,
    questions=(),
    answers=(),
):
    """Apply one status command to `task` (in `data`); raises AtmError if the transition isn't allowed. `status`
    picks the new status when its kind has several; `agent` is who runs it. `start` records them as started_by,
    `done` as completed_by (both kept when it is done, so the dashboard can show who did what); `note` and `reason`
    become notes, `commit` the task's commit. `block` records who it waits on and the open questions; `unblock`
    turns them, with the answers, into an answer note."""
    vocab = vocabulary(data)
    allowed, new_kind = STATUS_CHANGES[command]
    current = task.get("status")
    if kind_of(vocab, current) not in allowed:
        expected = [s for kind in allowed for s in statuses_of(vocab, kind)]
        raise AtmError(f"can't {command} {task['id']}: it is {current}, not {' or '.join(expected)}")
    new = status_for(vocab, new_kind, status)
    if command == "start":
        blocking = unfinished_dependencies(data, task)
        if blocking:
            raise AtmError(f"can't start {task['id']}: waiting on " + ", ".join(f"{d} ({s})" for d, s in blocking))
    if note is not None:
        check_note(note)
    if reason is not None:
        check_note(reason)
    for question in questions:
        check_note(question)
    if command == "block":
        if waiting_on not in WAITING_ON:
            raise AtmError(f"--on must be {' or '.join(WAITING_ON)}", 2)
        if not questions and not reason:
            raise AtmError("say what it waits for: --question (repeatable) or --reason", 2)
    asked = list(task.get("questions") or [])
    answered = answer_note(asked, list(answers)) if command == "unblock" and (asked or answers) else None
    if answered is not None:
        check_note(answered)
    stamp = now_iso()
    if new_kind == "todo":
        # Reopening, rejecting or failing a task undoes its work; releasing or unblocking it doesn't
        back_to_todo(task, vocab, agent, stamp, keep_commit=command not in ("reopen", "reject", "fail"))
        if answered:
            add_note(task, "answer", answered, agent, stamp)
        if command == "fail":
            add_note(task, "failure", reason or "verification failed", agent, stamp)
        elif command == "reject":
            add_note(task, "rejection", reason, agent, stamp)
        elif command == "reopen":
            add_note(task, "note", f"Reopened: {reason}", agent, stamp)
        elif note:
            add_note(task, "handoff", note, agent, stamp)
        return current
    task["status"] = new
    touch(task, agent, stamp)
    if command == "block":
        # Who started it stays visible while it waits; unblock returns it to to-do and clears the attempt
        task["waiting_on"] = waiting_on
        task["questions"] = list(questions)
        task["blocked_at"] = stamp
        if reason:
            add_note(task, "note", reason, agent, stamp)
    elif command == "review":
        # The work ends here: the review isn't agent work (DM-4.1); done keeps this timestamp
        task["review_requested_at"] = stamp
        if note:
            add_note(task, "review", note, agent, stamp)
    elif command == "skip":
        for field in ("waiting_on", "questions", "blocked_at"):
            task.pop(field, None)
        task["skipped_at"] = stamp
        add_note(task, "note", f"Skipped: {reason}", agent, stamp)
    elif command == "start":
        task["started_at"] = stamp
        task.pop("completed_at", None)
        task.pop("completed_by", None)
        task.pop("agent", None)  # the old name of started_by
        if agent:
            task["started_by"] = agent
    elif command == "done":
        task["completed_at"] = stamp
        if agent:
            task["completed_by"] = agent
        if commit:
            task["commit"] = commit
        if note:
            add_note(task, "outcome", note, agent, stamp)
    return current


# ==== repository.py ====
# `atm repository`: the project's repository web address in meta.repository (e.g. https://github.com/o/r), which the
# dashboard uses to link commits and pull requests. Git remotes are turned into that address.

SCP_REMOTE = re.compile(r"^(?:[\w.-]+@)?([\w.-]+):(?!//)(.+)$")  # git@github.com:o/r.git
URL = re.compile(r"^(https?|ssh|git)://(?:[^@/]+@)?([^/:]+)(?::\d+)?(/.*)?$")


def repository_url(text):
    """The web address of a repository: an http(s) URL as given, or a git remote turned into one
    (git@github.com:o/r.git, ssh://git@github.com/o/r.git, https://github.com/o/r.git -> https://github.com/o/r).
    Credentials, a trailing .git and a trailing slash go. None if it isn't one."""
    text = (text or "").strip()
    m = URL.match(text)
    if m:
        scheme, host, path = m.group(1), m.group(2), (m.group(3) or "")
        web = "https" if scheme in ("ssh", "git") else scheme
    else:
        m = SCP_REMOTE.match(text)
        if not m or "/" in m.group(1):
            return None
        web, host, path = "https", m.group(1), "/" + m.group(2)
    path = re.sub(r"\.git/?$", "", path.rstrip("/")).rstrip("/")
    if not host or "." not in host and host != "localhost" or not path.strip("/"):
        return None
    return f"{web}://{host}{path}"


def origin_repository(root):
    """The web address of the clone's origin remote, or None."""
    return repository_url(git(["remote", "get-url", "origin"], root) or "")


def ensure_repository(paths):
    """Fill meta.repository from origin when tasks.json has none. Returns the address it set, or None."""
    if not os.path.isfile(paths["tasks"]):
        return None
    url = origin_repository(paths["root"])
    if not url:
        return None
    with locked(paths["dir"]):
        data = load_tasks(paths)
        meta = data.setdefault("meta", {})
        if meta.get("repository"):
            return None
        meta["repository"] = url
        write_json_atomic(paths["tasks"], data)
    return url


def cmd_repository(args):
    paths = find_paths(os.getcwd())
    if args.action is None:
        if args.url is not None:
            raise AtmError(f"unexpected argument '{args.url}' (atm repository set URL)", 2)
        current = load_tasks(paths).get("meta", {}).get("repository")
        if args.json:
            out(to_json({"repository": current or None}))
        elif current:
            out(current)
        else:
            out("No repository address yet. Set it with `atm repository set <url>` (a git remote works too).")
        return
    url = repository_url(args.url)
    if not url:
        raise AtmError(f"{args.url!r} is not a repository address: give an http(s) URL or a git remote", 2)
    with locked(paths["dir"]):
        data = load_tasks(paths)
        data.setdefault("meta", {})["repository"] = url
        write_json_atomic(paths["tasks"], data)
    out(to_json({"repository": url}) if args.json else f"Repository address set: {url}")


# ==== claims.py ====
# Claims: which agent works on which task, until when (the lease); and `next`.
#
# Claims live in the git common directory, so all worktrees of a clone see them; tasks.json itself is per worktree.
# Lock order: the task folder, then the claims store, so two commands can never wait on each other.

CLAIMS_STORE = "claims.json"  # in <git common dir>/atm/, shared by all worktrees of a clone
CLAIMS_STORE_NO_GIT = "claims-store.json"  # in the task folder, outside git
CLAIMS_SNAPSHOT = "claims.json"  # in the task folder (gitignored): what the dashboard reads
DEFAULT_LEASE_MINUTES = 30


def agent_identity(agent=None):
    """Who runs the command (the actor, DM-4.5): --agent, else ATM_AGENT, else this Claude Code session, else the git
    user's name (a person in a terminal), else user@host."""
    if agent:
        return agent
    if os.environ.get("ATM_AGENT"):
        return os.environ["ATM_AGENT"]
    if os.environ.get("CLAUDE_CODE_SESSION_ID"):
        return "claude:" + os.environ["CLAUDE_CODE_SESSION_ID"][:8]
    name = git(["config", "user.name"], project_root(os.getcwd()))
    if name:
        return name
    user = os.environ.get("USER") or os.environ.get("USERNAME") or "user"
    return f"{user}@{socket.gethostname()}"


def claims_dir(paths):
    common = git(["rev-parse", "--git-common-dir"], paths["root"])
    if common:
        return os.path.join(os.path.normpath(os.path.join(paths["root"], common)), "atm")
    return paths["dir"]


def claims_store_path(paths):
    directory = claims_dir(paths)
    return os.path.join(directory, CLAIMS_STORE if directory != paths["dir"] else CLAIMS_STORE_NO_GIT)


@contextlib.contextmanager
def locked_with_claims(paths):
    """Hold the task folder's lock and, if it is elsewhere, the claims store's lock (always in this order)."""
    with contextlib.ExitStack() as stack:
        stack.enter_context(locked(paths["dir"]))
        if claims_dir(paths) != paths["dir"]:
            stack.enter_context(locked(claims_dir(paths)))
        yield


def read_store(paths):
    """The shared store: live `claims`, and `completed` tasks (done in some worktree; its tasks.json may be the only
    one that says so until the branches merge, so `next` must not hand those tasks out again elsewhere); and `hints`,
    when each hint was last shown (so `done` repeats one at most once a day)."""
    data = read_json(claims_store_path(paths))
    data = data if isinstance(data, dict) else {}
    hints = data.get("hints") if isinstance(data.get("hints"), dict) else {}
    return {"claims": data.get("claims") or {}, "completed": data.get("completed") or {}, "hints": hints}


def write_store(paths, store):
    os.makedirs(claims_dir(paths), exist_ok=True)
    write_json_atomic(claims_store_path(paths), store)
    write_claims_snapshot(paths, store["claims"])


def write_claims_snapshot(paths, claims):
    """The gitignored copy the dashboard polls: live claims, as a list."""
    if os.path.isdir(paths["dir"]):
        snapshot = {"generated_at": now_iso(), "claims": sorted(claims.values(), key=lambda c: c["task"])}
        write_json_atomic(os.path.join(paths["dir"], CLAIMS_SNAPSHOT), snapshot)


def lease_minutes(data):
    try:
        minutes = float(data.get("meta", {}).get("lease_minutes", DEFAULT_LEASE_MINUTES))
    except (TypeError, ValueError, AttributeError):
        return DEFAULT_LEASE_MINUTES
    return minutes if minutes > 0 else DEFAULT_LEASE_MINUTES


def lease_until(data):
    return (now() + timedelta(minutes=lease_minutes(data))).strftime("%Y-%m-%dT%H:%M:%SZ")


def expire_claims(paths, data, claims):
    """Drop claims whose lease ran out; their tasks in this worktree go back to todo. Returns the expired claims."""
    current = now()
    vocab = vocabulary(data)
    expired = []
    for task_id, claim in list(claims.items()):
        try:
            alive = parse_iso(claim["lease_expires_at"]) > current
        except (KeyError, TypeError, ValueError):
            alive = False
        if alive:
            continue
        expired.append(claims.pop(task_id))
        task = next((t for t in data["tasks"] if t.get("id") == task_id), None)
        if task and kind_of(vocab, task.get("status")) == "active":
            stamp = now_iso()
            back_to_todo(task, vocab, None, stamp, keep_commit=True)
            add_note(task, "failure", f"lease expired ({claim.get('agent')})", None, stamp)
    return expired


def new_claim(paths, data, task_id, agent):
    return {
        "task": task_id,
        "agent": agent,
        "branch": git(["rev-parse", "--abbrev-ref", "HEAD"], paths["root"]),
        "worktree": paths["root"],
        "claimed_at": now_iso(),
        "lease_expires_at": lease_until(data),
    }


def completion(paths, task_id, agent):
    return {
        "task": task_id,
        "agent": agent,
        "branch": git(["rev-parse", "--abbrev-ref", "HEAD"], paths["root"]),
        "worktree": paths["root"],
        "completed_at": now_iso(),
    }


def check_holder(claims, task_id, agent, command):
    claim = claims.get(task_id)
    if claim and claim.get("agent") != agent:
        raise AtmError(
            f"can't {command} {task_id}: it is claimed by {claim.get('agent')} until {claim.get('lease_expires_at')}",
            4,
        )


def own_lease_expired(expired, data, task_id, agent, then):
    """When `agent`'s own claim on `task_id` is among the claims that just expired and the task went back to todo: an
    error that says so and how to go on (`then`, the command to run after `atm start`). Exit code 4, like a claim
    conflict. Another agent's expired claim, or none: None."""
    claim = next((c for c in expired if c.get("task") == task_id and c.get("agent") == agent), None)
    task = next((t for t in data["tasks"] if t.get("id") == task_id), None)
    if not claim or not task or kind_of(vocabulary(data), task.get("status")) != "todo":
        return None
    until = str(claim.get("lease_expires_at", ""))
    at = f"{until[11:16]} UTC" if len(until) >= 16 else until
    minutes = lease_minutes(data)
    idle = f"{minutes:g} min"
    kept = " Your commit is kept." if task.get("commit") else ""
    next_steps = f"Run `atm start {task_id}`" + (f", then `{then}` again." if then else " to claim it again.")
    return AtmError(
        f"{task_id}: your lease expired at {at} (no heartbeat for {idle}), so it went back to todo.{kept} {next_steps}",
        4,
    )


def report_expired(expired):
    for claim in expired:
        sys.stderr.write(f"atm: lease of {claim['task']} by {claim.get('agent')} expired; it is available again\n")


def next_task(data, store, phase=None, task_type=None):
    """The loop's rule (same as the dashboard's "Next up"): todo, every dependency done, not claimed and not completed
    in another worktree, matching the filters; lowest phase first, then the most urgent priority, then lowest ID.
    Returns (task, reason) where reason explains an empty result."""
    claims, completed = store["claims"], store["completed"]
    vocab = vocabulary(data)
    candidates = [
        t
        for t in data["tasks"]
        if kind_of(vocab, t.get("status")) == "todo"
        and (phase is None or phase_of(t) == phase)
        and (task_type is None or t.get("type") == task_type)
    ]
    taken = set(claims) | set(completed)
    ready = [t for t in candidates if not unfinished_dependencies(data, t) and t.get("id") not in taken]
    if ready:
        order = lambda t: (phase_of(t), priority_rank(vocab, t.get("priority")), natural_key(t.get("id")))
        return min(ready, key=order), None
    if not candidates:
        return None, "nothing left to do"
    claimed = [t["id"] for t in candidates if t.get("id") in claims]
    done_elsewhere = [t["id"] for t in candidates if t.get("id") in completed]
    reason = f"{len(candidates)} todo task(s) waiting on dependencies"
    if claimed:
        reason += f" or claimed by other agents ({', '.join(claimed)})"
    if done_elsewhere:
        reason += f"; done in another worktree, not merged yet: {', '.join(done_elsewhere)}"
    return None, reason


def cmd_next(args):
    agent = agent_identity(args.agent)
    paths = find_paths(os.getcwd())
    with locked_with_claims(paths):
        data = load_tasks(paths)
        store = read_store(paths)
        claims = store["claims"]
        expired = expire_claims(paths, data, claims)
        task, reason = next_task(data, store, args.phase, args.type)
        if task and args.claim:
            change_status(task, data, "start", agent=agent, status=args.status)
            claims[task["id"]] = new_claim(paths, data, task["id"], agent)
        if expired or (task and args.claim):
            write_json_atomic(paths["tasks"], data)
            write_store(paths, store)
    report_expired(expired)
    claim = claims.get(task["id"]) if task and args.claim else None
    if args.json:
        out(to_json({"task": task, "claim": claim, "reason": reason}))
    elif task:
        verb = "Claimed" if claim else "Next"
        out(f"{verb}: {task['id']} {task.get('name', '')} (phase {task.get('phase')}, {task.get('type')})")
    else:
        out(f"No task available: {reason}.")
    if not task:
        raise AtmExit(3)


AUTO_RENEW_AFTER = timedelta(minutes=10)


def hook_input():
    """The JSON a Claude Code hook gets on stdin ({session_id, cwd, ...}), or {}."""
    if sys.stdin is None or sys.stdin.isatty():
        return {}
    try:
        value = json.loads(sys.stdin.read() or "{}")
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {}


def renewed_at(claim):
    try:
        return parse_iso(claim.get("renewed_at") or claim["claimed_at"])
    except (KeyError, TypeError, ValueError):
        return None


def auto_heartbeat(args):
    """`heartbeat --auto`, run by the plugin's PostToolUse hook after every tool call (CLI-6.2): renew this agent's
    live claims once their last renewal is ten minutes old. Most calls only read the claims store; it never prints
    and never fails, so a tool call is never disturbed."""
    try:
        payload = hook_input()
        if payload.get("session_id") and not (args.agent or os.environ.get("ATM_AGENT")):
            agent = "claude:" + str(payload["session_id"])[:8]
        else:
            agent = agent_identity(args.agent)
        cwd = payload.get("cwd") if isinstance(payload.get("cwd"), str) and os.path.isdir(payload["cwd"]) else os.getcwd()
        paths = find_paths(cwd)
        if not paths["tasks_exists"]:
            return
        try:
            register_if_needed(paths)  # list the project on the dashboard (one read of the registry when it is)
        except Exception:
            pass
        current = now()

        def due(claims):
            return [
                c
                for c in claims.values()
                if isinstance(c, dict)
                and c.get("agent") == agent
                and parse_iso(c["lease_expires_at"]) > current
                and (renewed_at(c) is None or current - renewed_at(c) >= AUTO_RENEW_AFTER)
            ]

        if not due(read_store(paths)["claims"]):
            return
        with locked_with_claims(paths):
            data = load_tasks(paths)
            store = read_store(paths)
            for claim in due(store["claims"]):
                claim["lease_expires_at"] = lease_until(data)
                claim["renewed_at"] = now_iso()
            write_store(paths, store)
    except Exception:  # a hook must never break the tool call it follows
        return


def cmd_heartbeat(args):
    if args.auto:
        auto_heartbeat(args)
        return
    if not args.id:
        raise AtmError("atm heartbeat needs a task ID (or --auto)", 2)
    task_id, agent = args.id, agent_identity(args.agent)
    paths = find_paths(os.getcwd())
    with locked_with_claims(paths):
        data = load_tasks(paths)
        store = read_store(paths)
        claims = store["claims"]
        expired = expire_claims(paths, data, claims)
        claim = claims.get(task_id)
        if claim:
            check_holder(claims, task_id, agent, "heartbeat")
            claim["lease_expires_at"] = lease_until(data)
            claim["renewed_at"] = now_iso()
        if expired:
            write_json_atomic(paths["tasks"], data)
        write_store(paths, store)
    if not claim:
        own = own_lease_expired(expired, data, task_id, agent, None)
        if own:
            raise own
        gone = any(c["task"] == task_id for c in expired)
        raise AtmError(f"{task_id} has no live claim" + (" (its lease expired)" if gone else ""), 4)
    if args.json:
        out(to_json(claim))
    else:
        out(f"{task_id}: lease extended to {claim['lease_expires_at']}")


def cmd_claims(args):
    paths = find_paths(os.getcwd())
    with locked_with_claims(paths):
        data = load_tasks(paths)
        store = read_store(paths)
        claims = store["claims"]
        if expire_claims(paths, data, claims):
            write_json_atomic(paths["tasks"], data)
        write_store(paths, store)
    live = sorted(claims.values(), key=lambda c: c["task"])
    if args.json:
        out(to_json(live))
        return
    if not live:
        out("No live claims.")
        return
    current = now()
    for c in live:
        left = format_duration((parse_iso(c["lease_expires_at"]) - current).total_seconds())
        out(f"{c['task']}  {c.get('agent')}  {c.get('branch') or '-'}  {left} left  ({c.get('worktree')})")


# ==== query.py ====
# Reading tasks: show, list, status, deps. Agents read tasks through these, never tasks.json itself (DM-1.1).
#
# Text output is short and stable, for agents to read; --json is for anything that parses it (CLI-3.3). These commands
# never write: they read tasks.json and the claims store without the lock (both are replaced atomically).

def priority_of(vocab, task):
    """The task's priority, or the default for a missing or unknown one."""
    ids = [p["id"] for p in vocab["priorities"]]
    return task.get("priority") if task.get("priority") in ids else vocab["default_priority"]


def started_by(task):
    """started_by, or `agent` in files written before v4."""
    return task.get("started_by") or task.get("agent")


def summary(vocab, task):
    """The fields `list` shows, as a dict for --json."""
    fields = {
        "id": task.get("id"),
        "status": task.get("status"),
        "kind": kind_of(vocab, task.get("status")),
        "phase": task.get("phase"),
        "priority": priority_of(vocab, task),
        "labels": task.get("labels", []),
        "name": task.get("name", ""),
    }
    if isinstance(task.get("pr"), dict):
        fields["pr"] = task["pr"]
        fields["merged_at"] = task.get("merged_at")
    return fields


def in_open_pr(task):
    """In PR: a recorded PR, not merged yet (DM-4.3)."""
    return isinstance(task.get("pr"), dict) and not task.get("merged_at")


def ready_tasks(data):
    """To-do tasks whose dependencies are all done, in the loop's order."""
    vocab = vocabulary(data)
    ready = [
        t
        for t in data["tasks"]
        if kind_of(vocab, t.get("status")) == "todo" and not unfinished_dependencies(data, t)
    ]
    return sorted(ready, key=lambda t: (phase_of(t), priority_rank(vocab, t.get("priority")), natural_key(t.get("id"))))


def describe_task(data, task):
    """A task in full, as text: what an agent needs to work on it."""
    vocab = vocabulary(data)
    by_id = {t.get("id"): t for t in data["tasks"]}
    for d in task.get("dependencies") or []:
        if d not in by_id and archived_task(d):
            by_id[d] = {**archived_task(d), "status": archived_task(d).get("status") + ", archived"}
    labels = task.get("labels") or []
    lines = [
        f"{task.get('id')}  {task.get('name', '')}",
        f"  {task.get('status')} · phase {task.get('phase')} · {task.get('type')} · {priority_of(vocab, task)}"
        + (f" · labels: {', '.join(labels)}" if labels else ""),
    ]
    deps = task.get("dependencies") or []
    if deps:
        lines.append(
            "  depends on: " + ", ".join(f"{d} ({by_id[d].get('status')})" if d in by_id else f"{d} (missing)" for d in deps)
        )
    for key in ("requirements", "use_cases", "files"):
        if task.get(key):
            lines.append(f"  {key.replace('_', ' ')}: {', '.join(task[key])}")
    who = []
    for what, at, by in (
        ("created", "created_at", task.get("created_by")),
        ("started", "started_at", started_by(task)),
        ("review requested", "review_requested_at", None),
        ("completed", "completed_at", task.get("completed_by")),
    ):
        if task.get(at):
            who.append(f"{what} {task[at]}" + (f" by {by}" if by else ""))
    if who:
        lines.append("  " + " · ".join(who))
    if task.get("commit"):
        lines.append(f"  commit: {task['commit']}")
    description = (task.get("description") or "").strip()
    if description:
        lines.append("  description:")
        lines.extend("    " + line for line in description.splitlines())
    notes = task.get("notes") or []
    if notes:
        lines.append("  notes:")
        for n in notes:
            lines.append(f"    {n.get('at')} {n.get('kind')}" + (f" ({n['by']})" if n.get("by") else "") + f": {n.get('text')}")
    elif task.get("last_failure"):
        failure = task["last_failure"]
        lines.append(f"  last failure: {failure.get('at')}: {failure.get('reason')}")
    return "\n".join(lines)


def cmd_show(args):
    paths = find_paths(os.getcwd())
    data = load_tasks(paths)
    tasks = [find_task(data, task_id, archived=True) for task_id in args.ids]
    if args.json:
        out(to_json(tasks))
    else:
        out("\n\n".join(describe_task(data, t) for t in tasks))


def cmd_list(args):
    paths = find_paths(os.getcwd())
    data = load_tasks(paths)
    vocab = vocabulary(data)
    ready = {t.get("id") for t in ready_tasks(data)}
    tasks = []
    for t in load_archive(paths)["tasks"] if args.archived else data["tasks"]:
        kind = kind_of(vocab, t.get("status"))
        if args.status and t.get("status") not in args.status:
            continue
        if args.phase is not None and phase_of(t) != args.phase:
            continue
        if args.type and t.get("type") != args.type:
            continue
        if args.priority and priority_of(vocab, t) != args.priority:
            continue
        if args.label and not set(args.label) <= set(t.get("labels") or []):
            continue
        if args.agent and started_by(t) != args.agent:
            continue
        if args.ready and t.get("id") not in ready:
            continue
        if args.blocked and not (kind == "blocked" or (kind == "todo" and t.get("id") not in ready)):
            continue
        if args.in_pr and not in_open_pr(t):
            continue
        tasks.append(t)
    if args.json:
        out(to_json([summary(vocab, t) for t in tasks]))
        return
    if not tasks:
        out("No tasks match.")
        return
    id_width = max(len(str(t.get("id"))) for t in tasks)
    status_width = max(len(str(t.get("status"))) for t in tasks)
    for t in tasks:
        labels = t.get("labels") or []
        out(
            f"{str(t.get('id')).ljust(id_width)}  {str(t.get('status')).ljust(status_width)}  "
            f"{str(t.get('phase')).ljust(3)} {priority_of(vocab, t)}  "
            + (f"[{', '.join(labels)}] " if labels else "")
            + str(t.get("name", ""))
        )


def cmd_deps(args):
    paths = find_paths(os.getcwd())
    data = load_tasks(paths)
    task = find_task(data, args.id, archived=True)
    by_id = {t.get("id"): t for t in data["tasks"]}

    def dependency(d):
        found = by_id.get(d) or archived_task(d)
        if not found:
            return {"id": d, "status": "missing", "name": ""}
        return {"id": d, "status": found.get("status") + (", archived" if d not in by_id else ""), "name": found.get("name", "")}

    waits_for = [dependency(d) for d in task.get("dependencies") or []]
    waited_on_by = [
        {"id": t.get("id"), "status": t.get("status"), "name": t.get("name", "")}
        for t in data["tasks"]
        if args.id in (t.get("dependencies") or [])
    ]
    if args.json:
        out(to_json({"id": args.id, "waits_for": waits_for, "waited_on_by": waited_on_by}))
        return
    line = lambda items: ", ".join(f"{i['id']} ({i['status']})" for i in items) or "nothing"
    out(f"{args.id} waits for: {line(waits_for)}")
    out(f"{args.id} is waited on by: {line(waited_on_by)}")


ACTIVITY_FIELDS = ("updated_at", "started_at", "completed_at", "review_requested_at", "blocked_at", "skipped_at")
SUMMARY_DAYS = 14


def as_phase_id(phase):
    return int(phase) if isinstance(phase, float) and phase.is_integer() else phase


def parse_time(text):
    try:
        return parse_iso(text) if isinstance(text, str) else None
    except ValueError:
        return None


RECENT_PHASES = 4


def recent_phases(tasks, kinds, open_phases, names):
    """Up to four phases for the overview's rings, in phase order: the lowest phases with open work first, then the
    most recently finished ones (by their last completed_at) to fill up. A phase of only skipped tasks has nothing to
    show and is left out."""
    chosen = list(open_phases[:RECENT_PHASES])
    finished = {}  # finished phase -> its last completion ("" when none is recorded)
    for t, k in zip(tasks, kinds):
        phase = phase_of(t)
        if phase in open_phases or k != "done":
            continue
        finished[phase] = max(finished.get(phase, ""), t.get("completed_at") or "")
    for phase in sorted(finished, key=lambda p: (finished[p], p), reverse=True)[: RECENT_PHASES - len(chosen)]:
        chosen.append(phase)
    result = []
    for phase in sorted(chosen):
        in_phase = [k for t, k in zip(tasks, kinds) if phase_of(t) == phase]
        done, total = in_phase.count("done"), len(in_phase) - in_phase.count("skipped")
        result.append({
            "id": as_phase_id(phase),
            "name": names.get(phase) or None,
            "done": done,
            "total": total,
            "percent": round(100 * done / total),
        })
    return result


def project_summary(paths):
    """A project's numbers for the dashboard's overview and project selector (docs/multi-project-api.md, 3.2), by
    status kind as atm counts them everywhere else: done / (total - skipped), the current phase, live claims, what
    needs the user, the latest activity and the completions of the last 14 days."""
    data = load_tasks(paths)
    vocab = vocabulary(data)
    tasks = data["tasks"]
    kinds = [kind_of(vocab, t.get("status")) for t in tasks]
    done, skipped = kinds.count("done"), kinds.count("skipped")
    counted = len(tasks) - skipped
    percent = round(100 * done / counted) if counted else (100 if skipped else 0)

    current_phase = None
    open_phases = sorted({phase_of(t) for t, k in zip(tasks, kinds) if k not in ("done", "skipped")})
    names = {p.get("id"): p.get("name") for p in vocab["phases"]}
    if open_phases:
        phase = open_phases[0]
        in_phase = [k for t, k in zip(tasks, kinds) if phase_of(t) == phase]
        current_phase = {
            "id": as_phase_id(phase),
            "name": names.get(phase) or None,
            "done": in_phase.count("done"),
            "total": len(in_phase) - in_phase.count("skipped"),
        }

    current = now()
    claims = read_store(paths)["claims"].values()
    agents_working = sum(
        1 for c in claims if isinstance(c, dict) and (parse_time(c.get("lease_expires_at")) or current) > current
    )

    times = [parse_time(t.get(f)) for t in tasks for f in ACTIVITY_FIELDS]
    times += [parse_time(n.get("at")) for t in tasks for n in t.get("notes") or [] if isinstance(n, dict)]
    times = [t for t in times if t]
    last = max(times) if times else None

    completions = [0] * SUMMARY_DAYS
    today = current.date()
    for t, k in zip(tasks, kinds):
        finished = parse_time(t.get("completed_at")) if k == "done" else None
        if finished:
            age = (today - finished.date()).days
            if 0 <= age < SUMMARY_DAYS:
                completions[SUMMARY_DAYS - 1 - age] += 1

    return {
        "total": len(tasks),
        "done": done,
        "skipped": skipped,
        "percent": percent,
        "current_phase": current_phase,
        "recent_phases": recent_phases(tasks, kinds, open_phases, names),
        "agents_working": agents_working,
        "needs_you": {
            "review": kinds.count("review"),
            "blocked_on_user": sum(1 for t, k in zip(tasks, kinds) if k == "blocked" and t.get("waiting_on") == "user"),
        },
        "last_activity": last.strftime("%Y-%m-%dT%H:%M:%SZ") if last else None,
        "completions_14d": completions,
    }


def cmd_status(args):
    paths = find_paths(os.getcwd())
    data = load_tasks(paths)
    vocab = vocabulary(data)
    store = read_store(paths)
    tasks = data["tasks"]

    def counts(key):
        result = {}
        for t in tasks:
            for value in key(t):
                result[str(value)] = result.get(str(value), 0) + 1
        return result

    status_order = [s["id"] for s in vocab["statuses"]]
    by_status = counts(lambda t: [t.get("status")])
    by_status = {s: by_status[s] for s in status_order if s in by_status} | {
        s: n for s, n in by_status.items() if s not in status_order
    }
    in_progress = [
        {
            "id": t.get("id"),
            "name": t.get("name", ""),
            "by": (store["claims"].get(t.get("id")) or {}).get("agent") or started_by(t),
        }
        for t in tasks
        if kind_of(vocab, t.get("status")) == "active"
    ]
    waiting = [
        {"id": t.get("id"), "name": t.get("name", ""), "on": [d for d, _ in unfinished_dependencies(data, t)]}
        for t in tasks
        if kind_of(vocab, t.get("status")) == "todo" and unfinished_dependencies(data, t)
    ]
    blocked = [
        {"id": t.get("id"), "name": t.get("name", ""), "waiting_on": t.get("waiting_on"), "questions": t.get("questions", [])}
        for t in tasks
        if kind_of(vocab, t.get("status")) == "blocked"
    ]
    in_review = [
        {"id": t.get("id"), "name": t.get("name", ""), "since": t.get("review_requested_at")}
        for t in tasks
        if kind_of(vocab, t.get("status")) == "review"
    ]
    nxt, reason = next_task(data, store)
    sizes = sorted(((len(json.dumps(t, ensure_ascii=False)), t.get("id")) for t in tasks), reverse=True)
    result = {
        "tasks": len(tasks),
        "by_status": by_status,
        "by_phase": counts(lambda t: [t.get("phase")]),
        "phase_names": {str(as_phase_id(p["id"])): p["name"] for p in vocab["phases"] if p.get("name")},
        "by_type": counts(lambda t: [t.get("type")]),
        "by_label": counts(lambda t: t.get("labels") or []),
        "in_progress": in_progress,
        "in_review": in_review,
        "blocked": blocked,
        "waiting_on_dependencies": waiting,
        "next": {"id": nxt.get("id"), "name": nxt.get("name", "")} if nxt else None,
        "next_reason": reason,
        "file_bytes": os.path.getsize(paths["tasks"]),
        "largest_tasks": [{"id": task_id, "bytes": size} for size, task_id in sizes[:3]],
        "archived": len(load_archive(paths)["tasks"]),
        "archive_bytes": os.path.getsize(archive_path(paths)) if os.path.isfile(archive_path(paths)) else 0,
    }
    hint = archive_hint(paths, data)
    if hint:
        result["suggest"] = {"archive": hint}
    if args.json:
        out(to_json(result))
        return
    pairs = lambda d: ", ".join(f"{k} {v}" for k, v in d.items())
    out(f"{len(tasks)} tasks: {pairs(by_status)}")
    names = result["phase_names"]
    out("by phase: " + ", ".join(f"{k}{f' ({names[k]})' if k in names else ''} {v}" for k, v in result["by_phase"].items()))
    out(f"by type: {pairs(result['by_type'])}")
    if result["by_label"]:
        out(f"by label: {pairs(result['by_label'])}")
    for title, items, extra in (
        ("in progress", in_progress, lambda i: f" ({i['by']})" if i["by"] else ""),
        ("in review", in_review, lambda i: f" (since {i['since']})" if i["since"] else ""),
        ("blocked", blocked, lambda i: f" (on {i['waiting_on']})" if i["waiting_on"] else ""),
        ("waiting on dependencies", waiting, lambda i: f" (on {', '.join(i['on'])})"),
    ):
        if items:
            out(f"{title}: " + "; ".join(f"{i['id']} {i['name']}{extra(i)}" for i in items))
    out(f"next: {nxt.get('id')} {nxt.get('name', '')}" if nxt else f"next: none ({reason})")
    largest = ", ".join(f"{i['id']} {i['bytes'] // 1024 or 1} KB" for i in result["largest_tasks"])
    out(f"file: {result['file_bytes'] // 1024} KB" + (f"; largest tasks: {largest}" if largest else ""))
    if result["archived"]:
        out(f"archive: {result['archived']} tasks, {result['archive_bytes'] // 1024} KB")
    if hint:
        out(hint["text"])


# ==== tasks.py ====
# The status commands (start, review, done, fail, release, reject) and notes.

# The commands an agent runs on its own claimed task: if that claim just expired, they explain it instead of refusing
OWN_LEASE_COMMANDS = ("done", "release", "fail", "review", "block")


def cmd_status_change(command):
    def run(args):
        task_id, agent = args.id, agent_identity(args.agent)
        paths = find_paths(os.getcwd())
        with locked_with_claims(paths):
            data = load_tasks(paths)
            store = read_store(paths)
            claims = store["claims"]
            expired = expire_claims(paths, data, claims)
            task = find_task(data, task_id)
            if command in OWN_LEASE_COMMANDS:
                own = own_lease_expired(expired, data, task_id, agent, f"atm {command} {task_id}")
                if own:
                    # Write the expiry first, so `atm show` agrees with the error
                    write_json_atomic(paths["tasks"], data)
                    write_store(paths, store)
                    raise own
            check_holder(claims, task_id, agent, command)
            previous = change_status(
                task,
                data,
                command,
                reason=getattr(args, "reason", None),
                agent=agent,
                status=args.status,
                note=getattr(args, "note", None),
                commit=getattr(args, "commit", None),
                waiting_on=getattr(args, "on", None),
                questions=getattr(args, "question", None) or [],
                answers=getattr(args, "answer", None) or [],
            )
            if command == "start":
                claims[task_id] = new_claim(paths, data, task_id, agent)
                store["completed"].pop(task_id, None)  # starting a task again on purpose
            elif command == "reopen":
                claims.pop(task_id, None)
                store["completed"].pop(task_id, None)  # not done any more, in any worktree
            else:
                claims.pop(task_id, None)
            if command == "done":
                store["completed"][task_id] = completion(paths, task_id, agent)
            unblocked = newly_ready(data, task_id) if command == "done" else []
            write_json_atomic(paths["tasks"], data)
            # The archive hint after done, at most once a day per clone (CLI-5.2), so a loop doesn't repeat it
            hint = archive_hint(paths, data) if command == "done" else None
            today = now_iso()[:10]
            if hint and store["hints"].get("archive") == today:
                hint = None
            if hint:
                store["hints"]["archive"] = today
            write_store(paths, store)
        report_expired(expired)
        if args.json:
            extra = {"unblocked": unblocked} if command == "done" else {}
            if hint:
                extra["suggest"] = {"archive": hint}
            out(to_json({**task, "claim": claims.get(task_id), **extra}))
            return
        # New lines only after the existing one (CLI-3.2)
        out(f"{task['id']}: {previous} -> {task['status']}")
        if command == "start":
            out(describe_task(data, task))
        if unblocked:
            out("Now ready: " + ", ".join(unblocked))
        if hint:
            out(hint["text"])

    return run


def newly_ready(data, task_id):
    """The to-do tasks waiting on `task_id` whose dependencies are now all done."""
    ready = {t.get("id") for t in ready_tasks(data)}
    return [t.get("id") for t in data["tasks"] if task_id in (t.get("dependencies") or []) and t.get("id") in ready]


def cmd_note(args):
    """Add a note to a task, whatever its status (DM-4)."""
    agent = agent_identity(args.agent)
    paths = find_paths(os.getcwd())
    with locked(paths["dir"]):
        data = load_tasks(paths)
        task = find_task(data, args.id)
        stamp = now_iso()
        add_note(task, "note", args.text, agent, stamp)
        touch(task, agent, stamp)
        write_json_atomic(paths["tasks"], data)
    if args.json:
        out(to_json(task["notes"][-1]))
    else:
        out(f"{task['id']}: note added ({len(task['notes'])} in all)")


# ==== edit.py ====
# Adding and changing tasks: atm add (one task, or many from a JSON file), atm edit, and atm check. IDs come from
# meta.next_id under the lock, so two agents adding at once never get the same one (docs/v4/data-model.md DM-2.3).
# Status and timestamps are not edited here: they change only through the status commands.

LABEL = re.compile(r"^[a-z0-9_-]{1,32}$")
ID_PATTERN = re.compile(r"^(.*?)(\d+)$")
DEFAULT_ID = ("T-", 3)


def id_format(data):
    """The project's ID pattern: the prefix and digit count of its last numbered task ID (T-001: "T-", 3)."""
    for task in reversed(data["tasks"]):
        m = ID_PATTERN.match(str(task.get("id", "")))
        if m:
            return m.group(1), len(m.group(2))
    return DEFAULT_ID


def highest_number(data, prefix):
    numbers = [
        int(m.group(2))
        for m in (ID_PATTERN.match(str(t.get("id", ""))) for t in data["tasks"])
        if m and m.group(1) == prefix
    ]
    return max(numbers, default=0)


def next_number(data):
    """meta.next_id, but never behind the highest ID in the file (tasks added by hand, or by an older atm)."""
    prefix, _ = id_format(data)
    stored = data.get("meta", {}).get("next_id") if isinstance(data.get("meta"), dict) else None
    floor = highest_number(data, prefix) + 1
    return max(stored, floor) if isinstance(stored, int) and not isinstance(stored, bool) else floor


def allocate_ids(data, count):
    """`count` new IDs in the project's pattern; advances meta.next_id."""
    prefix, width = id_format(data)
    first = next_number(data)
    ids = [prefix + str(n).zfill(width) for n in range(first, first + count)]
    if not isinstance(data.get("meta"), dict):
        data["meta"] = {}
    data["meta"]["next_id"] = first + count
    return ids


def check_labels(labels):
    for label in labels:
        if not isinstance(label, str) or not LABEL.match(label):
            raise AtmError(
                f"label {label!r}: use lowercase letters, digits, - and _ (at most 32 characters)", 2
            )
    return labels


def number(value, what):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise AtmError(f"{what} must be a number", 2)
    return int(value) if float(value).is_integer() else value


def new_task(vocab, fields, actor, stamp):
    """A complete new task from the given fields, checked against the vocabularies."""
    for key in ("name", "phase", "type"):
        if fields.get(key) in (None, ""):
            raise AtmError(f"a new task needs a {key}", 2)
    types = [t["id"] for t in vocab["types"]]
    if fields["type"] not in types:
        raise AtmError(f"unknown type {fields['type']!r}; use one of {', '.join(types)}", 2)
    priorities = [p["id"] for p in vocab["priorities"]]
    if fields.get("priority") is not None and fields["priority"] not in priorities:
        raise AtmError(f"unknown priority {fields['priority']!r}; use one of {', '.join(priorities)}", 2)
    task = {
        "id": None,
        "name": str(fields["name"]),
        "phase": number(fields["phase"], "phase"),
        "type": fields["type"],
    }
    if fields.get("priority") is not None:
        task["priority"] = fields["priority"]
    labels = check_labels(list(fields.get("labels") or []))
    if labels:
        task["labels"] = labels
    task.update(
        {
            "description": str(fields.get("description") or ""),
            "requirements": list(fields.get("requirements") or []),
            "use_cases": list(fields.get("use_cases") or []),
            "status": status_for(vocab, "todo"),
            "dependencies": list(fields.get("dependencies") or []),
            "files": list(fields.get("files") or []),
            "created_at": stamp,
            "updated_at": stamp,
        }
    )
    if actor:
        task["created_by"] = actor
        task["updated_by"] = actor
    return task


def find_cycle(tasks):
    """A dependency cycle among `tasks` (as a list of IDs), or None."""
    deps = {t["id"]: t.get("dependencies") or [] for t in tasks}
    state = {}

    def visit(node, path):
        state[node] = "visiting"
        for dep in deps.get(node, []):
            if state.get(dep) == "visiting":
                return path[path.index(dep):] + [dep] if dep in path else [node, dep]
            if dep in deps and dep not in state:
                cycle = visit(dep, path + [dep])
                if cycle:
                    return cycle
        state[node] = "done"
        return None

    for node in deps:
        if node not in state:
            cycle = visit(node, [node])
            if cycle:
                return cycle
    return None


def add_tasks(data, entries, actor):
    """Add `entries` (dicts of task fields; an "id" there is a placeholder other entries' dependencies may use) to
    `data`. Returns the new tasks. Raises AtmError, before changing anything, if one is invalid."""
    vocab = vocabulary(data)
    stamp = now_iso()
    tasks = [new_task(vocab, e, actor, stamp) for e in entries]
    placeholders = [e.get("id") for e in entries]
    for p in placeholders:
        if p is not None and placeholders.count(p) > 1:
            raise AtmError(f"placeholder ID {p!r} is used twice", 2)
    ids = allocate_ids(data, len(tasks))
    rename = {p: real for p, real in zip(placeholders, ids) if p is not None}
    existing = {t.get("id") for t in data["tasks"]}
    for task, real in zip(tasks, ids):
        task["id"] = real
        task["dependencies"] = [rename.get(d, d) for d in task["dependencies"]]
        missing = [d for d in task["dependencies"] if d not in existing and d not in ids]
        if missing:
            raise AtmError(f"{real} ({task['name']}) depends on {', '.join(missing)}, which doesn't exist", 2)
    cycle = find_cycle(data["tasks"] + tasks)
    if cycle:
        raise AtmError("these dependencies would make a cycle: " + " -> ".join(cycle), 2)
    data["tasks"].extend(tasks)
    return tasks


def read_entries(path):
    """The tasks of an `atm add --json-file`: a list of task objects, or {"tasks": [...]}."""
    value = read_json(path)
    if isinstance(value, dict):
        value = value.get("tasks")
    if not isinstance(value, list) or not all(isinstance(e, dict) for e in value):
        raise AtmError(f"{path}: expected a JSON list of tasks (or {{\"tasks\": [...]}})", 2)
    return value


def cmd_add(args):
    actor = agent_identity(args.agent)
    if args.json_file:
        entries = read_entries(args.json_file)
    else:
        description = args.description
        if args.description_file:
            with open(args.description_file, encoding="utf-8") as f:
                description = f.read()
        entries = [
            {
                "name": args.name,
                "phase": args.phase,
                "type": args.type,
                "priority": args.priority,
                "labels": args.label,
                "description": description,
                "dependencies": args.dep,
                "files": args.file,
                "requirements": args.requirement,
            }
        ]
    paths = find_paths(os.getcwd())
    with locked(paths["dir"]):
        data = load_tasks(paths)
        tasks = add_tasks(data, entries, actor)
        write_json_atomic(paths["tasks"], data)
    if args.json:
        out(to_json(tasks))
    else:
        for task in tasks:
            out(f"Added {task['id']} {task['name']}")


def edit_task(data, task, args):
    """Apply atm edit's options to `task`; returns the names of the fields that changed. Raises AtmError (nothing
    changed yet in the file) when a value is invalid."""
    vocab = vocabulary(data)
    changed = []

    def set_field(key, value):
        if task.get(key) != value:
            task[key] = value
            changed.append(key)

    def edit_list(key, add, remove):
        current = list(task.get(key) or [])
        updated = [v for v in current if v not in remove] + [v for v in add if v not in current]
        if updated != current:
            task[key] = updated
            changed.append(key)

    if args.name is not None:
        set_field("name", args.name)
    description = args.description
    if args.description_file:
        with open(args.description_file, encoding="utf-8") as f:
            description = f.read()
    if description is not None:
        set_field("description", description)
    if args.phase is not None:
        set_field("phase", number(args.phase, "phase"))
    if args.type is not None:
        types = [t["id"] for t in vocab["types"]]
        if args.type not in types:
            raise AtmError(f"unknown type {args.type!r}; use one of {', '.join(types)}", 2)
        set_field("type", args.type)
    if args.priority is not None:
        priorities = [p["id"] for p in vocab["priorities"]]
        if args.priority not in priorities:
            raise AtmError(f"unknown priority {args.priority!r}; use one of {', '.join(priorities)}", 2)
        set_field("priority", args.priority)
    edit_list("files", args.add_file, args.remove_file)
    edit_list("labels", check_labels(args.add_label), args.remove_label)
    ids = {t.get("id") for t in data["tasks"]}
    missing = [d for d in args.add_dep if d not in ids]
    if missing:
        raise AtmError(f"{task['id']} can't depend on {', '.join(missing)}, which doesn't exist", 2)
    if task["id"] in args.add_dep:
        raise AtmError(f"{task['id']} can't depend on itself", 2)
    edit_list("dependencies", args.add_dep, args.remove_dep)
    cycle = find_cycle(data["tasks"])
    if cycle:
        raise AtmError("these dependencies would make a cycle: " + " -> ".join(cycle), 2)
    return changed


def cmd_edit(args):
    actor = agent_identity(args.agent)
    paths = find_paths(os.getcwd())
    with locked(paths["dir"]):
        data = load_tasks(paths)
        task = find_task(data, args.id)
        changed = edit_task(data, task, args)
        if changed:
            touch(task, actor, now_iso())
            write_json_atomic(paths["tasks"], data)
    if args.json:
        out(to_json(task))
    elif changed:
        out(f"{task['id']}: changed {', '.join(changed)}")
    else:
        out(f"{task['id']}: nothing changed")


def check_data(data, root, files=False, archived=()):
    """Problems in a task file: (errors, warnings), each a list of messages. `archived` are the archive's tasks:
    dependencies on them are fine, and an ID in both files is an error. With `files`, also a warning for each file a
    finished task lists that doesn't exist (often just history: files get renamed and deleted later)."""
    errors, warnings = [], []
    archived_ids = {t.get("id") for t in archived if isinstance(t, dict)}
    try:
        vocab = vocabulary(data)
    except AtmError as e:
        errors.append(str(e))
        vocab = vocabulary({})
    tasks = data.get("tasks", [])
    ids = [t.get("id") for t in tasks if isinstance(t, dict)]
    for task_id in sorted({i for i in ids if ids.count(i) > 1}, key=str):
        errors.append(f"{task_id}: the ID is used by {ids.count(task_id)} tasks")
    for task_id in sorted(set(ids) & archived_ids, key=str):
        errors.append(f"{task_id}: in both tasks.json and the archive (atm archive keeps the tasks.json copy)")
    known_ids = set(ids) | archived_ids
    statuses = {s["id"] for s in vocab["statuses"]}
    types = {t["id"] for t in vocab["types"]}
    priorities = {p["id"] for p in vocab["priorities"]}
    for i, task in enumerate(tasks):
        if not isinstance(task, dict) or not isinstance(task.get("id"), str) or not task["id"]:
            errors.append(f"task #{i + 1}: needs an \"id\" (a non-empty string)")
            continue
        task_id = task["id"]
        for key, kind in (("name", str), ("type", str), ("status", str)):
            if not isinstance(task.get(key), kind):
                errors.append(f"{task_id}: needs a {key!r} (a string)")
        phase = task.get("phase")
        if isinstance(phase, bool) or not isinstance(phase, (int, float)):
            errors.append(f"{task_id}: needs a \"phase\" (a number)")
        if isinstance(task.get("status"), str) and kind_of(vocab, task["status"]) is None:
            errors.append(f"{task_id}: the status {task['status']!r} is not one of the project's statuses")
        if isinstance(task.get("type"), str) and task["type"] not in types:
            warnings.append(f"{task_id}: the type {task['type']!r} is not one of the project's types")
        if "priority" in task and task["priority"] not in priorities:
            warnings.append(f"{task_id}: the priority {task['priority']!r} is not one of the project's priorities")
        for key in ("dependencies", "files", "labels", "requirements", "use_cases"):
            if key in task and not (isinstance(task[key], list) and all(isinstance(v, str) for v in task[key])):
                errors.append(f"{task_id}: {key!r} must be a list of strings")
        for dep in task.get("dependencies") or []:
            if isinstance(dep, str) and dep not in known_ids:
                errors.append(f"{task_id}: depends on {dep}, which doesn't exist")
        for label in task.get("labels") or []:
            if isinstance(label, str) and not LABEL.match(label):
                errors.append(f"{task_id}: the label {label!r} isn't lowercase letters, digits, - and _")
        # Tasks list the files they will create, so only a finished task's missing files are worth a word
        if files and kind_of(vocab, task.get("status")) == "done":
            for f in task.get("files") or []:
                if isinstance(f, str) and not os.path.exists(os.path.join(root, f)):
                    warnings.append(f"{task_id}: the file {f} doesn't exist")
    used = {phase_of(t) for t in list(tasks) + list(archived) if isinstance(t, dict)}
    for p in vocab["phases"]:
        if p["id"] not in used:
            warnings.append(f"phase {p['id']} is named ({p.get('name')!r}) but has no tasks (atm phases unname)")
    well_formed = [t for t in tasks if isinstance(t, dict) and isinstance(t.get("dependencies", []), list)]
    cycle = find_cycle([{"id": t.get("id"), "dependencies": t.get("dependencies") or []} for t in well_formed])
    if cycle:
        errors.append("dependency cycle: " + " -> ".join(str(c) for c in cycle))
    return errors, warnings


def cmd_check(args):
    paths = find_paths(os.getcwd())
    if not os.path.isfile(paths["tasks"]):
        raise AtmError(f"no tasks.json in {paths['dir']}. Run /atm:create-tasks first.")
    data = read_json(paths["tasks"])
    if not isinstance(data, dict) or not isinstance(data.get("tasks"), list):
        errors, warnings = ["tasks.json is not a task file (expected an object with a 'tasks' list)"], []
    else:
        try:
            archived = load_archive(paths)["tasks"]
        except AtmError as e:
            archived = []
            errors_before = [str(e)]
        else:
            errors_before = []
        errors, warnings = check_data(data, paths["root"], files=args.files, archived=archived)
        errors = errors_before + errors
    if args.json:
        out(to_json({"errors": errors, "warnings": warnings}))
    else:
        for e in errors:
            out(f"error: {e}")
        for w in warnings:
            out(f"warning: {w}")
        if not errors:
            count = len(data["tasks"])
            out(f"tasks.json is fine ({count} tasks" + (f", {len(warnings)} warnings)" if warnings else ")"))
    if errors:
        raise AtmExit(1)


# ==== phases.py ====
# `atm phases`: the project's phases, with their names (meta.phases) and how far along each one is; and naming one
# phase at a time, so naming a phase never means rewriting (or first having to read) the whole list.

def phase_number(text):
    """A phase number from the command line: 15, or 1.5; an int when it is whole."""
    try:
        value = float(text)
    except (TypeError, ValueError):
        raise AtmError(f"{text!r} is not a phase number", 2)
    return int(value) if value.is_integer() else value


def phase_overview(data, archived=()):
    """Every phase that has tasks or a name, in order: {id, name, tasks, by_kind}."""
    vocab = vocabulary(data)
    names = {p["id"]: p.get("name") for p in vocab["phases"]}
    phases = {}
    for task in list(data["tasks"]) + list(archived):
        if not isinstance(task, dict):
            continue
        entry = phases.setdefault(phase_of(task), {kind: 0 for kind in KINDS})
        kind = kind_of(vocab, task.get("status"))
        if kind in entry:
            entry[kind] += 1
    for phase_id in names:
        phases.setdefault(phase_id, {kind: 0 for kind in KINDS})
    return [
        {
            "id": phase_number(phase_id),
            "name": names.get(phase_id) or None,
            "tasks": sum(counts.values()),
            "by_kind": {kind: n for kind, n in counts.items() if n},
        }
        for phase_id, counts in sorted(phases.items())
    ]


def describe_phase(p):
    counts = ", ".join(f"{kind} {n}" for kind, n in p["by_kind"].items())
    title = f"phase {p['id']}" + (f" · {p['name']}" if p["name"] else "")
    return f"{title}: {p['tasks']} task{'' if p['tasks'] == 1 else 's'}" + (f" ({counts})" if counts else "")


def phases_list(paths, archived, as_json):
    data = load_tasks(paths)
    phases = phase_overview(data, load_archive(paths)["tasks"] if archived else ())
    if as_json:
        out(to_json(phases))
        return
    if not phases:
        out("No phases yet: no task has a phase, and none is named.")
    for p in phases:
        out(describe_phase(p))


def set_phase_name(paths, number, name):
    """Set (name) or remove (None) the name of one phase under the lock, leaving the others as they are. Returns the
    previous name."""
    with locked(paths["dir"]):
        data = load_tasks(paths)
        meta = data.setdefault("meta", {})
        phases = [p for p in meta.get("phases") or [] if isinstance(p, dict)]
        previous = next((p.get("name") for p in phases if p.get("id") == number), None)
        if name is None and previous is None:
            raise AtmError(f"phase {number} has no name")
        phases = [p for p in phases if p.get("id") != number]
        if name is not None:
            phases.append({"id": number, "name": name})
        phases.sort(key=lambda p: p["id"])
        if phases:
            meta["phases"] = phases
        else:
            meta.pop("phases", None)
        vocabulary(data)
        write_json_atomic(paths["tasks"], data)
    return previous


def cmd_phases(args):
    paths = find_paths(os.getcwd())
    if args.action in (None, "list"):
        if args.number is not None:
            raise AtmError(f"unexpected argument '{args.number}'", 2)
        phases_list(paths, args.archived, args.json)
        return
    if args.number is None:
        raise AtmError(f"atm phases {args.action} needs a phase number", 2)
    number = phase_number(args.number)
    if args.action == "name":
        name = (args.name or "").strip()
        if not name:
            raise AtmError('atm phases name needs a name: atm phases name <n> "<name>"', 2)
        previous = set_phase_name(paths, number, name)
        if args.json:
            out(to_json({"id": number, "name": name, "previous": previous}))
        elif previous is None:
            out(f"Phase {number} is now named “{name}”.")
        elif previous == name:
            out(f"Phase {number} was already named “{name}”.")
        else:
            out(f"Phase {number} renamed from “{previous}” to “{name}”.")
        return
    if args.name is not None:
        raise AtmError(f"unexpected argument '{args.name}'", 2)
    previous = set_phase_name(paths, number, None)
    if args.json:
        out(to_json({"id": number, "name": None, "previous": previous}))
    else:
        out(f"Phase {number} no longer has a name (it was “{previous}”).")


# ==== merge.py ====
# Merging tasks.json, and `atm init`.
#
# Registered as a git merge driver (`tasks.json merge=atm`), so branches that changed tasks.json merge task by task
# instead of line by line. Design: docs/parallel-agents-design.md, option E and layer L3.

# What `atm` means is not in this file: git config can't be committed, so each clone registers the driver in its own
# .git/config (merge.atm.driver), which the atm skills do on every run. A clone without it merges tasks.json normally.
GITATTRIBUTES_LINES = (
    "# 'atm' is defined in each clone's git config (merge.atm.driver), registered by the atm plugin on every run.\n"
    "# Without it, git merges tasks.json line by line as usual.\n"
    "tasks.json merge=atm\n"
)
# Fields that move with the status: they come from the side whose progress wins
PROGRESS_FIELDS = (
    "status",
    "updated_at",
    "started_at",
    "completed_at",
    "skipped_at",
    "last_failure",
    "agent",
    "started_by",
    "completed_by",
    "updated_by",
    "commit",
    "review_requested_at",
    "waiting_on",
    "questions",
    "blocked_at",
)
# How far along a status's kind is (DM-3.3); a status without a kind ranks like todo
KIND_RANK = {"todo": 0, "active": 1, "blocked": 1, "review": 1, "done": 2, "skipped": 2}
MISSING = object()


def merge_vocabulary(*versions):
    """The vocabulary to rank statuses by: this branch's, else the other's, else the defaults. A merge never fails
    over a vocabulary; the next atm command reports it."""
    for data in versions:
        try:
            return vocabulary(data)
        except AtmError:
            continue
    return vocabulary({})


def merge_value(base, ours, theirs):
    """Three-way merge of one value: (value, conflict). On conflict, ours is kept."""
    if ours == theirs:
        return ours, False
    if ours == base:
        return theirs, False
    if theirs == base:
        return ours, False
    return ours, True


def progress_winner(ours, theirs, vocab):
    """Both sides moved a task along: the one further along wins, then the newer update, then ours."""
    rank = lambda task: KIND_RANK.get(kind_of(vocab, task.get("status")), 0)
    rank_o, rank_t = rank(ours), rank(theirs)
    if rank_o != rank_t:
        return ours if rank_o > rank_t else theirs
    return theirs if str(theirs.get("updated_at", "")) > str(ours.get("updated_at", "")) else ours


def merge_notes(ours, theirs):
    """Notes only grow: both sides' notes, each once, oldest first."""
    merged = list(ours) + [n for n in theirs if n not in ours]
    return sorted(merged, key=lambda n: str(n.get("at", "")) if isinstance(n, dict) else "")


def merge_task(base, ours, theirs, vocab):
    """Merge one task changed on both sides. Returns (task, names of conflicting fields)."""
    changed = lambda side: any(side.get(f, MISSING) != base.get(f, MISSING) for f in PROGRESS_FIELDS)
    if not changed(theirs):
        progress = ours
    elif not changed(ours):
        progress = theirs
    else:
        progress = progress_winner(ours, theirs, vocab)
    keys = list(ours) + [k for k in theirs if k not in ours] + [k for k in base if k not in ours and k not in theirs]
    merged, conflicts = {}, []
    for key in keys:
        if key in PROGRESS_FIELDS:
            value = progress.get(key, MISSING)
        elif key == "notes":
            value = merge_notes(ours.get(key, []), theirs.get(key, []))
        else:
            value, conflict = merge_value(base.get(key, MISSING), ours.get(key, MISSING), theirs.get(key, MISSING))
            if conflict:
                conflicts.append(key)
        if value is not MISSING:
            merged[key] = value
    return merged, conflicts


def next_free_id(task_id, used):
    m = re.match(r"^(.*?)(\d+)$", task_id)
    if not m:
        n = 2
        while f"{task_id}-{n}" in used:
            n += 1
        return f"{task_id}-{n}"
    prefix, digits = m.group(1), m.group(2)
    numbers = [int(x[len(prefix) :]) for x in used if x.startswith(prefix) and x[len(prefix) :].isdigit()]
    return prefix + str(max(numbers) + 1).zfill(len(digits))


def merge_task_files(base, ours, theirs):
    """Merge three versions of tasks.json. Returns (merged data, list of conflict descriptions)."""
    by_id = lambda data: {t.get("id"): t for t in data.get("tasks", [])}
    vocab = merge_vocabulary(ours, theirs)
    base_tasks, our_tasks, their_tasks = by_id(base), by_id(ours), by_id(theirs)
    used = set(base_tasks) | set(our_tasks) | set(their_tasks)
    conflicts, merged_tasks, renamed, theirs_new = [], [], {}, []

    for task in ours.get("tasks", []):
        task_id = task.get("id")
        b, t = base_tasks.get(task_id), their_tasks.get(task_id)
        if b is None:
            merged_tasks.append(task)  # added here (if added there too, theirs is renumbered below)
        elif t is None:
            if task != b:
                conflicts.append(f"{task_id}: changed on this branch, deleted on the other")
                merged_tasks.append(task)
        else:
            merged, fields = merge_task(b, task, t, vocab)
            merged_tasks.append(merged)
            if fields:
                conflicts.append(f"{task_id}: both branches changed {', '.join(fields)}")

    for task in theirs.get("tasks", []):
        task_id = task.get("id")
        if task_id in base_tasks:
            if task_id not in our_tasks and task != base_tasks[task_id]:
                conflicts.append(f"{task_id}: deleted on this branch, changed on the other")
                merged_tasks.append(task)
            continue
        if task_id in our_tasks:
            if our_tasks[task_id] == task:
                continue  # the same task added on both sides
            new_id = next_free_id(task_id, used)
            used.add(new_id)
            renamed[task_id] = new_id
            task = {**task, "id": new_id}
        theirs_new.append(task)
    for task in theirs_new:
        if renamed and task.get("dependencies"):
            task = {**task, "dependencies": [renamed.get(d, d) for d in task["dependencies"]]}
        merged_tasks.append(task)

    result = {}
    for key in list(ours) + [k for k in theirs if k not in ours]:
        if key == "tasks":
            result[key] = merged_tasks
        elif key == "meta" and isinstance(ours.get(key), dict) and isinstance(theirs.get(key), dict):
            b, o, t = base.get(key) or {}, ours[key], theirs[key]
            meta = {}
            for k in list(o) + [k for k in t if k not in o]:
                value, _ = merge_value(b.get(k, MISSING), o.get(k, MISSING), t.get(k, MISSING))
                if value is not MISSING:
                    meta[k] = value
            result[key] = meta
        else:
            result[key] = ours.get(key, theirs.get(key))
    return result, conflicts


def cmd_merge_driver(args):
    base_path, ours_path, theirs_path = args.base, args.ours, args.theirs
    versions = [read_json(p) for p in (base_path, ours_path, theirs_path)]
    if versions[0] is None and os.path.exists(base_path) and os.path.getsize(base_path) == 0:
        versions[0] = {"tasks": []}  # the file was added on both branches
    if not all(isinstance(v, dict) and isinstance(v.get("tasks", []), list) for v in versions):
        raise AtmError("tasks.json merge: one side is not valid JSON; resolve the conflict by hand")
    merged, conflicts = merge_task_files(*versions)
    write_json_atomic(ours_path, merged)
    if args.json:
        out(to_json({"conflicts": conflicts}))
    if conflicts:
        sys.stderr.write("atm: tasks.json has conflicting edits (this branch's version was kept):\n")
        for conflict in conflicts:
            sys.stderr.write(f"  {conflict}\n")
        raise AtmExit(1)


def launcher_command():
    launcher = os.path.join(SCRIPT_DIR, "atm").replace("'", "'\\''")
    return f"'{launcher}' merge-driver %O %A %B"


def ensure_merge_driver(paths):
    """In git: `tasks.json merge=atm` in the task folder's .gitattributes (staged when added), and the driver
    registered in the clone's config, pointing at this plugin's launcher. Returns True if .gitattributes changed."""
    root = paths["root"]
    if not in_git(root):
        return False
    for key, value in (("merge.atm.name", "atm: merge tasks.json task by task"), ("merge.atm.driver", launcher_command())):
        if git(["config", "--get", key], root) != value:
            git(["config", key, value], root)
    attributes = os.path.join(paths["dir"], ".gitattributes")
    try:
        with open(attributes, encoding="utf-8") as f:
            text = f.read()
    except OSError:
        text = ""
    if "tasks.json merge=atm" in text.splitlines():
        return False
    os.makedirs(paths["dir"], exist_ok=True)
    with open(attributes, "w", encoding="utf-8") as f:
        f.write(text + ("" if not text or text.endswith("\n") else "\n") + GITATTRIBUTES_LINES)
    git(["add", "--", rel(root, attributes)], root)
    return True


ARCHIVE_ATTRIBUTES_LINE = "tasks-archive.json merge=atm\n"


def ensure_archive_merge(paths):
    """In git: the archive merges task by task too. Added when a project first archives, so projects that never do
    see no change. Returns True if .gitattributes changed (staged)."""
    root = paths["root"]
    if not in_git(root):
        return False
    ensure_merge_driver(paths)  # the driver itself, and the tasks.json line
    attributes = os.path.join(paths["dir"], ".gitattributes")
    with open(attributes, encoding="utf-8") as f:
        text = f.read()
    if ARCHIVE_ATTRIBUTES_LINE.strip() in text.splitlines():
        return False
    with open(attributes, "w", encoding="utf-8") as f:
        f.write(text + ("" if text.endswith("\n") else "\n") + ARCHIVE_ATTRIBUTES_LINE)
    git(["add", "--", rel(root, attributes)], root)
    return True


def ensure_project_id(paths):
    """Give tasks.json a meta.id if it has none: the dashboard keeps each project's saved view under it (projects
    served from the same port share browser storage). Returns the new id, or None if there was one already."""
    if not os.path.isfile(paths["tasks"]):
        return None
    with locked(paths["dir"]):
        data = load_tasks(paths)
        meta = data.get("meta")
        if not isinstance(meta, dict):
            meta = data["meta"] = {}
        if isinstance(meta.get("id"), str) and meta["id"]:
            return None
        meta["id"] = os.urandom(4).hex()
        write_json_atomic(paths["tasks"], data)
    return meta["id"]


def apply_meta(paths, meta_file):
    """`init --meta-file F`: merge F's keys into tasks.json's meta (project, description, phases, vocabularies),
    creating tasks.json if there is none, so /atm:create-tasks never writes the file itself. The vocabularies are
    checked before anything is written; meta.id is kept. Returns (created, keys)."""
    new = read_json(meta_file)
    if not isinstance(new, dict):
        raise AtmError(f"{meta_file} must hold a JSON object: the meta keys to set", 2)
    new.pop("id", None)
    with locked(paths["dir"]) if os.path.isdir(paths["dir"]) else contextlib.nullcontext():
        created = not os.path.isfile(paths["tasks"])
        data = {"meta": {"created": now().strftime("%Y-%m-%d")}, "tasks": []} if created else load_tasks(paths)
        if not isinstance(data.get("meta"), dict):
            data["meta"] = {}
        data["meta"].update(new)
        vocabulary(data)  # raises, naming the problem, before anything is written
        os.makedirs(paths["dir"], exist_ok=True)
        write_json_atomic(paths["tasks"], data)
    return created, sorted(new)


def cmd_init(args):
    paths = find_paths(os.getcwd())
    if args.meta_file:
        created, keys = apply_meta(paths, args.meta_file)
        paths = find_paths(os.getcwd())
        if not args.json:
            out(("Created tasks.json; meta: " if created else "Updated tasks.json meta: ") + (", ".join(keys) or "-"))
    project_id = ensure_project_id(paths)
    repository = ensure_repository(paths)
    register(paths)  # the dashboard lists every project atm runs in
    git_repo = in_git(paths["root"])
    changed = ensure_merge_driver(paths) if git_repo else False
    if args.json:
        out(
            to_json(
                {"project_id": project_id, "repository": repository, "git": git_repo, "gitattributes_added": changed}
            )
        )
        return
    if project_id:
        out(f"Gave this project an id ({project_id}) in tasks.json meta, for the dashboard's saved view.")
    if repository:
        out(f"Recorded the repository address ({repository}), for commit and PR links on the dashboard.")
    if not git_repo:
        out("Not in a git repository: there is no merge driver to set up.")
        return
    out(
        "Registered the tasks.json merge driver (git config merge.atm)"
        + (" and added .agentic-task-manager/.gitattributes (staged)." if changed else "; .gitattributes already set.")
    )


# ==== archive.py ====
# The archive: finished tasks moved out of tasks.json into tasks-archive.json, so the working file stays small
# (docs/v4/data-model.md §5). Both files stay readable JSON in the same format, merged by the same driver.
#
# A move writes one file, then the other. A task found in both files keeps its tasks.json copy and loses the
# archive's: an archive that crashed halfway simply hasn't happened, an unarchive that crashed halfway is complete, and
# no task is ever lost.

def drop_duplicates(data, archive):
    """Tasks in both files keep their tasks.json copy (see the module docstring). Returns the dropped IDs."""
    ids = {t.get("id") for t in data["tasks"]}
    dropped = [t.get("id") for t in archive["tasks"] if t.get("id") in ids]
    archive["tasks"] = [t for t in archive["tasks"] if t.get("id") not in ids]
    return dropped


def size_kb(p):
    return os.path.getsize(p) // 1024 if os.path.isfile(p) else 0


def describe_ids(ids, limit=12):
    return ", ".join(ids[:limit]) + (f" and {len(ids) - limit} more" if len(ids) > limit else "")


def cmd_archive(args):
    before = None
    if args.before:
        try:
            before = parse_iso(args.before if "T" in args.before else args.before + "T00:00:00Z")
        except ValueError:
            raise AtmError(f"--before {args.before}: use a date like 2026-05-01", 2)
    phases = [float(p) for p in args.phase] if args.phase else None
    paths = find_paths(os.getcwd())
    with locked(paths["dir"]):
        data = load_tasks(paths)
        archive = load_archive(paths)
        dropped = drop_duplicates(data, archive)
        moving = archivable(data, phases, before, args.keep_days)
        ids = [t.get("id") for t in moving]
        if not args.dry_run and (moving or dropped):
            # New IDs must never come back to an archived ID (DM-2.3)
            if not isinstance(data.get("meta"), dict):
                data["meta"] = {}
            data["meta"]["next_id"] = next_number(data)
            archive.setdefault("meta", {})["archived_at"] = now_iso()
            archive["tasks"].extend(moving)
            write_json_atomic(archive_path(paths), archive)
            moved = set(ids)
            data["tasks"] = [t for t in data["tasks"] if t.get("id") not in moved]
            # The dashboard shows the count without loading the archive (dashboard D-5.4)
            data["meta"]["archived"] = len(archive["tasks"])
            write_json_atomic(paths["tasks"], data)
            ensure_archive_merge(paths)
    result = {
        "moved": ids,
        "dry_run": bool(args.dry_run),
        "tasks_kb": size_kb(paths["tasks"]),
        "archive_kb": size_kb(archive_path(paths)),
        "duplicates_dropped": dropped,
    }
    if args.json:
        out(to_json(result))
        return
    if dropped and not args.dry_run:
        out(f"Kept {describe_ids(dropped)} in tasks.json and dropped the archive's copy (an interrupted move).")
    if not ids:
        out("Nothing to archive.")
    elif args.dry_run:
        out(f"Would archive {len(ids)} task(s): {describe_ids(ids)}.")
    else:
        out(
            f"Archived {len(ids)} task(s): {describe_ids(ids)}. "
            f"tasks.json is now {result['tasks_kb']} KB, tasks-archive.json {result['archive_kb']} KB."
        )


def cmd_unarchive(args):
    paths = find_paths(os.getcwd())
    with locked(paths["dir"]):
        data = load_tasks(paths)
        archive = load_archive(paths)
        drop_duplicates(data, archive)
        by_id = {t.get("id"): t for t in archive["tasks"]}
        missing = [i for i in args.ids if i not in by_id]
        if missing:
            raise AtmError(f"not in the archive: {', '.join(missing)}")
        # tasks.json first: a crash here leaves the task in both files, and it stays in tasks.json
        data["tasks"].extend(by_id[i] for i in args.ids)
        if not isinstance(data.get("meta"), dict):
            data["meta"] = {}
        data["meta"]["archived"] = len(archive["tasks"]) - len(set(args.ids))
        write_json_atomic(paths["tasks"], data)
        archive["tasks"] = [t for t in archive["tasks"] if t.get("id") not in args.ids]
        write_json_atomic(archive_path(paths), archive)
    if args.json:
        out(to_json({"restored": args.ids}))
    else:
        out(f"Brought back {', '.join(args.ids)} from the archive.")


# ==== git_ops.py ====
# The project's workflow (meta.workflow: direct or pull-request, docs/v4/skills-and-workflows.md §1) and the git
# side of tasks: atm workflow, atm commit, atm pr, atm merged (docs/v4/atm-cli.md §4.5, data-model.md §4).

# Pathspecs that stage more than the files named: another agent's work can be in the same tree
WHOLE_TREE = {".", "-A", "--all", "-u", "--update", ":/", "*"}
CO_AUTHORED = re.compile(r"^co-authored-by:", re.IGNORECASE)


def default_base(root):
    """The remote's default branch (origin/HEAD), else main."""
    ref = git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], root)
    return ref.split("/", 1)[1] if ref and "/" in ref else "main"


def describe_workflow(workflow, root):
    if workflow is None:
        return "No workflow set: /atm:push asks for one, or run `atm workflow set direct|pull-request`."
    trailers = workflow.get("trailers")
    lines = [
        f"workflow: {workflow['type']}",
        "  base: " + (workflow["base"] if workflow.get("base") else f"{default_base(root)} (the remote's default branch)"),
        f"  verify before pushing: {'yes' if workflow['verify'] else 'no'}",
        f"  CI fix rounds: {workflow['max_rounds']}",
        f"  commit message: {workflow['commit_template']}",
        "  trailers: "
        + (
            "none (Co-Authored-By lines are removed)"
            if trailers == "forbid"
            else ("required: " + "; ".join(trailers["require"]) if isinstance(trailers, dict) else "as the agent writes them")
        ),
    ]
    return "\n".join(lines)


def cmd_workflow(args):
    paths = find_paths(os.getcwd())
    if args.action is None:
        workflow = workflow_of(load_tasks(paths))
        out(to_json(workflow or {"type": None}) if args.json else describe_workflow(workflow, paths["root"]))
        return
    if args.type not in WORKFLOW_TYPES:
        raise AtmError(f"atm workflow set needs a type: {' or '.join(WORKFLOW_TYPES)}", 2)
    changes = {"type": args.type}
    if args.base is not None:
        changes["base"] = args.base
    if args.verify is not None:
        changes["verify"] = args.verify == "true"
    if args.max_rounds is not None:
        changes["max_rounds"] = args.max_rounds
    if args.commit_template is not None:
        changes["commit_template"] = args.commit_template
    if args.trailers == "forbid":
        changes["trailers"] = "forbid"
    elif args.trailers == "require":
        if not args.trailer:
            raise AtmError("--trailers require needs at least one --trailer LINE", 2)
        changes["trailers"] = {"require": args.trailer}
    with locked(paths["dir"]):
        data = load_tasks(paths)
        if not isinstance(data.get("meta"), dict):
            data["meta"] = {}
        current = data["meta"].get("workflow") if isinstance(data["meta"].get("workflow"), dict) else {}
        workflow = {**current, **changes}
        if args.trailers == "none":
            workflow.pop("trailers", None)
        data["meta"]["workflow"] = workflow
        effective = workflow_of(data)  # validates before anything is written
        write_json_atomic(paths["tasks"], data)
    out(to_json(effective) if args.json else describe_workflow(effective, paths["root"]))


def run_git(args, root):
    """Run git; return stdout stripped, or raise AtmError with git's own message."""
    result = subprocess.run(["git"] + args, cwd=root, capture_output=True, text=True)
    if result.returncode != 0:
        message = (result.stderr or result.stdout).strip()
        raise AtmError(f"git {args[0]} failed: {message}")
    return result.stdout.strip()


def commit_paths(root, files):
    """The files to commit, relative to the root; refuses anything that would stage more than the files named."""
    picked = []
    for name in files:
        if name in WHOLE_TREE or name.startswith(":"):
            raise AtmError(f"atm commit stages only the files you name; {name!r} would stage the whole tree", 2)
        full = os.path.realpath(os.path.join(os.getcwd(), name))
        relative = os.path.relpath(full, root)
        if relative == "." or relative.startswith(".." + os.sep) or relative == "..":
            raise AtmError(f"{name} is outside the repository", 2)
        if os.path.isdir(full):
            raise AtmError(f"{name} is a directory: name the files in it", 2)
        # A deleted file is fine as long as git knows it: still in the index (deleted by hand) or in HEAD (`git rm`)
        if (
            not os.path.exists(full)
            and git(["ls-files", "--error-unmatch", "--", relative], root) is None
            and git(["cat-file", "-e", f"HEAD:{relative}"], root) is None
        ):
            raise AtmError(f"{name}: no such file, and git doesn't track it")
        if relative not in picked:
            picked.append(relative)
    return picked


def commit_message(text, trailers):
    """Apply the workflow's trailer rule: forbid removes Co-Authored-By lines, require adds the missing lines."""
    if trailers == "forbid":
        text = "\n".join(line for line in text.splitlines() if not CO_AUTHORED.match(line.strip())).rstrip()
    elif isinstance(trailers, dict):
        missing = [line for line in trailers["require"] if line not in text.splitlines()]
        if missing:
            text = text.rstrip() + "\n\n" + "\n".join(missing)
    return text


def cmd_commit(args):
    """Commit exactly the files the agent names plus tasks.json, then record the commit on the task."""
    agent = agent_identity(args.agent)
    paths = find_paths(os.getcwd())
    root = paths["root"]
    if not in_git(root):
        raise AtmError("atm commit needs a git repository")
    data = load_tasks(paths)
    task = find_task(data, args.id)
    workflow = workflow_of(data) or WORKFLOW_DEFAULTS
    template = args.message if args.message is not None else workflow["commit_template"]
    message = template
    for key in ("id", "name", "phase", "type"):
        message = message.replace("{" + key + "}", str(task.get(key, "")))
    message = commit_message(message, workflow.get("trailers"))
    if not message.strip():
        raise AtmError("the commit message is empty", 2)
    files = commit_paths(root, args.file)
    tasks_file = os.path.relpath(paths["tasks"], root)
    if tasks_file not in files:
        files.append(tasks_file)
    # A deletion already staged with `git rm` is in neither the tree nor the index: there is nothing to add for it
    to_add = [f for f in files if git(["ls-files", "--error-unmatch", "--", f], root) is not None or os.path.lexists(os.path.join(root, f))]
    if to_add:
        run_git(["add", "-A", "--"] + to_add, root)
    # With paths, git commits only those, so whatever else is staged stays staged and out of this commit
    run_git(["commit", "-q", "-m", message, "--"] + files, root)
    sha = run_git(["rev-parse", "HEAD"], root)
    # The SHA is known only once the commit exists, so tasks.json records it as a change for the next commit
    with locked(paths["dir"]):
        data = load_tasks(paths)
        task = find_task(data, args.id)
        task["commit"] = sha
        touch(task, agent, now_iso())
        write_json_atomic(paths["tasks"], data)
    if args.json:
        out(to_json({"task": task["id"], "commit": sha, "message": message, "files": files}))
    else:
        out(f"{task['id']}: committed {sha[:7]} {message.splitlines()[0]}")
        out("  " + ", ".join(files))


def cmd_pr(args):
    """Record the PR that contains the tasks (DM-4.3: the tasks are then In PR)."""
    agent = agent_identity(args.agent)
    if args.number <= 0:
        raise AtmError("--number must be a positive whole number", 2)
    paths = find_paths(os.getcwd())
    with locked(paths["dir"]):
        data = load_tasks(paths)
        found = [find_task(data, task_id) for task_id in args.ids]
        stamp = now_iso()
        for task in found:
            task["pr"] = {"number": args.number, "url": args.url}
            task.pop("merged_at", None)
            touch(task, agent, stamp)
        write_json_atomic(paths["tasks"], data)
    ids = [t["id"] for t in found]
    if args.json:
        out(to_json({"tasks": ids, "pr": {"number": args.number, "url": args.url}}))
    else:
        out(f"{', '.join(ids)}: in PR #{args.number} ({args.url})")


def cmd_merged(args):
    """Record that a PR was merged, on every task that records it (DM-4.3: the tasks are then Merged)."""
    agent = agent_identity(args.agent)
    if args.at is not None:
        try:
            parse_iso(args.at)
        except ValueError:
            raise AtmError(f"--at needs a time like 2026-10-24T18:00:00Z, not {args.at!r}", 2)
    paths = find_paths(os.getcwd())
    with locked(paths["dir"]):
        data = load_tasks(paths)
        tasks = [
            t
            for t in data["tasks"]
            if isinstance(t, dict) and isinstance(t.get("pr"), dict) and t["pr"].get("number") == args.pr
        ]
        if not tasks:
            raise AtmError(f"no task records PR #{args.pr} (atm pr records it)")
        stamp = now_iso()
        changed = [t for t in tasks if not t.get("merged_at")]
        for task in changed:
            task["merged_at"] = args.at or stamp
            touch(task, agent, stamp)
        if changed:
            write_json_atomic(paths["tasks"], data)
    ids = [t["id"] for t in changed]
    if args.json:
        out(to_json({"pr": args.pr, "tasks": ids, "already": [t["id"] for t in tasks if t not in changed]}))
    elif ids:
        out(f"PR #{args.pr} merged: {', '.join(ids)}")
    else:
        out(f"PR #{args.pr}: already recorded as merged")


# ==== migrate.py ====
# `atm migrate`: move a legacy tasks.json into the task folder and set the folder up (.gitignore, merge driver), and
# clean up after per-project dashboards (0.10.0-0.14.0): the dashboard now comes from the plugin, served by
# `atm serve` for all projects.

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


def dashboard_head(p):
    """(version, build ID) of a dashboard file, "" for a missing tag; None if there is no file."""
    try:
        with open(p, encoding="utf-8", errors="replace") as f:
            head = f.read(HEAD_BYTES)
    except OSError:
        return None
    version, build = VERSION_META.search(head), BUILD_META.search(head)
    return (version.group(1) if version else "", build.group(1) if build else "")


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


# ==== server.py ====
# `atm serve`: one dashboard server per user, a detached process serving every registered project.
#
# The server holds the plugin's dashboard in memory and serves each registered project's task files under /p/<id>/.
# Its routes and record are described in docs/multi-project-api.md.

SERVER_RECORD = "server.json"
SERVER_LOG = "server.log"
DEFAULT_PORT = 8765
PORT_TRIES = 100
PROJECT_FILES = ("tasks.json", "claims.json", "tasks-archive.json", "worktrees.json")
PROJECT_FILE = re.compile(r"/p/([^/]+)/(" + "|".join(re.escape(f) for f in PROJECT_FILES) + r")")


def server_url(port, project=None):
    return f"http://localhost:{port}/" + (f"#project={project}" if project else "")


def live_server(home):
    """The record of the user's running server, or None. A stale record is removed."""
    record_path = os.path.join(home, SERVER_RECORD)
    record = read_json(record_path)
    if record is None:
        return None
    info = whoami(record.get("port"))
    if info and info.get("pid") == record.get("pid"):
        return record
    os.remove(record_path)
    return None


def open_browser(url):
    opener = "open" if sys.platform == "darwin" else "xdg-open"
    try:
        subprocess.Popen([opener, url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError:
        out(f"Could not open a browser; open {url} yourself.")


def ensure_server(home, port):
    """The running server's record, starting the server if none runs. Returns (record, started)."""
    record = live_server(home)
    if record:
        return record, False
    os.makedirs(home, exist_ok=True)
    with open(os.path.join(home, SERVER_LOG), "ab") as log:
        child = subprocess.Popen(
            [sys.executable, os.path.abspath(__file__), "_serve-child", home, str(port)],
            cwd=home,
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=log,
            start_new_session=True,
        )
    deadline = time.time() + 10
    while time.time() < deadline:
        record = read_json(os.path.join(home, SERVER_RECORD))
        if record and record.get("pid") == child.pid and whoami(record["port"]):
            return record, True
        if child.poll() is not None:
            break
        time.sleep(0.05)
    raise AtmError(f"the dashboard server did not start; see {os.path.join(home, SERVER_LOG)}")


def project_for(paths):
    """(id, listed) of the project at `paths`, after registering it."""
    register(paths)
    path = main_worktree(paths["root"])
    meta = project_meta(path) or project_meta(paths["root"]) or {}
    return project_id(meta, path), listed(meta)


def serve_start(paths, port, overview):
    """Start (or reuse) the server; returns the URL to show: the project's, or the overview's."""
    project = None
    if not overview:
        for line in describe_migration(migrate(paths), paths):
            if line != "Nothing to migrate.":
                out(line)
        if not os.path.isfile(paths["tasks"]):
            raise AtmError("no tasks.json to serve. Run /atm:create-tasks first.")
        project, shown = project_for(paths)
        if not shown:
            out("This project isn't listed on the dashboard (meta.dashboard.listed is false).")
            project = None
    home = atm_home()
    record, started = ensure_server(home, port)
    url = server_url(record["port"], project)
    out(f"Dashboard server {'started' if started else 'already running'}: {url}")
    return url


def stop_server(home, pid):
    """Stop the user's server (whose pid whoami confirmed) and remove its record."""
    os.kill(pid, signal.SIGTERM)
    deadline = time.time() + 5
    while time.time() < deadline and pid_alive(pid):
        time.sleep(0.05)
    record_path = os.path.join(home, SERVER_RECORD)
    if os.path.exists(record_path):
        os.remove(record_path)


def serve_stop(home):
    record_path = os.path.join(home, SERVER_RECORD)
    record = read_json(record_path)
    if record is None:
        out("Dashboard server is not running.")
        return
    info = whoami(record.get("port"))
    if not (info and info.get("pid") == record.get("pid")):
        os.remove(record_path)
        out(f"Dashboard server is not running (removed a stale record for pid {record.get('pid')}).")
        return
    stop_server(home, record["pid"])
    out(f"Dashboard server stopped (pid {record['pid']}).")


def outdated(record):
    """True when the server runs an older dashboard than this plugin's: an older version, or the same version but
    another build. A newer server is left alone, so a session still on an older plugin never downgrades it."""
    mine, mine_build = dashboard_head(TEMPLATE) or ("", "")
    theirs, theirs_build = str(record.get("version") or ""), str(record.get("build") or "")
    if parse_version(mine) != parse_version(theirs):
        return parse_version(mine) > parse_version(theirs)
    return bool(mine_build) and mine_build != theirs_build


def refresh_server(home=None):
    """Restart the user's server on the same port if it runs an older dashboard than this plugin's (after a plugin
    update). Cheap when there is nothing to do: one read of server.json, and no request unless it is outdated.
    Never starts a server that isn't running. Returns the new record, or None."""
    home = home or atm_home()
    record = read_json(os.path.join(home, SERVER_RECORD))
    if not isinstance(record, dict) or not outdated(record):
        return None
    live = live_server(home)
    if not live:
        return None
    stop_server(home, live["pid"])
    return ensure_server(home, live["port"])[0]


def serve_refresh(home):
    record = refresh_server(home)
    if record:
        out(f"Dashboard server restarted with dashboard {record.get('version')}: {server_url(record['port'])}")


def serve_status(home, as_json):
    record = live_server(home)
    if as_json:
        out(to_json({"running": bool(record), **(record or {}), "url": server_url(record["port"]) if record else None}))
        return
    if not record:
        out("Dashboard server is not running.")
        return
    up = format_duration((datetime.now(timezone.utc) - parse_iso(record["started_at"])).total_seconds())
    out(
        f"Dashboard server running: {server_url(record['port'])} "
        f"(pid {record['pid']}, dashboard {record.get('version')}, up {up})"
    )


def cmd_serve(args):
    # --dir acts on another project without a cd (which permission rules can't check)
    cwd = os.path.abspath(args.dir) if args.dir else os.getcwd()
    if not os.path.isdir(cwd):
        raise AtmError(f"--dir {args.dir}: not a directory", 2)
    home = atm_home()
    if args.refresh:
        serve_refresh(home)
    elif args.action == "start":
        refresh_server(home)  # an outdated server is replaced before its URL is shown
        url = serve_start(find_paths(cwd), args.port, args.all)
        if args.open:
            open_browser(url)
    elif args.action == "stop":
        serve_stop(home)
    else:
        serve_status(home, args.json)


def port_in_use(port):
    """Something accepts connections on 127.0.0.1:port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def file_stamp(p):
    """(size, nanosecond mtime) of a file, or None if it doesn't exist."""
    try:
        st = os.stat(p)
    except OSError:
        return None
    return (st.st_size, st.st_mtime_ns)


def file_etag(stamp):
    """A strong ETag from a file's size and nanosecond mtime. Last-Modified alone has one-second resolution, so two
    atm changes in the same second would look unchanged to the dashboard."""
    return f'"{stamp[0]:x}-{stamp[1]:x}"'


class Registry:
    """The registry as the server sees it, re-read when projects.json changes."""

    def __init__(self, home):
        self.path = os.path.join(home, REGISTRY_FILE)
        self.stamp = None
        self.projects = []

    def entries(self):
        stamp = file_stamp(self.path)
        if stamp != self.stamp:
            data = read_json(self.path)
            entries = data.get("projects") if isinstance(data, dict) else None
            self.projects = [e for e in entries or [] if isinstance(e, dict) and isinstance(e.get("path"), str)]
            self.stamp = stamp
        return self.projects

    def find(self, project):
        return next((e for e in self.entries() if e.get("id") == project), None)


def task_file(entry, name):
    return os.path.join(entry["path"], TASK_DIR, name)


class Summaries:
    """Each project's summary (query.project_summary), computed again only when its tasks.json or claims store
    changed, or the day did (the completions count by day)."""

    def __init__(self):
        self.paths = {}  # project folder -> (atm paths, claims store path): finding them runs git
        self.cache = {}  # project folder -> (stamp, summary or None)

    def store(self, entry):
        """The project's claims store, shared by all its worktrees."""
        if entry["path"] not in self.paths:
            paths = find_paths(entry["path"])
            self.paths[entry["path"]] = (paths, claims_store_path(paths))
        return self.paths[entry["path"]][1]

    def stamp(self, entry):
        """What the summary depends on, or None when the project is missing."""
        tasks = file_stamp(task_file(entry, TASKS_FILE))
        if tasks is None:
            return None
        return (tasks, file_stamp(self.store(entry)), now().date().isoformat())

    def summary(self, entry, stamp):
        cached = self.cache.get(entry["path"])
        if cached and cached[0] == stamp:
            return cached[1]
        try:
            summary = project_summary(self.paths[entry["path"]][0])
        except AtmError:
            summary = None  # unreadable tasks.json or an unusable vocabulary: listed as missing
        self.cache[entry["path"]] = (stamp, summary)
        return summary


def api_projects(registry, summaries):
    """(body, ETag) of /api/projects. The ETag changes with the registry, and with each project's tasks.json, claims
    and the day."""
    entries = registry.entries()
    stamps = [summaries.stamp(e) for e in entries]
    trees = [worktrees(e["path"]) if stamp else [] for e, stamp in zip(entries, stamps)]
    etag = '"' + hashlib.sha1(repr([registry.stamp] + stamps + trees).encode("utf-8")).hexdigest()[:16] + '"'

    def body():
        projects = []
        for entry, stamp, tree in zip(entries, stamps, trees):
            summary = summaries.summary(entry, stamp) if stamp else None
            projects.append(
                {
                    "id": entry.get("id"),
                    "name": entry.get("name"),
                    "path": entry["path"],
                    "missing": summary is None,
                    "summary": summary,
                    "worktrees": tree if summary else [],
                }
            )
        return to_json({"generated_at": now_iso(), "projects": projects}).encode("utf-8")

    return body, etag


def api_claims(summaries, entry):
    """(body, ETag) of a project's claims.json: the live claims of all its worktrees, from the shared claims store
    (each worktree's own snapshot has only the claims made there). None when there is no store yet."""
    store = summaries.store(entry)
    stamp = file_stamp(store)
    if stamp is None:
        return None

    def body():
        data = read_json(store)
        claims = data.get("claims") if isinstance(data, dict) else None
        listed_claims = [c for c in (claims or {}).values() if isinstance(c, dict) and isinstance(c.get("task"), str)]
        snapshot = {"generated_at": now_iso(), "claims": sorted(listed_claims, key=lambda c: c["task"])}
        return to_json(snapshot).encode("utf-8")

    return body, file_etag(stamp)


def api_worktrees(entry):
    """(body, ETag) of a project's worktrees.json: its git worktrees, main first, and for each linked one the tasks
    whose copy there differs from the main worktree's (or that only it has). The dashboard shows them all on one
    board, each task from the worktree where it got furthest."""
    trees = worktrees(entry["path"])
    stamps = [file_stamp(os.path.join(t["path"], TASK_DIR, TASKS_FILE)) for t in trees]
    etag = '"' + hashlib.sha1(repr([trees, stamps]).encode("utf-8")).hexdigest()[:16] + '"'

    def tasks_of(tree):
        data = read_json(os.path.join(tree["path"], TASK_DIR, TASKS_FILE))
        tasks = data.get("tasks") if isinstance(data, dict) else None
        return [t for t in tasks or [] if isinstance(t, dict) and isinstance(t.get("id"), str)]

    def body():
        listed_trees = []
        main = {}
        for tree in trees:
            if tree["main"]:
                main = {t["id"]: t for t in tasks_of(tree)}
                listed_trees.append(tree)
            else:
                differing = [t for t in tasks_of(tree) if main.get(t["id"]) != t]
                listed_trees.append({**tree, "tasks": differing})
        return to_json({"generated_at": now_iso(), "worktrees": listed_trees}).encode("utf-8")

    return body, etag


def cmd_serve_child(args):
    """The detached server process: serve on the first free port from `port`, record it, run until stopped."""
    import http.server
    import socketserver

    home, port = args.home, args.port
    record_path = os.path.join(home, SERVER_RECORD)
    with open(TEMPLATE, "rb") as f:
        page = f.read()
    version, build = dashboard_head(TEMPLATE)
    registry = Registry(home)
    summaries = Summaries()

    class Handler(http.server.BaseHTTPRequestHandler):
        server_version = "atm"

        def send(self, status, body=b"", content_type="application/json", etag=None):
            self.send_response(status)
            if body or status == 200:
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(body)))
            if etag:
                self.send_header("ETag", etag)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if body and self.command != "HEAD":
                self.wfile.write(body)

        def send_error_json(self, status, message):
            self.send(status, to_json({"error": message}).encode("utf-8"))

        def send_conditional(self, body_fn, etag, content_type="application/json"):
            if self.headers.get("If-None-Match") == etag:
                # Unchanged since the dashboard's last poll: it skips parsing and re-rendering (D-5.1)
                self.send(304, etag=etag)
                return
            self.send(200, body_fn(), content_type, etag)

        def do_GET(self):
            port_now = self.server.server_address[1]
            if self.headers.get("Host") not in (f"localhost:{port_now}", f"127.0.0.1:{port_now}"):
                # A page on another site that points its own domain at 127.0.0.1 (DNS rebinding) is refused
                self.send_error_json(403, "unexpected Host header")
                return
            path = urlsplit(self.path).path
            if path == "/":
                self.send(200, page, "text/html; charset=utf-8")
            elif path == WHOAMI:
                info = {"atm": True, "pid": os.getpid(), "port": port_now, "version": version, "build": build}
                self.send(200, to_json(info).encode("utf-8"))
            elif path == "/api/projects":
                body, etag = api_projects(registry, summaries)
                self.send_conditional(body, etag)
            else:
                self.serve_project_file(path)

        do_HEAD = do_GET

        def serve_project_file(self, path):
            match = PROJECT_FILE.fullmatch(path)
            if not match:
                self.send_error_json(404, "not found")
                return
            entry = registry.find(match.group(1))
            if entry is None:
                self.send_error_json(404, "unknown project")
                return
            name = match.group(2)
            if not os.path.isfile(task_file(entry, TASKS_FILE)):
                self.send_error_json(404, "not found")
                return
            computed = None
            if name == "worktrees.json":
                computed = api_worktrees(entry)
            elif name == "claims.json":
                computed = api_claims(summaries, entry)
            if computed:
                self.send_conditional(*computed)
                return
            p = task_file(entry, name)
            stamp = file_stamp(p)
            if stamp is None:
                self.send_error_json(404, "not found")
                return

            def read():
                with open(p, "rb") as f:
                    return f.read()

            self.send_conditional(read, file_etag(stamp))

        def not_allowed(self):
            self.send_error_json(405, "only GET and HEAD")

        do_POST = do_PUT = do_DELETE = do_PATCH = do_OPTIONS = not_allowed

    class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True
        # A restarted server takes its port back while the old one's connections linger in TIME_WAIT. On macOS the
        # same option would also let it share a port another server listens on, hence port_in_use() first.
        allow_reuse_address = True

    server = None
    for candidate in range(port, port + PORT_TRIES):
        if port_in_use(candidate):
            continue
        try:
            server = Server(("127.0.0.1", candidate), Handler)
            break
        except OSError:
            continue
    if server is None:
        sys.stderr.write(f"atm: no free port in {port}-{port + PORT_TRIES - 1}\n")
        return
    record = {
        "pid": os.getpid(),
        "port": server.server_address[1],
        "version": version,
        "build": build,
        "plugin_root": PLUGIN_ROOT,
        "started_at": now_iso(),
    }
    write_json_atomic(record_path, record)

    def stop(signum, frame):
        if (read_json(record_path) or {}).get("pid") == os.getpid():
            os.remove(record_path)
        os._exit(0)

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    server.serve_forever()


# ==== cli.py ====
# The command line: one argparse parser, a subparser per command, and main().
#
# Every command takes --json. Usage errors keep atm's format ("atm: <message>", exit code 2) followed by the command's
# usage line; with --json, every error is {"error": "...", "code": N} on stderr, with the same exit code.

USAGE = """usage: atm <command> [options]

commands:
  version        print the plugin version
  paths [--json] print where this project's task files are
  migrate [--json]
                 move tasks.json from docs/ or the root into .agentic-task-manager/,
                 and set up the folder (.gitignore, current dashboard)
  serve [start|stop|status] [--open] [--all] [--port N] [--dir PATH] [--refresh]
                 run the dashboard server in the background: one per user, for all registered projects
                 (start registers this project, or the one at PATH, and prints its URL; --all the overview's;
                 --refresh only restarts a running server whose dashboard is older than this plugin's)
  status         the overview: counts, what is in progress, in review or blocked, the next task
  show <id>...   tasks in full (description, dependencies, files, notes)
  list [--status S] [--phase N] [--type T] [--priority P] [--label L] [--agent A] [--ready] [--blocked] [--in-pr]
                 one line per task: ID, status, phase, priority, labels, name
  deps <id>      what a task waits for, and what waits for it
  start <id>     mark a task in_progress and claim it (its dependencies must be done); prints the task
  review <id> [--note TEXT]
                 ask for a review of a finished task: in_review, and its claim is released
  done <id> [--note TEXT] [--commit SHA]
                 mark an in_progress or in_review task done and drop its claim; the note is a one-line
                 outcome (for a task in review, done means the review passed); prints the tasks now ready
  reject <id> --reason TEXT
                 send a task in review back to todo, with what needs to change
  block <id> --on user|agent (--question TEXT)... [--reason TEXT]
                 a task that can't go on until someone decides: blocked, its claim released
  unblock <id> [--answer TEXT]...
                 back to todo, with the questions and answers kept as a note
  reopen <id> --reason TEXT
                 a done or skipped task back to todo (done by mistake, or not finished after all)
  skip <id> --reason TEXT
                 a todo or blocked task that isn't needed: skipped, with the reason as a note
  fail <id> [--reason TEXT]
                 put an in_progress task back to todo, recording why (a failure note)
  release <id> [--note TEXT]
                 put an in_progress task back to todo; the note is a handoff for the next agent
  note <id> TEXT add a note to a task (at most 500 characters)
  add --name N --phase P --type T [--priority P] [--label L]... [--description D] [--dep ID]... [--file F]...
                 add a task with the next ID; add --json-file F adds many (see atm add --help)
  edit <id> [--name] [--description] [--phase] [--type] [--priority] [--add-dep/--remove-dep ID]
            [--add-file/--remove-file F] [--add-label/--remove-label L]
                 change a task's definition (its status changes only through the status commands)
  check          check tasks.json: schema, vocabularies, dependencies (exit code 1 on errors)
  archive [--phase N]... [--before DATE] [--keep-days N] [--dry-run]
                 move finished tasks to tasks-archive.json, to keep tasks.json small
  unarchive <id>...
                 bring archived tasks back into tasks.json
  workflow [set direct|pull-request] [--base B] [--verify true|false] [--max-rounds N] ...
                 print the project's workflow (meta.workflow), or set it
  commit <id> --file F [--file F]... [--message TEXT]
                 commit exactly those files plus tasks.json (message from meta.workflow.commit_template),
                 and record the commit on the task
  pr <id>... --number N --url URL
                 record the PR that contains the tasks
  merged --pr N [--at TIME]
                 record that PR N was merged, on its tasks
  next [--phase N] [--type T] [--claim] [--json]
                 the task /atm:loop-tasks works on next (lowest phase, then most urgent priority, then
                 lowest ID); --claim also starts and claims it, atomically (exit code 3 if there is none)
  heartbeat <id> extend your claim's lease (heartbeat --auto: the plugin's hook renews your claims for you)
  init [--meta-file F]
                 give tasks.json a meta.id if it has none, and register the tasks.json merge driver in this
                 clone (migrate registers the driver too); --meta-file sets meta (project, phases, vocabularies)
                 from a JSON object, creating tasks.json if there is none
  merge-driver <base> <ours> <theirs>
                 git merge driver for tasks.json (see .agentic-task-manager/.gitattributes)
  claims [--json]
                 list live claims, shared by all worktrees of this clone
  repository [set URL]
                 print or set the repository's web address (meta.repository), for commit and PR links; a git
                 remote is turned into one; atm init fills it from origin
  phases [--archived] | phases name <n> "<name>" | phases unname <n>
                 the phases with their names and task counts by kind; name or unname one phase (meta.phases)
  projects [add [PATH] | remove <id|PATH> | prune]
                 the projects the dashboard shows (~/.agentic-task-manager/projects.json, or $ATM_HOME):
                 list them, add one, remove one, or drop the ones whose folder or tasks.json is gone
                 (status commands and heartbeat take --agent NAME and --json; status commands and next --claim
                 take --status ID to pick a status when the project has several of that kind)
  help           show this help

Every command takes --json, and `atm <command> --help` describes it.
"""


# Commands that don't check for an outdated dashboard server first: serve does it itself, the server process is the
# server, and git runs the merge driver in the middle of a merge
NO_REFRESH = ("serve", "_serve-child", "merge-driver", "_lock-test", "help", "version")


class Parser(argparse.ArgumentParser):
    """Usage errors as AtmError (exit code 2), so they are reported like every other error."""

    def error(self, message):
        raise AtmError(f"{message}\n{self.format_usage().strip()}", 2)


def cmd_version(args):
    out(to_json({"version": plugin_version()}) if args.json else plugin_version())


def cmd_help(args):
    if args.json:
        out(to_json({"usage": USAGE}))
    else:
        sys.stdout.write(USAGE)


def build_parser():
    parser = Parser(prog="atm", add_help=False)
    commands = parser.add_subparsers(dest="command", parser_class=Parser)

    def command(name, run, description, hidden=False):
        sub = commands.add_parser(name, description=description, help=argparse.SUPPRESS if hidden else description)
        sub.add_argument("--json", action="store_true", help="print the result as JSON")
        sub.set_defaults(run=run)
        return sub

    def agent_option(sub):
        sub.add_argument("--agent", metavar="NAME", help="who you are (default: ATM_AGENT, else this session)")

    def status_option(sub):
        sub.add_argument(
            "--status",
            metavar="ID",
            help="the status to move to when the project has several of that kind (default: the first listed)",
        )

    command("version", cmd_version, "print the plugin version")
    command("help", cmd_help, "show the list of commands")
    command("paths", cmd_paths, "print where this project's task files are")
    command("migrate", cmd_migrate, "move an old tasks.json into .agentic-task-manager/ and set the folder up")

    serve = command("serve", cmd_serve, "run the dashboard server, one for all your projects, in the background")
    serve.add_argument("action", nargs="?", default="start", choices=["start", "stop", "status"])
    serve.add_argument("--open", action="store_true", help="also open the dashboard in the browser")
    serve.add_argument("--all", action="store_true", help="show the overview of all projects, not this project")
    serve.add_argument(
        "--refresh",
        action="store_true",
        help="only restart a running server that has an older dashboard than this plugin (the SessionStart hook)",
    )
    serve.add_argument("--port", type=int, default=DEFAULT_PORT, help="the port to try first")
    serve.add_argument("--dir", metavar="PATH", help="the project to show (default: the current directory's)")

    for name, description in (
        ("start", "mark a task in_progress and claim it (its dependencies must be done)"),
        ("review", "ask for a review of a finished task: in_review, its claim released"),
        ("done", "mark an in_progress or in_review task done and drop its claim"),
        ("fail", "put an in_progress task back to todo, recording why"),
        ("release", "put an in_progress task back to todo"),
        ("reject", "send a task in review back to todo, recording why"),
        ("block", "a task that can't go on until someone decides: blocked, with the questions; claim released"),
        ("unblock", "a blocked task goes back to todo, with the answers as a note"),
        ("reopen", "a done or skipped task goes back to todo, with the reason as a note"),
        ("skip", "a todo or blocked task that isn't needed: skipped, with the reason as a note"),
    ):
        sub = command(name, cmd_status_change(name), description)
        sub.add_argument("id", help="the task ID")
        agent_option(sub)
        status_option(sub)
        if name == "fail":
            sub.add_argument("--reason", metavar="TEXT", help="why it failed (kept as a failure note)")
        if name == "release":
            sub.add_argument("--note", metavar="TEXT", help="a handoff for whoever picks it up next")
        if name == "review":
            sub.add_argument("--note", metavar="TEXT", help="what the reviewer should look at")
        if name == "reject":
            sub.add_argument("--reason", metavar="TEXT", required=True, help="what needs to change (a rejection note)")
        if name == "reopen":
            sub.add_argument("--reason", metavar="TEXT", required=True, help="why it isn't done after all (a note)")
        if name == "skip":
            sub.add_argument("--reason", metavar="TEXT", required=True, help="why it isn't needed (a note)")
        if name == "block":
            sub.add_argument("--on", required=True, choices=["user", "agent"], help="who has to decide")
            sub.add_argument("--question", action="append", default=[], metavar="TEXT", help="an open question")
            sub.add_argument("--reason", metavar="TEXT", help="what it waits for, when it isn't a question")
        if name == "unblock":
            sub.add_argument("--answer", action="append", default=[], metavar="TEXT", help="an answer, in order")
        if name == "done":
            sub.add_argument("--note", metavar="TEXT", help="a one-line outcome")
            sub.add_argument("--commit", metavar="SHA", help="the task's commit")

    next_ = command("next", cmd_next, "the task /atm:loop-tasks works on next (exit code 3 if there is none)")
    next_.add_argument("--phase", type=float, help="only this phase")
    next_.add_argument("--type", help="only this task type")
    next_.add_argument("--claim", action="store_true", help="also start and claim it, atomically")
    agent_option(next_)
    status_option(next_)

    show = command("show", cmd_show, "tasks in full: what an agent needs to work on them")
    show.add_argument("ids", nargs="+", metavar="id", help="task IDs")
    list_ = command("list", cmd_list, "one line per task: ID, status, phase, priority, labels, name")
    list_.add_argument("--status", action="append", metavar="ID", help="only these statuses (repeatable)")
    list_.add_argument("--phase", type=float, help="only this phase")
    list_.add_argument("--type", help="only this task type")
    list_.add_argument("--priority", help="only this priority (a missing one counts as the default)")
    list_.add_argument("--label", action="append", help="only tasks with this label (repeatable: all of them)")
    list_.add_argument("--agent", metavar="NAME", help="only tasks started by this agent")
    list_.add_argument("--ready", action="store_true", help="only to-do tasks whose dependencies are done")
    list_.add_argument("--blocked", action="store_true", help="only blocked tasks and to-do tasks still waiting")
    list_.add_argument("--in-pr", action="store_true", help="only tasks in a PR that isn't recorded as merged")
    list_.add_argument("--archived", action="store_true", help="list the archive (tasks-archive.json) instead")
    command(
        "status",
        cmd_status,
        "the overview: counts, what is in progress, in review or blocked, the next task, the file's size",
    )
    deps = command("deps", cmd_deps, "what a task waits for, and what waits for it")
    deps.add_argument("id", help="the task ID")

    add = command("add", cmd_add, "add a task with the next ID, or many from a JSON file")
    add.add_argument("--name", help="a short name (about 60 characters)")
    add.add_argument("--phase", type=float, help="the phase number")
    add.add_argument("--type", help="the task type (one of the project's types)")
    add.add_argument("--priority", help="the priority (default: none, which counts as the project's default)")
    add.add_argument("--label", action="append", default=[], help="a label (repeatable)")
    describe = add.add_mutually_exclusive_group()
    describe.add_argument("--description", default="", help="what exactly to do")
    describe.add_argument("--description-file", metavar="FILE", help="read the description from a file")
    add.add_argument("--dep", action="append", default=[], metavar="ID", help="a task it depends on (repeatable)")
    add.add_argument("--file", action="append", default=[], help="a file it will create or change (repeatable)")
    add.add_argument("--requirement", action="append", default=[], help="a requirement ID (repeatable)")
    add.add_argument(
        "--json-file",
        metavar="FILE",
        help='add many: a JSON list of tasks; an "id" there is a placeholder (e.g. "new-1") other tasks\' '
        '"dependencies" can use, replaced by the real ID',
    )
    agent_option(add)

    edit = command("edit", cmd_edit, "change a task's definition (not its status: use the status commands)")
    edit.add_argument("id", help="the task ID")
    edit.add_argument("--name")
    edit_description = edit.add_mutually_exclusive_group()
    edit_description.add_argument("--description")
    edit_description.add_argument("--description-file", metavar="FILE")
    edit.add_argument("--phase", type=float)
    edit.add_argument("--type")
    edit.add_argument("--priority")
    for option, help_text in (
        ("file", "a file it creates or changes"),
        ("dep", "a task it depends on"),
        ("label", "a label"),
    ):
        edit.add_argument(f"--add-{option}", action="append", default=[], metavar="VALUE", help=f"add {help_text}")
        edit.add_argument(f"--remove-{option}", action="append", default=[], metavar="VALUE", help=f"remove {help_text}")
    agent_option(edit)

    check = command("check", cmd_check, "check tasks.json: the schema, the vocabularies, dependencies; exit 1 on errors")
    check.add_argument("--files", action="store_true", help="also warn about missing files listed by finished tasks")

    archive = command("archive", cmd_archive, "move finished tasks to tasks-archive.json, to keep tasks.json small")
    archive.add_argument("--phase", action="append", type=float, help="only this phase (repeatable)")
    archive.add_argument("--before", metavar="DATE", help="only tasks finished before this date (2026-05-01)")
    archive.add_argument(
        "--keep-days", type=float, help="keep tasks finished in the last N days (default: meta.archive.keep_days, 14)"
    )
    archive.add_argument("--dry-run", action="store_true", help="only say what would move")
    unarchive = command("unarchive", cmd_unarchive, "bring archived tasks back into tasks.json")
    unarchive.add_argument("ids", nargs="+", metavar="id", help="task IDs")

    workflow = command("workflow", cmd_workflow, "print the project's workflow, or set it (atm workflow set TYPE)")
    workflow.add_argument("action", nargs="?", choices=["set"], help="set: change the workflow")
    workflow.add_argument("type", nargs="?", help="direct or pull-request")
    workflow.add_argument("--base", help="the branch PRs target, or that direct pushes to")
    workflow.add_argument("--verify", choices=["true", "false"], help="run the project's verify before pushing")
    workflow.add_argument("--max-rounds", type=int, help="CI fix rounds before /atm:push stops")
    workflow.add_argument("--commit-template", metavar="TEXT", help='commit messages, e.g. "feat({id}): {name}"')
    workflow.add_argument(
        "--trailers",
        choices=["forbid", "require", "none"],
        help="forbid Co-Authored-By lines, require the --trailer lines, or leave it to the agent",
    )
    workflow.add_argument("--trailer", action="append", default=[], metavar="LINE", help="a required trailer line")

    commit = command("commit", cmd_commit, "commit exactly the named files plus tasks.json, and record the commit")
    commit.add_argument("id", help="the task ID")
    commit.add_argument(
        "--file", action="append", required=True, metavar="F", help="a file the task changed (repeat for each)"
    )
    commit.add_argument("--message", metavar="TEXT", help="the message (default: meta.workflow.commit_template)")
    agent_option(commit)

    pr = command("pr", cmd_pr, "record the PR that contains the tasks")
    pr.add_argument("ids", nargs="+", metavar="id", help="task IDs")
    pr.add_argument("--number", type=int, required=True, help="the PR number")
    pr.add_argument("--url", required=True, help="the PR's URL")
    agent_option(pr)

    merged = command("merged", cmd_merged, "record that a PR was merged, on the tasks it contains")
    merged.add_argument("--pr", type=int, required=True, metavar="N", help="the PR number")
    merged.add_argument("--at", metavar="TIME", help="when it was merged (ISO 8601 UTC; default: now)")
    agent_option(merged)

    note = command("note", cmd_note, "add a note to a task (at most 500 characters)")
    note.add_argument("id", help="the task ID")
    note.add_argument("text", help="the note")
    agent_option(note)

    heartbeat = command("heartbeat", cmd_heartbeat, "extend your claim's lease")
    heartbeat.add_argument("id", nargs="?", help="the task ID")
    heartbeat.add_argument(
        "--auto",
        action="store_true",
        help="renew your claims if their last renewal is ten minutes old; silent (the plugin's PostToolUse hook)",
    )
    agent_option(heartbeat)

    init = command("init", cmd_init, "give tasks.json a meta.id, and register the tasks.json merge driver")
    init.add_argument(
        "--meta-file",
        metavar="F",
        help="set tasks.json meta from a JSON object (project, phases, vocabularies); creates tasks.json if needed",
    )
    merge = command("merge-driver", cmd_merge_driver, "git merge driver for tasks.json")
    for side in ("base", "ours", "theirs"):
        merge.add_argument(side)
    command("claims", cmd_claims, "list live claims, shared by all worktrees of this clone")
    repository = command("repository", cmd_repository, "print or set the repository's web address (meta.repository)")
    repository.add_argument("action", nargs="?", choices=["set"], help="set: change it")
    repository.add_argument("url", nargs="?", help="an http(s) URL or a git remote (git@host:owner/repo.git)")
    phases = command("phases", cmd_phases, "the phases with their names and counts; name or unname one phase")
    phases.add_argument("action", nargs="?", choices=["list", "name", "unname"], help="name or unname a phase")
    phases.add_argument("number", nargs="?", help="the phase number")
    phases.add_argument("name", nargs="?", help="name: the phase's name")
    phases.add_argument("--archived", action="store_true", help="list: count the archived tasks too")
    projects = command("projects", cmd_projects, "the projects the dashboard shows: list, add, remove or prune them")
    projects.add_argument("action", nargs="?", default="list", choices=["list", "add", "remove", "prune"])
    projects.add_argument("target", nargs="?", help="add: the project's folder (default: here); remove: its ID or path")

    child = command("_serve-child", cmd_serve_child, "the detached server process", hidden=True)
    child.add_argument("home")
    child.add_argument("port", type=int)
    lock_test = command("_lock-test", cmd_lock_test, "test hook: hold the lock", hidden=True)
    lock_test.add_argument("seconds", type=float, nargs="?", default=0.0)
    return parser, commands.choices


def report(error, as_json):
    if as_json:
        sys.stderr.write(to_json({"error": str(error), "code": error.code}) + "\n")
    else:
        sys.stderr.write(f"atm: {error}\n")


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        sys.stdout.write(USAGE)
        return 0
    parser, commands = build_parser()
    as_json = "--json" in argv
    if argv[0] not in commands:
        if as_json:
            report(AtmError(f"unknown command '{argv[0]}'", 2), True)
        else:
            sys.stderr.write(f"atm: unknown command '{argv[0]}'\n" + USAGE)
        return 2
    try:
        args, extra = parser.parse_known_args(argv)
        if extra:
            # Reported by the command's own parser, so the usage line is the command's
            commands[argv[0]].error(f"unrecognized arguments: {' '.join(extra)}")
        if argv[0] not in NO_REFRESH:
            try:
                refresh_server()  # after a plugin update, the first atm command brings the dashboard server along
            except Exception:
                pass  # never in the way of the command itself
        args.run(args)
    except AtmError as e:
        report(e, as_json)
        return e.code
    except AtmExit as e:
        return e.code
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
