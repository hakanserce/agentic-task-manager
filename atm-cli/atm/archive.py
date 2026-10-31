"""The archive: finished tasks moved out of tasks.json into tasks-archive.json, so the working file stays small
(docs/v4/data-model.md §5). Both files stay readable JSON in the same format, merged by the same driver.

A move writes one file, then the other. A task found in both files keeps its tasks.json copy and loses the
archive's: an archive that crashed halfway simply hasn't happened, an unarchive that crashed halfway is complete, and
no task is ever lost.
"""

import os

from .core import AtmError, now_iso, out, parse_iso, to_json, write_json_atomic
from .edit import next_number
from .lock import locked
from .merge import ensure_archive_merge
from .model import archivable, archive_path, find_sprint, load_archive, load_tasks, vocabulary
from .paths import find_paths


def drop_duplicates(data, archive):
    """Tasks in both files keep their tasks.json copy (see the module docstring). Returns the dropped IDs."""
    ids = {t.get("id") for t in data["tasks"]}
    dropped = [t.get("id") for t in archive["tasks"] if t.get("id") in ids]
    archive["tasks"] = [t for t in archive["tasks"] if t.get("id") not in ids]
    return dropped


def size_kb(p):
    return os.path.getsize(p) // 1024 if os.path.isfile(p) else 0


def describe_ids(ids, limit=12):
    return ", ".join(ids[:limit]) + (f" and {len(ids) - limit} more" if len(ids) > limit else "")


def cmd_archive(args):
    before = None
    if args.before:
        try:
            before = parse_iso(args.before if "T" in args.before else args.before + "T00:00:00Z")
        except ValueError:
            raise AtmError(f"--before {args.before}: use a date like 2026-05-01", 2)
    phases = [float(p) for p in args.phase] if args.phase else None
    paths = find_paths(os.getcwd())
    with locked(paths["dir"]):
        data = load_tasks(paths)
        archive = load_archive(paths)
        dropped = drop_duplicates(data, archive)
        moving = archivable(data, phases, before, args.keep_days)
        if args.sprint:
            vocab = vocabulary(data)
            names = set()
            for name in args.sprint:
                sprint = find_sprint(vocab, name)
                if sprint is None:
                    raise AtmError(f"no sprint {name!r}", 2)
                names.add(sprint["id"])
            moving = [t for t in moving if (find_sprint(vocab, t.get("sprint")) or {}).get("id") in names]
        ids = [t.get("id") for t in moving]
        if not args.dry_run and (moving or dropped):
            # New IDs must never come back to an archived ID (DM-2.3)
            if not isinstance(data.get("meta"), dict):
                data["meta"] = {}
            data["meta"]["next_id"] = next_number(data)
            archive.setdefault("meta", {})["archived_at"] = now_iso()
            archive["tasks"].extend(moving)
            write_json_atomic(archive_path(paths), archive)
            moved = set(ids)
            data["tasks"] = [t for t in data["tasks"] if t.get("id") not in moved]
            # The dashboard shows the count without loading the archive (dashboard D-5.4)
            data["meta"]["archived"] = len(archive["tasks"])
            write_json_atomic(paths["tasks"], data)
            ensure_archive_merge(paths)
    result = {
        "moved": ids,
        "dry_run": bool(args.dry_run),
        "tasks_kb": size_kb(paths["tasks"]),
        "archive_kb": size_kb(archive_path(paths)),
        "duplicates_dropped": dropped,
    }
    if args.json:
        out(to_json(result))
        return
    if dropped and not args.dry_run:
        out(f"Kept {describe_ids(dropped)} in tasks.json and dropped the archive's copy (an interrupted move).")
    if not ids:
        out("Nothing to archive.")
    elif args.dry_run:
        out(f"Would archive {len(ids)} task(s): {describe_ids(ids)}.")
    else:
        out(
            f"Archived {len(ids)} task(s): {describe_ids(ids)}. "
            f"tasks.json is now {result['tasks_kb']} KB, tasks-archive.json {result['archive_kb']} KB."
        )


def cmd_unarchive(args):
    paths = find_paths(os.getcwd())
    with locked(paths["dir"]):
        data = load_tasks(paths)
        archive = load_archive(paths)
        drop_duplicates(data, archive)
        by_id = {t.get("id"): t for t in archive["tasks"]}
        missing = [i for i in args.ids if i not in by_id]
        if missing:
            raise AtmError(f"not in the archive: {', '.join(missing)}")
        # tasks.json first: a crash here leaves the task in both files, and it stays in tasks.json
        data["tasks"].extend(by_id[i] for i in args.ids)
        if not isinstance(data.get("meta"), dict):
            data["meta"] = {}
        data["meta"]["archived"] = len(archive["tasks"]) - len(set(args.ids))
        write_json_atomic(paths["tasks"], data)
        archive["tasks"] = [t for t in archive["tasks"] if t.get("id") not in args.ids]
        write_json_atomic(archive_path(paths), archive)
    if args.json:
        out(to_json({"restored": args.ids}))
    else:
        out(f"Brought back {', '.join(args.ids)} from the archive.")
