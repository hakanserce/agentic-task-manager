"""Loading tasks.json, the project's vocabularies, looking tasks up, and the status transitions themselves.

Every rule is written against a status's kind, never its name (docs/v4/data-model.md §3): a project may name its own
statuses in meta.statuses, each with one of the six kinds below.
"""

import os
import re

from .core import AtmError, now_iso, read_json

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
    "done": (("active",), "done"),
    "fail": (("active",), "todo"),
    "release": (("active",), "todo"),
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
    for field in ("started_at", "completed_at", "started_by", "completed_by", "agent", "commit"):
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
    stamp = now_iso()
    if new_kind == "todo":
        back_to_todo(task, vocab, agent, stamp)
        if command == "fail":
            add_note(task, "failure", reason or "verification failed", agent, stamp)
        elif note:
            add_note(task, "handoff", note, agent, stamp)
        return current
    task["status"] = new
    touch(task, agent, stamp)
    if command == "start":
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
