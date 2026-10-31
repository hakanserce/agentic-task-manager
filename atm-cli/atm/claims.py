"""Claims: which agent works on which task, until when (the lease); and `next`.

Claims live in the git common directory, so all worktrees of a clone see them; tasks.json itself is per worktree.
Lock order: the task folder, then the claims store, so two commands can never wait on each other.
"""

import contextlib
import json
import os
import socket
import subprocess
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
    REWORK_STATES,
    add_note,
    back_to_todo,
    change_status,
    find_sprint,
    kind_of,
    load_tasks,
    natural_key,
    phase_of,
    priority_rank,
    unfinished_dependencies,
    vocabulary,
)
from .paths import find_paths, project_root
from .registry import main_worktree, register_if_needed

CLAIMS_STORE = "claims.json"  # in <git common dir>/atm/, shared by all worktrees of a clone
CLAIMS_STORE_NO_GIT = "claims-store.json"  # in the task folder, outside git
CLAIMS_SNAPSHOT = "claims.json"  # in the task folder (gitignored): what the dashboard reads
DEFAULT_LEASE_MINUTES = 30


def session_identity(session_id, cwd):
    """A Claude Code session's identity: "claude:" and 8 characters of its ID; in a linked git worktree, also
    "@<worktree folder>". Subagents share their parent's session ID, so agents spawned in separate worktrees still get
    identities of their own. The main worktree keeps the plain form, so its claims and history still match."""
    identity = "claude:" + str(session_id)[:8]
    root = project_root(cwd)
    if main_worktree(root) != root:
        identity += "@" + os.path.basename(root)
    return identity


def agent_identity(agent=None):
    """Who runs the command (the actor, DM-4.5): --agent, else ATM_AGENT, else this Claude Code session (per linked
    worktree, see session_identity), else the git user's name (a person in a terminal), else user@host."""
    if agent:
        return agent
    if os.environ.get("ATM_AGENT"):
        return os.environ["ATM_AGENT"]
    if os.environ.get("CLAUDE_CODE_SESSION_ID"):
        return session_identity(os.environ["CLAUDE_CODE_SESSION_ID"], os.getcwd())
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
    one that says so until the branches merge, so `next` must not hand those tasks out again elsewhere); `waiting`
    tasks (blocked or sent for review in some worktree, likewise); `resolved` ones (answered, passed, rejected or
    skipped in another worktree than the one they wait in, to be applied there); and `hints`, when each hint was last
    shown (so `done` repeats one at most once a day)."""
    data = read_json(claims_store_path(paths))
    data = data if isinstance(data, dict) else {}

    def section(key):
        return data.get(key) if isinstance(data.get(key), dict) else {}

    return {
        "claims": data.get("claims") or {},
        "completed": data.get("completed") or {},
        "waiting": section("waiting"),
        "resolved": section("resolved"),
        "hints": section("hints"),
    }


def waiting_record(paths, task):
    """The shared record of a task blocked or sent for review in this worktree (T-204)."""
    return {
        "task": task["id"],
        "status": task.get("status"),
        "waiting_on": task.get("waiting_on"),
        "questions": list(task.get("questions") or []),
        "worktree": paths["root"],
        "branch": git(["rev-parse", "--abbrev-ref", "HEAD"], paths["root"]),
        "at": now_iso(),
    }


def apply_resolutions(paths, data, store):
    """Apply what was decided in another worktree about a task waiting in this one (store["resolved"]): the answer,
    the passed or rejected review, the skip, as if given here, so this worktree's copy stops waiting too. A task changed
    here in the meantime is left as it is. Returns the IDs applied."""
    applied = []
    for task_id, record in list(store["resolved"].items()):
        if not isinstance(record, dict) or record.get("worktree") != paths["root"]:
            continue
        store["resolved"].pop(task_id)
        task = next((t for t in data["tasks"] if t.get("id") == task_id), None)
        if task is None:
            continue
        try:
            change_status(
                task,
                data,
                record.get("command"),
                agent=record.get("by"),
                reason=record.get("reason"),
                answers=record.get("answers") or [],
            )
            applied.append(task_id)
        except (AtmError, KeyError):
            pass
    return applied


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
            back_to_todo(task, vocab, None, stamp, keep_commit=True)
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


def own_lease_expired(expired, data, task_id, agent, then):
    """When `agent`'s own claim on `task_id` is among the claims that just expired and the task went back to todo: an
    error that says so and how to go on (`then`, the command to run after `atm start`). Exit code 4, like a claim
    conflict. Another agent's expired claim, or none: None."""
    claim = next((c for c in expired if c.get("task") == task_id and c.get("agent") == agent), None)
    task = next((t for t in data["tasks"] if t.get("id") == task_id), None)
    if not claim or not task or kind_of(vocabulary(data), task.get("status")) != "todo":
        return None
    until = str(claim.get("lease_expires_at", ""))
    at = f"{until[11:16]} UTC" if len(until) >= 16 else until
    minutes = lease_minutes(data)
    idle = f"{minutes:g} min"
    kept = " Your commit is kept." if task.get("commit") else ""
    next_steps = f"Run `atm start {task_id}`" + (f", then `{then}` again." if then else " to claim it again.")
    return AtmError(
        f"{task_id}: your lease expired at {at} (no heartbeat for {idle}), so it went back to todo.{kept} {next_steps}",
        4,
    )


