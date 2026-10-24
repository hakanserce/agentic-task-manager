# Generated from atm-cli/atm/ by atm-cli/build.py. Don't edit this file: edit the modules and run
# `npm run build:cli` in dashboard/ (the pre-commit hook does it too).
"""atm: the Agentic Task Manager helper that the skills run.

Run through the `atm` launcher, which checks for Python 3.9+. Standard library only: the plugin is used as cloned,
with nothing to install.
"""

import argparse
import contextlib
import json
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone


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
def locked(directory):
    """Hold the lock for `directory` (creating it if needed) for the duration of the block."""
    os.makedirs(directory, exist_ok=True)
    lock = os.path.join(directory, LOCK_DIR)
    deadline = time.time() + lock_timeout()
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
}


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
    workflow = meta.get("workflow")
    if workflow is not None and (not isinstance(workflow, dict) or workflow.get("type") not in WORKFLOW_TYPES):
        raise AtmError(f"meta.workflow.type must be one of {', '.join(WORKFLOW_TYPES)}")
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


def load_tasks(paths):
    if not os.path.isfile(paths["tasks"]):
        raise AtmError(f"no tasks.json in {paths['dir']}. Run /atm:create-tasks first.")
    data = read_json(paths["tasks"])
    if not isinstance(data, dict) or not isinstance(data.get("tasks"), list):
        raise AtmError(f"{paths['tasks']} is not a valid task file (expected an object with a 'tasks' list)")
    vocabulary(data)  # an unusable vocabulary stops every command before anything is written
    return data


def find_task(data, task_id):
    for task in data["tasks"]:
        if task.get("id") == task_id:
            return task
    raise AtmError(f"no task {task_id}")


def unfinished_dependencies(data, task):
    """Dependencies that don't have a done-kind status yet, with their status ("missing" for unknown IDs)."""
    vocab = vocabulary(data)
    status = {t.get("id"): t.get("status") for t in data["tasks"]}
    return [
        (dep, status.get(dep, "missing"))
        for dep in task.get("dependencies", [])
        if dep not in status or kind_of(vocab, status[dep]) != "done"
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


def back_to_todo(task, vocab, actor, stamp):
    """The task returns to the first todo-kind status; its attempt's timestamps and actors go (DM-4.4)."""
    task["status"] = status_for(vocab, "todo")
    touch(task, actor, stamp)
    for field in (
        "started_at",
        "completed_at",
        "started_by",
        "completed_by",
        "agent",
        "commit",
        "review_requested_at",
    ):
        task.pop(field, None)


def change_status(task, data, command, reason=None, agent=None, status=None, note=None, commit=None):
    """Apply one status command to `task` (in `data`); raises AtmError if the transition isn't allowed. `status`
    picks the new status when its kind has several; `agent` is who runs it. `start` records them as started_by,
    `done` as completed_by (both kept when it is done, so the dashboard can show who did what); `note` and `reason`
    become notes, `commit` the task's commit."""
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
    stamp = now_iso()
    if new_kind == "todo":
        back_to_todo(task, vocab, agent, stamp)
        if command == "fail":
            add_note(task, "failure", reason or "verification failed", agent, stamp)
        elif command == "reject":
            add_note(task, "rejection", reason, agent, stamp)
        elif note:
            add_note(task, "handoff", note, agent, stamp)
        return current
    task["status"] = new
    touch(task, agent, stamp)
    if command == "review":
        # The work ends here: the review isn't agent work (DM-4.1); done keeps this timestamp
        task["review_requested_at"] = stamp
        if note:
            add_note(task, "review", note, agent, stamp)
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
    one that says so until the branches merge, so `next` must not hand those tasks out again elsewhere)."""
    data = read_json(claims_store_path(paths))
    data = data if isinstance(data, dict) else {}
    return {"claims": data.get("claims") or {}, "completed": data.get("completed") or {}}


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
            back_to_todo(task, vocab, None, stamp)
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


def cmd_heartbeat(args):
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
        if expired:
            write_json_atomic(paths["tasks"], data)
        write_store(paths, store)
    if not claim:
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


# ==== tasks.py ====
# The status commands (start, done, fail, release) and notes.

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
            )
            if command == "start":
                claims[task_id] = new_claim(paths, data, task_id, agent)
                store["completed"].pop(task_id, None)  # starting a task again on purpose
            else:
                claims.pop(task_id, None)
            if command == "done":
                store["completed"][task_id] = completion(paths, task_id, agent)
            write_json_atomic(paths["tasks"], data)
            write_store(paths, store)
        report_expired(expired)
        if args.json:
            out(to_json({**task, "claim": claims.get(task_id)}))
        else:
            out(f"{task['id']}: {previous} -> {task['status']}")

    return run


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
    "last_failure",
    "agent",
    "started_by",
    "completed_by",
    "updated_by",
    "commit",
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


def cmd_init(args):
    paths = find_paths(os.getcwd())
    project_id = ensure_project_id(paths)
    git_repo = in_git(paths["root"])
    changed = ensure_merge_driver(paths) if git_repo else False
    if args.json:
        out(to_json({"project_id": project_id, "git": git_repo, "gitattributes_added": changed}))
        return
    if project_id:
        out(f"Gave this project an id ({project_id}) in tasks.json meta, for the dashboard's saved view.")
    if not git_repo:
        out("Not in a git repository: there is no merge driver to set up.")
        return
    out(
        "Registered the tasks.json merge driver (git config merge.atm)"
        + (" and added .agentic-task-manager/.gitattributes (staged)." if changed else "; .gitattributes already set.")
    )


# ==== migrate.py ====
# `atm migrate`: move a legacy tasks.json into the task folder and set the folder up (.gitignore, merge driver,
# the current dashboard).

TEMPLATE = os.path.join(PLUGIN_ROOT, "templates", DASHBOARD_FILE)
# Runtime files in the task folder that must not be committed (the dashboard is a copy of the plugin's template)
IGNORED = ["tasks-dashboard.html", ".server.json", ".server.log", "claims.json", "claims-store.json", ".lock/"]
VERSION_META = re.compile(r'<meta name="atm-dashboard-version" content="([^"]*)"')


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
    if args.json:
        out(to_json(r))
        return
    for line in describe_migration(r, paths):
        out(line)


# ==== server.py ====
# `atm serve`: the dashboard server, a detached process per project.

SERVER_RECORD = ".server.json"
SERVER_LOG = ".server.log"
DEFAULT_PORT = 8000
PORT_TRIES = 100
WHOAMI = "/__atm/whoami"


def server_url(port):
    return f"http://localhost:{port}/{DASHBOARD_FILE}"


def whoami(port):
    """Ask the server on this port who it is; None if nothing (or not an atm server) answers."""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}{WHOAMI}", timeout=1) as response:
            info = json.loads(response.read().decode("utf-8"))
    except (OSError, ValueError):
        return None
    return info if isinstance(info, dict) and info.get("atm") else None


def live_server(task_dir):
    """The record of this folder's running server, or None. A stale record is removed."""
    record_path = os.path.join(task_dir, SERVER_RECORD)
    record = read_json(record_path)
    if record is None:
        return None
    info = whoami(record.get("port"))
    if info and info.get("folder") == task_dir and info.get("pid") == record.get("pid"):
        return record
    os.remove(record_path)
    return None


