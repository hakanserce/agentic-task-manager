"""The archive: finished tasks moved out of tasks.json into tasks-archive.json, so the working file stays small
(docs/v4/data-model.md §5). Both files stay readable JSON in the same format, merged by the same driver.

A move writes one file, then the other. A task found in both files keeps its tasks.json copy and loses the
archive's: an archive that crashed halfway simply hasn't happened, an unarchive that crashed halfway is complete, and
no task is ever lost.
"""

import os
from datetime import timedelta

from .core import AtmError, now, now_iso, out, parse_iso, to_json, write_json_atomic
from .edit import next_number
from .lock import locked
from .merge import ensure_archive_merge
from .model import archive_path, kind_of, load_archive, load_tasks, phase_of, vocabulary
from .paths import find_paths

DEFAULT_KEEP_DAYS = 14


def keep_days(data, override=None):
    if override is not None:
        return override
    settings = data.get("meta", {}).get("archive") if isinstance(data.get("meta"), dict) else None
    days = settings.get("keep_days") if isinstance(settings, dict) else None
    return days if isinstance(days, (int, float)) and not isinstance(days, bool) and days >= 0 else DEFAULT_KEEP_DAYS


def finished_at(task):
    for key in ("completed_at", "updated_at"):
        try:
            return parse_iso(task[key])
        except (KeyError, TypeError, ValueError):
            continue
    return None


def archivable(data, phases=None, before=None, keep=None):
    """The tasks `atm archive` would move (DM-5.1): done- and skipped-kind, not finished in the last `keep` days,
    not in an open PR; only `phases` and those finished before `before`, when given."""
    vocab = vocabulary(data)
    recent = now() - timedelta(days=keep_days(data, keep))
    result = []
    for t in data["tasks"]:
        if kind_of(vocab, t.get("status")) not in ("done", "skipped"):
            continue
        if phases and phase_of(t) not in phases:
            continue
        if isinstance(t.get("pr"), dict) and not t.get("merged_at"):
            continue  # still in an open PR
        finished = finished_at(t)
        if finished is not None and finished > recent:
            continue
        if before is not None and (finished is None or finished >= before):
            continue
        result.append(t)
    return result


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
        write_json_atomic(paths["tasks"], data)
        archive["tasks"] = [t for t in archive["tasks"] if t.get("id") not in args.ids]
        write_json_atomic(archive_path(paths), archive)
    if args.json:
        out(to_json({"restored": args.ids}))
    else:
        out(f"Brought back {', '.join(args.ids)} from the archive.")
