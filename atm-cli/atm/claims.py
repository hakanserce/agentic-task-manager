"""Claims: which agent works on which task, until when (the lease); and `next`.

Claims live in the git common directory, so all worktrees of a clone see them; tasks.json itself is per worktree.
Lock order: the task folder, then the claims store, so two commands can never wait on each other.
"""

import contextlib
import os
import socket
import sys
from datetime import timedelta

from .core import (
    AtmError,
    AtmExit,
    format_duration,
    git,
    now,
    now_iso,
    out,
    parse_iso,
    read_json,
    to_json,
    write_json_atomic,
)
from .lock import locked
from .model import change_status, load_tasks, natural_key, phase_of, unfinished_dependencies
from .paths import find_paths, project_root

CLAIMS_STORE = "claims.json"  # in <git common dir>/atm/, shared by all worktrees of a clone
CLAIMS_STORE_NO_GIT = "claims-store.json"  # in the task folder, outside git
CLAIMS_SNAPSHOT = "claims.json"  # in the task folder (gitignored): what the dashboard reads
DEFAULT_LEASE_MINUTES = 30


def agent_identity(agent=None):
    """--agent, else ATM_AGENT, else this Claude Code session, else user@host:worktree (stable across commands)."""
    if agent:
        return agent
    if os.environ.get("ATM_AGENT"):
        return os.environ["ATM_AGENT"]
    if os.environ.get("CLAUDE_CODE_SESSION_ID"):
        return "claude:" + os.environ["CLAUDE_CODE_SESSION_ID"][:8]
    user = os.environ.get("USER") or os.environ.get("USERNAME") or "user"
    return f"{user}@{socket.gethostname()}:{project_root(os.getcwd())}"


def claims_dir(paths):
    common = git(["rev-parse", "--git-common-dir"], paths["root"])
    if common:
        return os.path.join(os.path.normpath(os.path.join(paths["root"], common)), "atm")
    return paths["dir"]


def claims_store_path(paths):
    directory = claims_dir(paths)
    return os.path.join(directory, CLAIMS_STORE if directory != paths["dir"] else CLAIMS_STORE_NO_GIT)


@contextlib.contextmanager
def locked_with_claims(paths):
    """Hold the task folder's lock and, if it is elsewhere, the claims store's lock (always in this order)."""
    with contextlib.ExitStack() as stack:
        stack.enter_context(locked(paths["dir"]))
        if claims_dir(paths) != paths["dir"]:
            stack.enter_context(locked(claims_dir(paths)))
        yield


def read_store(paths):
    """The shared store: live `claims`, and `completed` tasks (done in some worktree; its tasks.json may be the only
    one that says so until the branches merge, so `next` must not hand those tasks out again elsewhere)."""
    data = read_json(claims_store_path(paths))
    data = data if isinstance(data, dict) else {}
    return {"claims": data.get("claims") or {}, "completed": data.get("completed") or {}}


def write_store(paths, store):
    os.makedirs(claims_dir(paths), exist_ok=True)
    write_json_atomic(claims_store_path(paths), store)
    write_claims_snapshot(paths, store["claims"])


def write_claims_snapshot(paths, claims):
    """The gitignored copy the dashboard polls: live claims, as a list."""
    if os.path.isdir(paths["dir"]):
        snapshot = {"generated_at": now_iso(), "claims": sorted(claims.values(), key=lambda c: c["task"])}
        write_json_atomic(os.path.join(paths["dir"], CLAIMS_SNAPSHOT), snapshot)


def lease_minutes(data):
    try:
        minutes = float(data.get("meta", {}).get("lease_minutes", DEFAULT_LEASE_MINUTES))
    except (TypeError, ValueError, AttributeError):
        return DEFAULT_LEASE_MINUTES
    return minutes if minutes > 0 else DEFAULT_LEASE_MINUTES


def lease_until(data):
    return (now() + timedelta(minutes=lease_minutes(data))).strftime("%Y-%m-%dT%H:%M:%SZ")


def expire_claims(paths, data, claims):
    """Drop claims whose lease ran out; their tasks in this worktree go back to todo. Returns the expired claims."""
    current = now()
    expired = []
    for task_id, claim in list(claims.items()):
        try:
            alive = parse_iso(claim["lease_expires_at"]) > current
        except (KeyError, TypeError, ValueError):
            alive = False
        if alive:
            continue
        expired.append(claims.pop(task_id))
        task = next((t for t in data["tasks"] if t.get("id") == task_id), None)
        if task and task.get("status") == "in_progress":
            stamp = now_iso()
            task["status"] = "todo"
            task["updated_at"] = stamp
            task.pop("started_at", None)
            task.pop("completed_at", None)
            task.pop("agent", None)
            task["last_failure"] = {"at": stamp, "reason": f"lease expired ({claim.get('agent')})"}
    return expired