def open_browser(url):
    opener = "open" if sys.platform == "darwin" else "xdg-open"
    try:
        subprocess.Popen([opener, url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError:
        out(f"Could not open a browser; open {url} yourself.")


def serve_start(paths, port):
    for line in describe_migration(migrate(paths), paths):
        if line != "Nothing to migrate.":
            out(line)
    if not os.path.isfile(paths["tasks"]):
        raise AtmError("no tasks.json to serve. Run /atm:create-tasks first.")
    task_dir = paths["dir"]
    record = live_server(task_dir)
    if record:
        out(f"Dashboard server already running: {server_url(record['port'])}")
        return record
    with open(os.path.join(task_dir, SERVER_LOG), "ab") as log:
        child = subprocess.Popen(
            [sys.executable, os.path.abspath(__file__), "_serve-child", task_dir, str(port)],
            cwd=task_dir,
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=log,
            start_new_session=True,
        )
    deadline = time.time() + 10
    while time.time() < deadline:
        record = read_json(os.path.join(task_dir, SERVER_RECORD))
        if record and record.get("pid") == child.pid and whoami(record["port"]):
            out(f"Dashboard server started: {server_url(record['port'])}")
            return record
        if child.poll() is not None:
            break
        time.sleep(0.05)
    raise AtmError(f"the dashboard server did not start; see {os.path.join(task_dir, SERVER_LOG)}")


def serve_stop(paths):
    task_dir = paths["dir"]
    record_path = os.path.join(task_dir, SERVER_RECORD)
    record = read_json(record_path)
    if record is None:
        out("Dashboard server is not running.")
        return
    info = whoami(record.get("port"))
    if not (info and info.get("folder") == task_dir and info.get("pid") == record.get("pid")):
        os.remove(record_path)
        out(f"Dashboard server is not running (removed a stale record for pid {record.get('pid')}).")
        return
    pid = record["pid"]
    os.kill(pid, signal.SIGTERM)
    deadline = time.time() + 5
    while time.time() < deadline and pid_alive(pid):
        time.sleep(0.05)
    if os.path.exists(record_path):
        os.remove(record_path)
    out(f"Dashboard server stopped (pid {pid}).")


def serve_status(paths, as_json):
    record = live_server(paths["dir"])
    if as_json:
        out(to_json({"running": bool(record), **(record or {}), "url": server_url(record["port"]) if record else None}))
        return
    if not record:
        out("Dashboard server is not running.")
        return
    up = format_duration((datetime.now(timezone.utc) - parse_iso(record["started_at"])).total_seconds())
    out(f"Dashboard server running: {server_url(record['port'])} (pid {record['pid']}, up {up})")


def cmd_serve(args):
    paths = find_paths(os.getcwd())
    if args.action == "start":
        record = serve_start(paths, args.port)
        if args.open:
            open_browser(server_url(record["port"]))
    elif args.action == "stop":
        serve_stop(paths)
    else:
        serve_status(paths, args.json)


def cmd_serve_child(args):
    """The detached server process: serve task_dir on the first free port from `port`, record it, run until stopped."""
    import http.server
    import socketserver

    task_dir, port = args.task_dir, args.port
    record_path = os.path.join(task_dir, SERVER_RECORD)

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=task_dir, **kw)

        def do_GET(self):
            path = self.path.split("?", 1)[0]
            if path == WHOAMI:
                body = json.dumps({"atm": True, "folder": task_dir, "pid": os.getpid()}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            elif path == "/":
                self.send_response(302)
                self.send_header("Location", "/" + DASHBOARD_FILE)
                self.end_headers()
            else:
                super().do_GET()

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def list_directory(self, path):
            self.send_error(404)
            return None

    class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True
        allow_reuse_address = False

    server = None
    for candidate in range(port, port + PORT_TRIES):
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
        "folder": task_dir,
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
  serve [start|stop|status] [--open] [--port N]
                 run the dashboard server for this project in the background
  start <id>     mark a task in_progress and claim it (its dependencies must be done)
  review <id> [--note TEXT]
                 ask for a review of a finished task: in_review, and its claim is released
  done <id> [--note TEXT] [--commit SHA]
                 mark an in_progress or in_review task done and drop its claim; the note is a one-line
                 outcome (for a task in review, done means the review passed)
  reject <id> --reason TEXT
                 send a task in review back to todo, with what needs to change
  fail <id> [--reason TEXT]
                 put an in_progress task back to todo, recording why (a failure note)
  release <id> [--note TEXT]
                 put an in_progress task back to todo; the note is a handoff for the next agent
  note <id> TEXT add a note to a task (at most 500 characters)
  next [--phase N] [--type T] [--claim] [--json]
                 the task /atm:loop-tasks works on next (lowest phase, then most urgent priority, then
                 lowest ID); --claim also starts and claims it, atomically (exit code 3 if there is none)
  heartbeat <id> extend your claim's lease
  init           give tasks.json a meta.id if it has none, and register the tasks.json merge driver in this
                 clone (migrate registers the driver too)
  merge-driver <base> <ours> <theirs>
                 git merge driver for tasks.json (see .agentic-task-manager/.gitattributes)
  claims [--json]
                 list live claims, shared by all worktrees of this clone
                 (status commands and heartbeat take --agent NAME and --json; status commands and next --claim
                 take --status ID to pick a status when the project has several of that kind)
  help           show this help

Every command takes --json, and `atm <command> --help` describes it.
"""


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

    serve = command("serve", cmd_serve, "run the dashboard server for this project in the background")
    serve.add_argument("action", nargs="?", default="start", choices=["start", "stop", "status"])
    serve.add_argument("--open", action="store_true", help="also open the dashboard in the browser")
    serve.add_argument("--port", type=int, default=DEFAULT_PORT, help="the port to try first")

    for name, description in (
        ("start", "mark a task in_progress and claim it (its dependencies must be done)"),
        ("review", "ask for a review of a finished task: in_review, its claim released"),
        ("done", "mark an in_progress or in_review task done and drop its claim"),
        ("fail", "put an in_progress task back to todo, recording why"),
        ("release", "put an in_progress task back to todo"),
        ("reject", "send a task in review back to todo, recording why"),
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
        if name == "done":
            sub.add_argument("--note", metavar="TEXT", help="a one-line outcome")
            sub.add_argument("--commit", metavar="SHA", help="the task's commit")

    next_ = command("next", cmd_next, "the task /atm:loop-tasks works on next (exit code 3 if there is none)")
    next_.add_argument("--phase", type=float, help="only this phase")
    next_.add_argument("--type", help="only this task type")
    next_.add_argument("--claim", action="store_true", help="also start and claim it, atomically")
    agent_option(next_)
    status_option(next_)

    note = command("note", cmd_note, "add a note to a task (at most 500 characters)")
    note.add_argument("id", help="the task ID")
    note.add_argument("text", help="the note")
    agent_option(note)

    heartbeat = command("heartbeat", cmd_heartbeat, "extend your claim's lease")
    heartbeat.add_argument("id", help="the task ID")
    agent_option(heartbeat)

    command("init", cmd_init, "give tasks.json a meta.id, and register the tasks.json merge driver")
    merge = command("merge-driver", cmd_merge_driver, "git merge driver for tasks.json")
    for side in ("base", "ours", "theirs"):
        merge.add_argument(side)
    command("claims", cmd_claims, "list live claims, shared by all worktrees of this clone")

    child = command("_serve-child", cmd_serve_child, "the detached server process", hidden=True)
    child.add_argument("task_dir")
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
        args.run(args)
    except AtmError as e:
        report(e, as_json)
        return e.code
    except AtmExit as e:
        return e.code
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
