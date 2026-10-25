"""Reading tasks: show, list, status, deps. Agents read tasks through these, never tasks.json itself (DM-1.1).

Text output is short and stable, for agents to read; --json is for anything that parses it (CLI-3.3). These commands
never write: they read tasks.json and the claims store without the lock (both are replaced atomically).
"""

import json
import os

from .claims import next_task, read_store
from .core import out, to_json
from .model import (
    archive_hint,
    archive_path,
    archived_task,
    find_task,
    kind_of,
    load_archive,
    load_tasks,
    natural_key,
    phase_of,
    priority_rank,
    unfinished_dependencies,
    vocabulary,
)
from .paths import find_paths


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
    out(f"by phase: {pairs(result['by_phase'])}")
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
