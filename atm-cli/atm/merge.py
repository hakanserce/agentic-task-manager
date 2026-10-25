"""Merging tasks.json, and `atm init`.

Registered as a git merge driver (`tasks.json merge=atm`), so branches that changed tasks.json merge task by task
instead of line by line. Design: docs/parallel-agents-design.md, option E and layer L3.
"""

import contextlib
import os
import re
import sys

from .core import SCRIPT_DIR, AtmError, AtmExit, git, in_git, now, out, read_json, rel, to_json, write_json_atomic
from .lock import locked
from .model import kind_of, load_tasks, vocabulary
from .paths import find_paths

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