def new_claim(paths, data, task_id, agent):
    return {
        "task": task_id,
        "agent": agent,
        "branch": git(["rev-parse", "--abbrev-ref", "HEAD"], paths["root"]),
        "worktree": paths["root"],
        "claimed_at": now_iso(),
        "lease_expires_at": lease_until(data),
    }


def completion(paths, task_id, agent):
    return {
        "task": task_id,
        "agent": agent,
        "branch": git(["rev-parse", "--abbrev-ref", "HEAD"], paths["root"]),
        "worktree": paths["root"],
        "completed_at": now_iso(),
    }


def check_holder(claims, task_id, agent, command):
    claim = claims.get(task_id)
    if claim and claim.get("agent") != agent:
        raise AtmError(
            f"can't {command} {task_id}: it is claimed by {claim.get('agent')} until {claim.get('lease_expires_at')}",
            4,
        )


def report_expired(expired):
    for claim in expired:
        sys.stderr.write(f"atm: lease of {claim['task']} by {claim.get('agent')} expired; it is available again\n")


def next_task(data, store, phase=None, task_type=None):
    """The loop's rule (same as the dashboard's "Next up"): todo, every dependency done, not claimed and not completed
    in another worktree, matching the filters; lowest phase first, then lowest ID. Returns (task, reason) where reason
    explains an empty result."""
    claims, completed = store["claims"], store["completed"]
    candidates = [
        t
        for t in data["tasks"]
        if t.get("status") == "todo"
        and (phase is None or phase_of(t) == phase)
        and (task_type is None or t.get("type") == task_type)
    ]
    taken = set(claims) | set(completed)
    ready = [t for t in candidates if not unfinished_dependencies(data, t) and t.get("id") not in taken]
    if ready:
        return min(ready, key=lambda t: (phase_of(t), natural_key(t.get("id")))), None
    if not candidates:
        return None, "nothing left to do"
    claimed = [t["id"] for t in candidates if t.get("id") in claims]
    done_elsewhere = [t["id"] for t in candidates if t.get("id") in completed]
    reason = f"{len(candidates)} todo task(s) waiting on dependencies"
    if claimed:
        reason += f" or claimed by other agents ({', '.join(claimed)})"
    if done_elsewhere:
        reason += f"; done in another worktree, not merged yet: {', '.join(done_elsewhere)}"
    return None, reason


def cmd_next(args):
    agent = agent_identity(args.agent)
    paths = find_paths(os.getcwd())
    with locked_with_claims(paths):
        data = load_tasks(paths)
        store = read_store(paths)
        claims = store["claims"]
        expired = expire_claims(paths, data, claims)
        task, reason = next_task(data, store, args.phase, args.type)
        if task and args.claim:
            change_status(task, data, "start", agent=agent)
            claims[task["id"]] = new_claim(paths, data, task["id"], agent)
        if expired or (task and args.claim):
            write_json_atomic(paths["tasks"], data)
            write_store(paths, store)
    report_expired(expired)
    claim = claims.get(task["id"]) if task and args.claim else None
    if args.json:
        out(to_json({"task": task, "claim": claim, "reason": reason}))
    elif task:
        verb = "Claimed" if claim else "Next"
        out(f"{verb}: {task['id']} {task.get('name', '')} (phase {task.get('phase')}, {task.get('type')})")
    else:
        out(f"No task available: {reason}.")
    if not task:
        raise AtmExit(3)


def cmd_heartbeat(args):
    task_id, agent = args.id, agent_identity(args.agent)
    paths = find_paths(os.getcwd())
    with locked_with_claims(paths):
        data = load_tasks(paths)
        store = read_store(paths)
        claims = store["claims"]
        expired = expire_claims(paths, data, claims)
        claim = claims.get(task_id)
        if claim:
            check_holder(claims, task_id, agent, "heartbeat")
            claim["lease_expires_at"] = lease_until(data)
        if expired:
            write_json_atomic(paths["tasks"], data)
        write_store(paths, store)
    if not claim:
        gone = any(c["task"] == task_id for c in expired)
        raise AtmError(f"{task_id} has no live claim" + (" (its lease expired)" if gone else ""), 4)
    if args.json:
        out(to_json(claim))
    else:
        out(f"{task_id}: lease extended to {claim['lease_expires_at']}")


def cmd_claims(args):
    paths = find_paths(os.getcwd())
    with locked_with_claims(paths):
        data = load_tasks(paths)
        store = read_store(paths)
        claims = store["claims"]
        if expire_claims(paths, data, claims):
            write_json_atomic(paths["tasks"], data)
        write_store(paths, store)
    live = sorted(claims.values(), key=lambda c: c["task"])
    if args.json:
        out(to_json(live))
        return
    if not live:
        out("No live claims.")
        return
    current = now()
    for c in live:
        left = format_duration((parse_iso(c["lease_expires_at"]) - current).total_seconds())
        out(f"{c['task']}  {c.get('agent')}  {c.get('branch') or '-'}  {left} left  ({c.get('worktree')})")
