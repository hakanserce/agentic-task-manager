"""The status commands (start, review, done, fail, release, reject) and notes."""

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
from .model import add_note, archive_hint, change_status, find_task, load_tasks, touch
from .paths import find_paths
from .query import describe_task, ready_tasks


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
                waiting_on=getattr(args, "on", None),
                questions=getattr(args, "question", None) or [],
                answers=getattr(args, "answer", None) or [],
            )
            if command == "start":
                claims[task_id] = new_claim(paths, data, task_id, agent)
                store["completed"].pop(task_id, None)  # starting a task again on purpose
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