def report_expired(expired):
    for claim in expired:
        sys.stderr.write(f"atm: lease of {claim['task']} by {claim.get('agent')} expired; it is available again\n")


def ready_in_order(data, store, candidates=None, rank=None):
    """The to-do tasks the loop could take, in the order it takes them: every dependency done, not claimed, not
    completed or waiting in another worktree; by `rank` (the selection's own order, SR-3.2), then lowest phase (in
    files not yet migrated to sprints), then the most urgent priority, then lowest ID."""
    vocab = vocabulary(data)
    if candidates is None:
        candidates = [t for t in data["tasks"] if kind_of(vocab, t.get("status")) == "todo"]
    taken = set(store["claims"]) | set(store["completed"]) | set(store["waiting"])
    ready = [t for t in candidates if not unfinished_dependencies(data, t) and t.get("id") not in taken]
    rank = rank or (lambda t: 0)
    order = lambda t: (rank(t), phase_of(t), priority_rank(vocab, t.get("priority")), natural_key(t.get("id")))
    return sorted(ready, key=order)


class Selection:
    """What the loop works on (docs/sprints-and-releases-design.md §3.2): the active sprint (the default in a project
    with sprints), named sprints, a list of tasks, all tasks, or the backlog; `phase` and `task_type` narrow it."""

    def __init__(self, sprints=(), tasks=(), all_tasks=False, backlog=False, phase=None, task_type=None):
        self.sprints, self.tasks, self.all, self.backlog = list(sprints or []), list(tasks or []), all_tasks, backlog
        self.phase, self.task_type = phase, task_type


def select(data, sel):
    """The tasks `sel` covers, in any status, with how to rank them and a word for them. Returns (tasks, rank, scope,
    reason): reason is set when the selection can't be made (no active sprint, a closed sprint)."""
    vocab = vocabulary(data)
    sprints = vocab["sprints"]
    in_sprint = lambda names: (lambda t: (find_sprint(vocab, t.get("sprint")) or {}).get("id") in names)
    rank, scope, reason = None, "the tasks", None
    if sel.tasks:
        order = {task_id: i for i, task_id in enumerate(sel.tasks)}
        missing = [i for i in sel.tasks if i not in {t.get("id") for t in data["tasks"]}]
        if missing:
            raise AtmError(f"--tasks: no task {', '.join(missing)}", 2)
        keep, rank, scope = (lambda t: t.get("id") in order), (lambda t: order[t.get("id")]), "the listed tasks"
    elif sel.all:
        # The active sprint, then the planned ones in order, then the backlog (closed sprints' leftovers before it)
        place = {
            s["id"]: 0 if s["state"] == "active" else 1 + i if s["state"] == "planned" else len(sprints) + 1
            for i, s in enumerate(sprints)
        }
        keep = lambda t: True
        rank = lambda t: place.get((find_sprint(vocab, t.get("sprint")) or {}).get("id"), len(sprints) + 2)
        scope = "all tasks"
    elif sel.backlog:
        keep, scope = (lambda t: not find_sprint(vocab, t.get("sprint"))), "the backlog"
    elif sel.sprints:
        named = []
        for name in sel.sprints:
            sprint = find_sprint(vocab, name)
            if sprint is None:
                raise AtmError(f"no sprint {name!r}; the sprints: {', '.join(s['id'] for s in sprints) or 'none'}", 2)
            if sprint["state"] == "closed":
                raise AtmError(f"the sprint {sprint['id']!r} is closed", 2)
            named.append(sprint["id"])
        keep, scope = in_sprint(named), "the sprint " + " and ".join(f"“{n}”" for n in named)
    elif sprints:
        active = [s["id"] for s in sprints if s["state"] == "active"]
        if not active:
            return [], None, "the active sprint", "no active sprint: plan one with /atm:plan-sprint, or run with --all"
        keep, scope = in_sprint(active), f"the sprint “{active[0]}”"
    else:
        keep = lambda t: True  # a project without sprints: every task, as before sprints
    tasks = [
        t
        for t in data["tasks"]
        if keep(t)
        and (sel.phase is None or phase_of(t) == sel.phase)
        and (sel.task_type is None or t.get("type") == sel.task_type)
    ]
    return tasks, rank, scope, reason


