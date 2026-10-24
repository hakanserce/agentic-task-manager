"""Adding tasks: atm add (one task, or many from a JSON file). IDs come from meta.next_id under the lock, so two
agents adding at once never get the same one (docs/v4/data-model.md DM-2.3)."""

import os
import re

from .claims import agent_identity
from .core import AtmError, now_iso, out, read_json, to_json, write_json_atomic
from .lock import locked
from .model import load_tasks, status_for, vocabulary
from .paths import find_paths

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
