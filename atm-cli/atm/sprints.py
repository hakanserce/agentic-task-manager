"""Sprints and the backlog (docs/sprints-and-releases-design.md §3.1): `atm sprints` lists, adds, edits and starts
sprints (meta.sprints), `atm move` moves tasks between sprints and the backlog, `atm backlog` lists the tasks with no
sprint. Every write is under the lock; a task's sprint changes only through set_sprint, which keeps its history."""

import os

from .claims import agent_identity
from .core import AtmError, now_iso, out, to_json, write_json_atomic
from .edit import open_sprint
from .lock import locked
from .model import (
    DATE,
    KINDS,
    MAX_SPRINT_NAME,
    find_sprint,
    find_task,
    kind_of,
    load_archive,
    load_tasks,
    set_sprint,
    touch,
    vocabulary,
)
from .paths import find_paths
from .query import list_lines, summary
from .sprint_names import generate_sprint_name


def sprint_overview(data, archived, include_closed):
    """The sprints in order, each with its task counts by kind (tasks.json and the archive): {..., tasks, by_kind}."""
    vocab = vocabulary(data)
    counts = {s["id"]: {kind: 0 for kind in KINDS} for s in vocab["sprints"]}
    for task in list(data["tasks"]) + list(archived):
        sprint = find_sprint(vocab, task.get("sprint")) if isinstance(task, dict) else None
        kind = kind_of(vocab, task.get("status")) if sprint else None
        if kind in KINDS:
            counts[sprint["id"]][kind] += 1
    return [
        {
            **s,
            "tasks": sum(counts[s["id"]].values()),
            "by_kind": {kind: n for kind, n in counts[s["id"]].items() if n},
        }
        for s in vocab["sprints"]
        if include_closed or s["state"] != "closed"
    ]


def describe_sprint(s):
    details = [s["state"]] + [f"{key} {s[key]}" for key in ("release", "due") if s.get(key)]
    counts = ", ".join(f"{kind} {n}" for kind, n in s["by_kind"].items())
    line = f"{s['id']} · {' · '.join(details)}: {s['tasks']} task{'' if s['tasks'] == 1 else 's'}"
    return line + (f" ({counts})" if counts else "") + (f"\n  goal: {s['goal']}" if s.get("goal") else "")


def taken_names(data, archived):
    """Every sprint name in use: the sprints, and the sprints tasks in either file name (compared case-insensitively
    by the caller)."""
    names = [s.get("id") for s in data.get("meta", {}).get("sprints") or [] if isinstance(s, dict)]
    for task in list(data["tasks"]) + list(archived):
        if isinstance(task, dict):
            names.append(task.get("sprint"))
            names.extend(e.get("sprint") for e in task.get("sprint_history") or [] if isinstance(e, dict))
    return [n for n in names if isinstance(n, str)]


def check_due(due):
    if due and not DATE.fullmatch(due):
        raise AtmError(f"--due {due!r}: use a date, YYYY-MM-DD", 2)
    return due


def apply_fields(sprint, args):
    """--goal, --release and --due on a sprint; an empty value removes the field. Returns the names changed."""
    changed = []
    for key, value in (("goal", args.goal), ("release", args.release), ("due", check_due(args.due))):
        if value is None:
            continue
        if value == "":
            if key in sprint:
                del sprint[key]
                changed.append(key)
        elif sprint.get(key) != value:
            sprint[key] = value
            changed.append(key)
    return changed


def in_backlog(vocab, task, finished=False):
    """A task with no sprint; a finished one only with `finished`."""
    return not task.get("sprint") and (finished or kind_of(vocab, task.get("status")) not in ("done", "skipped"))


def sprints_list(paths, include_closed, as_json):
    data = load_tasks(paths)
    sprints = sprint_overview(data, load_archive(paths)["tasks"], include_closed)
    vocab = vocabulary(data)
    backlog = [t for t in data["tasks"] if in_backlog(vocab, t)]
    if as_json:
        out(to_json({"sprints": sprints, "backlog": len(backlog)}))
        return
    if not sprints:
        out(
            "No open sprints (--all lists the closed ones)."
            if vocab["sprints"]
            else "No sprints yet: atm sprints add creates one."
        )
    for s in sprints:
        out(describe_sprint(s))
    out(f"backlog: {len(backlog)} task{'' if len(backlog) == 1 else 's'} (atm backlog)")


def sprints_add(paths, args):
    with locked(paths["dir"]):
        data = load_tasks(paths)
        vocab = vocabulary(data)
        name = (args.name or "").strip() or generate_sprint_name(
            vocab["sprint_names"], taken_names(data, load_archive(paths)["tasks"])
        )
        if find_sprint(vocab, name):
            raise AtmError(f"there is already a sprint {find_sprint(vocab, name)['id']!r}", 2)
        if len(name) > MAX_SPRINT_NAME:
            raise AtmError(f"a sprint name is at most {MAX_SPRINT_NAME} characters", 2)
        sprint = {"id": name, "state": "planned"}
        apply_fields(sprint, args)
        meta = data.setdefault("meta", {})
        sprints = list(meta.get("sprints") or [])
        position = len(sprints)
        if args.after:
            after = find_sprint(vocab, args.after)
            if after is None:
                raise AtmError(f"no sprint {args.after!r} to add it after", 2)
            position = next(i for i, s in enumerate(sprints) if s.get("id") == after["id"]) + 1
        sprints.insert(position, sprint)
        meta["sprints"] = sprints
        vocabulary(data)
        write_json_atomic(paths["tasks"], data)
    out(to_json(sprint) if args.json else f"Added the sprint “{name}” (planned).")


