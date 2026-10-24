"""The status commands (start, done, fail, release) and notes."""

import os

from .claims import (
    agent_identity,
    check_holder,
    completion,
    expire_claims,
    locked_with_claims,
    new_claim,
    read_store,
    report_expired,
    write_store,
)
from .core import now_iso, out, to_json, write_json_atomic
from .lock import locked
from .model import add_note, change_status, find_task, load_tasks, touch
from .paths import find_paths


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
