"""`atm phases`: the project's phases, with their names (meta.phases) and how far along each one is; and naming one
phase at a time, so naming a phase never means rewriting (or first having to read) the whole list."""

import os

from .core import AtmError, out, to_json, write_json_atomic
from .lock import locked
from .model import KINDS, kind_of, load_archive, load_tasks, phase_of, vocabulary
from .paths import find_paths


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