def offered_to(data, task, agent):
    """Whether a task back from review (rework or approved) may go to `agent`: always to the agent that worked on it;
    to others once one lease length has passed since the review ended (SR-3.9, Q11)."""
    if not agent or task.get("started_by") == agent:
        return True
    try:
        reviewed = parse_iso(task.get("reviewed_at"))
    except (TypeError, ValueError):
        return True
    return now() >= reviewed + timedelta(minutes=lease_minutes(data))


def next_task(data, store, phase=None, task_type=None, sel=None, agent=None, with_user=False):
    """The loop's rule (same as the dashboard's "Next up"): todo, every dependency done, not claimed and not completed
    in another worktree, in the selection (the default one when `sel` is None); in its order, then lowest phase, then
    the most urgent priority, then lowest ID. Returns (task, reason) where reason explains an empty result: the
    selection is finished, the rest of it waits, or it is empty (SR-3.6)."""
    claims, completed, waiting = store["claims"], store["completed"], store["waiting"]
    vocab = vocabulary(data)
    sel = sel or Selection(phase=phase, task_type=task_type)
    selected, rank, scope, problem = select(data, sel)
    if problem:
        return None, problem
    # Tasks back from review come first (SR-3.9): the agent that worked on them gets them back for a lease length
    rework = [
        t
        for t in selected
        if kind_of(vocab, t.get("status")) == "review"
        and t.get("review_state") in REWORK_STATES
        and offered_to(data, t, agent)
    ]
    first = {t.get("id") for t in rework}
    candidates = rework + [t for t in selected if kind_of(vocab, t.get("status")) == "todo"]
    # Work done together with the user waits for them, unless they're watching (SR-3.5)
    together = [t for t in candidates if t.get("with") == "user"]
    if not with_user:
        candidates = [t for t in candidates if t.get("with") != "user"]
    in_order = rank or (lambda t: 0)
    ready = ready_in_order(data, store, candidates, lambda t: (t.get("id") not in first, in_order(t)))
    if ready:
        return ready[0], None
    if together and not with_user and not candidates:
        ids = ", ".join(t.get("id") for t in together)
        return None, f"only work done together with the user is left in {scope}: {ids} (--with-user takes it)"
    if not candidates:
        if not selected:
            if not vocab["sprints"]:
                return None, "nothing left to do"
            return None, f"{scope} {'has' if scope.startswith('the sprint') else 'have'} no tasks"
        kinds = [kind_of(vocab, t.get("status")) for t in selected]
        open_kinds = {k: kinds.count(k) for k in ("active", "review", "blocked") if k in kinds}
        if open_kinds:
            words = {"active": "in progress", "review": "in review", "blocked": "blocked"}
            what = ", ".join(f"{n} {words[k]}" for k, n in open_kinds.items())
            return None, f"nothing ready in {scope}: the rest is waiting ({what})"
        if vocab["sprints"]:
            return None, f"{scope} is finished: {kinds.count('done')} done" + (
                f", {kinds.count('skipped')} skipped" if kinds.count("skipped") else ""
            )
        return None, "nothing left to do"
    claimed = [t["id"] for t in candidates if t.get("id") in claims]
    done_elsewhere = [t["id"] for t in candidates if t.get("id") in completed]
    waiting_elsewhere = [t["id"] for t in candidates if t.get("id") in waiting]
    reason = f"{len(candidates)} todo task(s) waiting on dependencies"
    if claimed:
        reason += f" or claimed by other agents ({', '.join(claimed)})"
    if done_elsewhere:
        reason += f"; done in another worktree, not merged yet: {', '.join(done_elsewhere)}"
    if waiting_elsewhere:
        reason += f"; blocked or in review in another worktree: {', '.join(waiting_elsewhere)}"
    return None, reason


