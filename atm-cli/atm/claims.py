"""Claims: which agent works on which task, until when (the lease); and `next`.

Claims live in the git common directory, so all worktrees of a clone see them; tasks.json itself is per worktree.
Lock order: the task folder, then the claims store, so two commands can never wait on each other.
"""

import contextlib
import json
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
from .model import (
    add_note,
    back_to_todo,
    change_status,
    kind_of,
    load_tasks,
    natural_key,
    phase_of,
    priority_rank,
    unfinished_dependencies,
    vocabulary,
)
from .paths import find_paths, project_root
from .registry import register_if_needed

CLAIMS_STORE = "claims.json"  # in <git common dir>/atm/, shared by all worktrees of a clone
CLAIMS_STORE_NO_GIT = "claims-store.json"  # in the task folder, outside git
CLAIMS_SNAPSHOT = "claims.json"  # in the task folder (gitignored): what the dashboard reads
DEFAULT_LEASE_MINUTES = 30


def agent_identity(agent=None):
    """Who runs the command (the actor, DM-4.5): --agent, else ATM_AGENT, else this Claude Code session, else the git
    user's name (a person in a terminal), else user@host."""
    if agent:
        return agent
    if os.environ.get("ATM_AGENT"):
        return os.environ["ATM_AGENT"]
    if os.environ.get("CLAUDE_CODE_SESSION_ID"):
        return "claude:" + os.environ["CLAUDE_CODE_SESSION_ID"][:8]
    name = git(["config", "user.name"], project_root(os.getcwd()))
    if name:
        return name
    user = os.environ.get("USER") or os.environ.get("USERNAME") or "user"
    return f"{user}@{socket.gethostname()}"


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
    one that says so until the branches merge, so `next` must not hand those tasks out again elsewhere); and `hints`,
    when each hint was last shown (so `done` repeats one at most once a day)."""
    data = read_json(claims_store_path(paths))
    data = data if isinstance(data, dict) else {}
    hints = data.get("hints") if isinstance(data.get("hints"), dict) else {}
    return {"claims": data.get("claims") or {}, "completed": data.get("completed") or {}, "hints": hints}


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
    vocab = vocabulary(data)
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
        if task and kind_of(vocab, task.get("status")) == "active":
            stamp = now_iso()
            back_to_todo(task, vocab, None, stamp)
            add_note(task, "failure", f"lease expired ({claim.get('agent')})", None, stamp)
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
    in another worktree, matching the filters; lowest phase first, then the most urgent priority, then lowest ID.
    Returns (task, reason) where reason explains an empty result."""
    claims, completed = store["claims"], store["completed"]
    vocab = vocabulary(data)
    candidates = [
        t
        for t in data["tasks"]
        if kind_of(vocab, t.get("status")) == "todo"
        and (phase is None or phase_of(t) == phase)
        and (task_type is None or t.get("type") == task_type)
    ]
    taken = set(claims) | set(completed)
    ready = [t for t in candidates if not unfinished_dependencies(data, t) and t.get("id") not in taken]
    if ready:
        order = lambda t: (phase_of(t), priority_rank(vocab, t.get("priority")), natural_key(t.get("id")))
        return min(ready, key=order), None
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
            change_status(task, data, "start", agent=agent, status=args.status)
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


AUTO_RENEW_AFTER = timedelta(minutes=10)


def hook_input():
    """The JSON a Claude Code hook gets on stdin ({session_id, cwd, ...}), or {}."""
    if sys.stdin is None or sys.stdin.isatty():
        return {}
    try:
        value = json.loads(sys.stdin.read() or "{}")
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {}


def renewed_at(claim):
    try:
        return parse_iso(claim.get("renewed_at") or claim["claimed_at"])
    except (KeyError, TypeError, ValueError):
        return None


def auto_heartbeat(args):
    """`heartbeat --auto`, run by the plugin's PostToolUse hook after every tool call (CLI-6.2): renew this agent's
    live claims once their last renewal is ten minutes old. Most calls only read the claims store; it never prints
    and never fails, so a tool call is never disturbed."""
    try:
        payload = hook_input()
        if payload.get("session_id") and not (args.agent or os.environ.get("ATM_AGENT")):
            agent = "claude:" + str(payload["session_id"])[:8]
        else:
            agent = agent_identity(args.agent)
        cwd = payload.get("cwd") if isinstance(payload.get("cwd"), str) and os.path.isdir(payload["cwd"]) else os.getcwd()
        paths = find_paths(cwd)
        if not paths["tasks_exists"]:
            return
        try:
            register_if_needed(paths)  # list the project on the dashboard (one read of the registry when it is)
        except Exception:
            pass
        current = now()

        def due(claims):
            return [
                c
                for c in claims.values()
                if isinstance(c, dict)
                and c.get("agent") == agent
                and parse_iso(c["lease_expires_at"]) > current
                and (renewed_at(c) is None or current - renewed_at(c) >= AUTO_RENEW_AFTER)
            ]

        if not due(read_store(paths)["claims"]):
            return
        with locked_with_claims(paths):
            data = load_tasks(paths)
            store = read_store(paths)
            for claim in due(store["claims"]):
                claim["lease_expires_at"] = lease_until(data)
                claim["renewed_at"] = now_iso()
            write_store(paths, store)
    except Exception:  # a hook must never break the tool call it follows
        return


def cmd_heartbeat(args):
    if args.auto:
        auto_heartbeat(args)
        return
    if not args.id:
        raise AtmError("atm heartbeat needs a task ID (or --auto)", 2)
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
            claim["renewed_at"] = now_iso()
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
