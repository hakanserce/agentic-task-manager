"""Loading tasks.json, looking tasks up, and the status transitions themselves."""

import os
import re

from .core import AtmError, now_iso, read_json

STATUS_CHANGES = {
    # command: (allowed current statuses, new status)
    "start": (("todo",), "in_progress"),
    "done": (("in_progress",), "done"),
    "fail": (("in_progress",), "todo"),
    "release": (("in_progress",), "todo"),
}


def load_tasks(paths):
    if not os.path.isfile(paths["tasks"]):
        raise AtmError(f"no tasks.json in {paths['dir']}. Run /atm:create-tasks first.")
    data = read_json(paths["tasks"])
    if not isinstance(data, dict) or not isinstance(data.get("tasks"), list):
        raise AtmError(f"{paths['tasks']} is not a valid task file (expected an object with a 'tasks' list)")
    return data


def find_task(data, task_id):
    for task in data["tasks"]:
        if task.get("id") == task_id:
            return task
    raise AtmError(f"no task {task_id}")


def unfinished_dependencies(data, task):
    status = {t.get("id"): t.get("status") for t in data["tasks"]}
    return [(dep, status.get(dep, "missing")) for dep in task.get("dependencies", []) if status.get(dep) != "done"]


def natural_key(task_id):
    """Sort T-2 before T-10, like the dashboard's localeCompare(..., { numeric: true })."""
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", str(task_id))]


def phase_of(task):
    return task.get("phase") if isinstance(task.get("phase"), (int, float)) else 0


def change_status(task, data, command, reason=None, agent=None):
    """Apply one status command to `task` (in `data`); raises AtmError if the transition isn't allowed. `start`
    records the agent in the task (kept when it is done, so the dashboard can show who did what)."""
    allowed, new = STATUS_CHANGES[command]
    current = task.get("status")
    if current not in allowed:
        raise AtmError(f"can't {command} {task['id']}: it is {current}, not {' or '.join(allowed)}")
    if command == "start":
        blocking = unfinished_dependencies(data, task)
        if blocking:
            raise AtmError(f"can't start {task['id']}: waiting on " + ", ".join(f"{d} ({s})" for d, s in blocking))
    stamp = now_iso()
    task["status"] = new
    task["updated_at"] = stamp
    if command == "start":
        task["started_at"] = stamp
        task.pop("completed_at", None)
        if agent:
            task["agent"] = agent
    elif command == "done":
        task["completed_at"] = stamp
    else:
        task.pop("started_at", None)
        task.pop("completed_at", None)
        task.pop("agent", None)
        if command == "fail":
            task["last_failure"] = {"at": stamp, "reason": reason or "verification failed"}
    return current