def cmd_next(args):
    agent = agent_identity(args.agent)
    paths = find_paths(os.getcwd())
    with locked_with_claims(paths):
        data = load_tasks(paths)
        store = read_store(paths)
        claims = store["claims"]
        expired = expire_claims(paths, data, claims)
        applied = apply_resolutions(paths, data, store)
        sel = Selection(
            sprints=args.sprint,
            tasks=[i.strip() for i in (args.tasks or "").split(",") if i.strip()],
            all_tasks=args.all,
            backlog=args.backlog,
            phase=args.phase,
            task_type=args.type,
        )
        task, reason = next_task(data, store, sel=sel, agent=agent, with_user=args.with_user)
        if task and args.claim:
            change_status(task, data, "start", agent=agent, status=args.status)
            claims[task["id"]] = new_claim(paths, data, task["id"], agent)
        if expired or applied or (task and args.claim):
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
        cwd = payload.get("cwd") if isinstance(payload.get("cwd"), str) and os.path.isdir(payload["cwd"]) else os.getcwd()
        if payload.get("session_id") and not (args.agent or os.environ.get("ATM_AGENT")):
            # The same identity atm commands get in that folder: a subagent in a linked worktree renews its own claims
            agent = session_identity(payload["session_id"], cwd)
        else:
            agent = agent_identity(args.agent)
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
        own = own_lease_expired(expired, data, task_id, agent, None)
        if own:
            raise own
        gone = any(c["task"] == task_id for c in expired)
        raise AtmError(f"{task_id} has no live claim" + (" (its lease expired)" if gone else ""), 4)
    if args.json:
        out(to_json(claim))
    else:
        out(f"{task_id}: lease extended to {claim['lease_expires_at']}")


def renew_claim(paths, task_id, agent):
    """Renew `agent`'s live claim on `task_id`. Returns the lease length in minutes; raises AtmError (exit code 4)
    when the task has no live claim or another agent holds it."""
    with locked_with_claims(paths):
        data = load_tasks(paths)
        store = read_store(paths)
        claim = store["claims"].get(task_id)
        try:
            alive = claim is not None and parse_iso(claim["lease_expires_at"]) > now()
        except (KeyError, TypeError, ValueError):
            alive = False
        if not alive:
            raise AtmError(f"{task_id} has no live claim", 4)
        check_holder(store["claims"], task_id, agent, "renew the claim on")
        claim["lease_expires_at"] = lease_until(data)
        claim["renewed_at"] = now_iso()
        write_store(paths, store)
    return lease_minutes(data)


def cmd_run(args):
    """`atm run <id> -- <command>`: run a long command (a full test suite, a build, a wait on CI) while keeping the
    claim on <id> alive. The plugin's hook renews claims only when the agent makes a tool call, and an agent waiting
    for a command makes none, so a wait longer than the lease would hand the task to someone else (T-203). The claim
    is renewed at the start (so a wrong ID or someone else's claim fails before anything runs) and then three times per
    lease; the command's output passes through unchanged, and atm exits with its exit code."""
    if not args.child:
        raise AtmError("atm run needs a command after --: atm run <id> -- <command> [args...]", 2)
    if args.every is not None and args.every <= 0:
        raise AtmError("--every must be more than 0 seconds", 2)
    agent = agent_identity(args.agent)
    paths = find_paths(os.getcwd())
    minutes = renew_claim(paths, args.id, agent)
    every = args.every if args.every is not None else max(60.0, minutes * 60 / 3)
    try:
        child = subprocess.Popen(args.child)
    except OSError as e:
        raise AtmError(f"can't run {args.child[0]}: {e.strerror}", 127)
    # Renewed from this (the main) thread between waits: the lock uses signals, which only work here
    renewing = True
    while True:
        try:
            code = child.wait(timeout=every)
            break
        except subprocess.TimeoutExpired:
            pass
        except KeyboardInterrupt:  # the command got the same interrupt; wait for it to end
            continue
        if renewing:
            try:
                renew_claim(paths, args.id, agent)
            except Exception as e:  # never stops the command; say so once and stop renewing
                sys.stderr.write(f"atm run: stopped renewing the claim on {args.id}: {e}\n")
                renewing = False
    if code:
        raise AtmExit(128 - code if code < 0 else code)  # a signal -N ends like a shell's 128+N


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