def stored_sprint(data, name):
    """The sprint called `name` as stored in meta.sprints (to change it), or an error naming the sprints."""
    vocab = vocabulary(data)
    found = find_sprint(vocab, name)
    if found is None:
        known = ", ".join(s["id"] for s in vocab["sprints"]) or "none yet: atm sprints add"
        raise AtmError(f"no sprint {name!r}; the sprints: {known}", 2)
    return next(s for s in data["meta"]["sprints"] if s.get("id") == found["id"])


def sprints_edit(paths, args):
    with locked(paths["dir"]):
        data = load_tasks(paths)
        sprint = stored_sprint(data, args.name)
        changed = apply_fields(sprint, args)
        if changed:
            vocabulary(data)
            write_json_atomic(paths["tasks"], data)
    if args.json:
        out(to_json(sprint))
    else:
        out(f"{sprint['id']}: changed {', '.join(changed)}" if changed else f"{sprint['id']}: nothing changed")


def sprints_start(paths, args):
    with locked(paths["dir"]):
        data = load_tasks(paths)
        sprint = stored_sprint(data, args.name)
        state = sprint.get("state", "planned")
        if state == "closed":
            raise AtmError(f"the sprint {sprint['id']!r} is closed; closed sprints aren't started again", 2)
        if state == "active":
            raise AtmError(f"the sprint {sprint['id']!r} is already active", 2)
        active = [s["id"] for s in vocabulary(data)["sprints"] if s["state"] == "active"]
        if active:
            raise AtmError(f"the sprint {active[0]!r} is active; close it first (one active sprint at a time)", 2)
        sprint["state"] = "active"
        sprint["start"] = now_iso()
        write_json_atomic(paths["tasks"], data)
    out(to_json(sprint) if args.json else f"The sprint “{sprint['id']}” is now active.")


def cmd_sprints(args):
    paths = find_paths(os.getcwd())
    if args.action in (None, "list"):
        if args.name is not None:
            raise AtmError(f"unexpected argument '{args.name}'", 2)
        sprints_list(paths, args.all, args.json)
    elif args.action == "add":
        sprints_add(paths, args)
    else:
        if not args.name:
            raise AtmError(f"atm sprints {args.action} needs a sprint name", 2)
        (sprints_edit if args.action == "edit" else sprints_start)(paths, args)


def move_target(vocab, task, to):
    """The sprint ID (or None, the backlog) `atm move --to` means for `task`."""
    if to == "backlog":
        return None
    if to == "active":
        active = [s["id"] for s in vocab["sprints"] if s["state"] == "active"]
        if not active:
            raise AtmError("no sprint is active (atm sprints start <name>)", 2)
        return active[0]
    if to == "next":
        # The first planned sprint after the task's own (for a task in the backlog or a closed sprint: the first
        # planned sprint)
        sprints = vocab["sprints"]
        current = find_sprint(vocab, task.get("sprint"))
        start = sprints.index(current) + 1 if current else 0
        following = [s["id"] for s in sprints[start:] if s["state"] == "planned"]
        if not following:
            raise AtmError(
                f"{task['id']}: no planned sprint after {current['id'] if current else 'the active one'}; "
                'add one with atm sprints add ["<name>"]',
                2,
            )
        return following[0]
    return open_sprint(vocab, to)


def cmd_move(args):
    actor = agent_identity(args.agent)
    paths = find_paths(os.getcwd())
    moved = []
    with locked(paths["dir"]):
        data = load_tasks(paths)
        vocab = vocabulary(data)
        plans = []
        for task_id in args.ids:
            task = find_task(data, task_id)
            kind = kind_of(vocab, task.get("status"))
            if kind == "active":
                raise AtmError(f"{task_id} is in progress (claimed): it stays where the work is happening", 2)
            if kind in ("done", "skipped"):
                raise AtmError(f"{task_id} is {task.get('status')}: finished work stays in the sprint it was done in", 2)
            plans.append((task, move_target(vocab, task, args.to)))
        stamp = now_iso()
        for task, target in plans:
            before = task.get("sprint")
            if set_sprint(task, target, stamp):
                touch(task, actor, stamp)
            moved.append({"id": task["id"], "from": before, "to": target})
        if any(m["from"] != m["to"] for m in moved):
            write_json_atomic(paths["tasks"], data)
    if args.json:
        out(to_json(moved))
        return
    for m in moved:
        before, after = m["from"] or "backlog", m["to"] or "backlog"
        out(f"{m['id']}: {before} -> {after}" if before != after else f"{m['id']}: already in {after}")


def cmd_backlog(args):
    paths = find_paths(os.getcwd())
    data = load_tasks(paths)
    vocab = vocabulary(data)
    tasks = [t for t in data["tasks"] if in_backlog(vocab, t, finished=args.all)]
    if args.json:
        out(to_json([summary(vocab, t) for t in tasks]))
    elif not tasks:
        out("The backlog is empty.")
    else:
        for line in list_lines(vocab, tasks):
            out(line)
