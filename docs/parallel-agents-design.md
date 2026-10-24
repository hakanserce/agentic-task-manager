# Parallel agents and tasks.json: analysis and recommended protocol

**Status:** proposal, for review · **Date:** 2026-10-23 · **Feeds:** FR-8 in `docs/v3-requirements.md`

## 1. How tasks.json is changed today

- **The agent edits the whole file.** `/atm:do-task` and `/atm:loop-tasks` read `tasks.json`, change one task's
  `status` and timestamps, and write it back with ordinary file edits. Nothing stops two agents doing this at the
  same time.
- **Picking a task takes two steps.** The loop reads the file, chooses the next ready task, and only later writes
  `in_progress`. Another agent can read the file in between and choose the same task.
- **Commits sweep in everything.** After each task the skills run `git add -A`, so a commit contains whatever is
  in the working tree, including another agent's unfinished changes.
- **The dashboard reads the file over HTTP** every few seconds while agents are writing it.

## 2. Scenarios and what goes wrong

| | Scenario | Example |
|---|---|---|
| S1 | Several agents, **one working tree** (same branch) | Two Claude Code sessions in the same folder, both running `/atm:loop-tasks` |
| S2 | Several **worktrees of one clone**, one agent each, different branches | `git worktree add ../wt-2 -b agent-2`, an agent in each |
| S3 | **Branches** merged back later (PRs), in one clone | Work on `feature-a` and `feature-b`, both updating task statuses |
| S4 | Several **clones or machines** (laptops, CI, cloud agents) sharing one remote | A cloud agent and a local agent on the same project |
| S5 | **Humans and the dashboard** reading or editing while agents write | Editing priorities in `tasks.json` mid-loop |

| | Failure | S1 | S2 | S3 | S4 | S5 |
|---|---|---|---|---|---|---|
| F1 | **Lost update:** two read-modify-write cycles overlap and one change is silently lost | ● | | | | ● |
| F2 | **Double claim:** two agents start the same task | ● | ● | ● | ● | |
| F3 | **Torn read:** the dashboard or another agent reads a half-written, invalid file | ● | | | | ● |
| F4 | **Cross-contaminated commits:** `git add -A` commits another agent's work | ● | | | | |
| F5 | **Stale view:** each worktree or branch has its own copy, so nobody sees the others' claims | | ● | ● | ● | |
| F6 | **Merge conflicts** in `tasks.json` | | ● | ● | ● | |
| F7 | **Abandoned claims:** an agent crashes and its task stays `in_progress` forever | ● | ● | ● | ● | |
| F8 | **Shared working tree side effects:** two agents edit the same source files or run builds/tests at once | ● | | | | |

F8 is not about `tasks.json` at all. It is why one working tree per agent is the recommended setup (§5).

### Evidence

Tested on 2026-10-23 in scratch repositories seeded with this repo's own `docs/tasks.json` (pretty-printed, as the
skills write it), using plain `git merge`, `git worktree` and `git push`. FR-8.10 turns these experiments into
automated tests.

| Experiment | Result |
|---|---|
| Two branches change the status of **adjacent** tasks (T-030, T-031) | Clean merge: each task is a ~15-line block, so the changes don't touch |
| Two branches **finish** adjacent tasks (status and new timestamp fields) | Clean merge |
| Two branches **claim the same task** | Conflict. This is a real double claim (F2), discovered only at merge time, after both agents did the work |
| Two branches **add a new task** at the end of the list | Conflict |
| Append-only `events.jsonl` with `merge=union` in `.gitattributes`, two branches appending | Clean merge |
| Two worktrees of one clone: `git rev-parse --git-common-dir` | Same directory for both. A file written there by one worktree is immediately visible to the other |
| Claims as git refs on a shared remote: two clones push `refs/atm/claims/T-030` | First push wins; the second is rejected as non-fast-forward. After the owner deletes the ref, the other clone can claim it |
| `python3` with `fcntl.flock` | Available; the protocol uses a lock directory instead, which also works on Windows (§4) |

## 3. Alternatives

**A. Instructions only.** Tell agents to re-read before writing and avoid running in parallel. Costs nothing,
fixes nothing: LLM tool calls can't be made atomic by asking nicely.

**B. One helper tool for all status changes, with a file lock and atomic writes.** A small script shipped with the
plugin (`atm`) does read → modify → write-to-temp → rename while holding an OS file lock. Agents call it instead of
editing JSON by hand. This fixes lost updates and torn reads within one working tree (F1, F3), and makes
"choose the next task" and "claim it" one atomic step (F2 in S1). It only works where processes share a file
system.

**C. Claims in the git common directory.** Every worktree of a clone shares `$(git rev-parse --git-common-dir)`.
A `claims.json` there, guarded by the same kind of lock, lets agents in different worktrees see each other's
claims instantly (F2 and F5 for S2), without committing anything. It doesn't reach other clones.

**D. Append-only event log instead of editing statuses.** Status changes become lines in `events.jsonl`
(`claim`, `start`, `done`, …), merged with git's `union` driver. This merges cleanly across branches (F6), but the
current status has to be computed by replaying events (in the dashboard and the skills), and `tasks.json` stops
being the readable source of truth humans edit. Both sides of a duplicate claim survive the merge, so F2 is
detected, not prevented.

**E. A custom git merge driver for tasks.json.** Registered in `.gitattributes` (`tasks.json merge=atm`). It
merges task by task: a status can only move forward (`todo` → `in_progress` → `done`), the newest timestamps win,
new tasks from both sides are kept (renumbered if their IDs collide), and real conflicts (different edits to the
same task's definition) stay conflicts. It fixes F6 while keeping `tasks.json` as the readable source of truth.
Each clone has to register the driver in its git config once.

**F. Claims as refs on the shared remote.** Claiming a task pushes `refs/atm/claims/<task-id>`. The push only
succeeds if the ref doesn't exist yet, so it acts as a first-come lock across clones and machines (F2 for S4).
It needs network access and push rights, and it adds latency to every claim.

**G. A coordinator service.** A local daemon (or the dashboard server, or an MCP server) is the only writer; agents
call its API. This is the cleanest model for S1/S2 and can push live updates to the dashboard, but it is a
long-running process that must be running, and it doesn't help across machines unless it is hosted somewhere.

**H. An external tracker as the source of truth** (GitHub Issues/Projects, Linear). Real concurrency control and
web UI, but network-dependent, much slower to change, and it abandons atm's file-based, offline design.

| | F1 | F2 | F3 | F4 | F5 | F6 | F7 | Offline | Complexity |
|---|---|---|---|---|---|---|---|---|---|
| A Instructions | | | | | | | | ✓ | none |
| B Helper + lock + atomic write | ✓ | S1 | ✓ | | | | with leases | ✓ | low |
| C Claims in git common dir | | S1, S2 | | | S2 | | with leases | ✓ | low |
| D Event log, union merge | ✓ | detect only | ✓ | | | ✓ | with leases | ✓ | high (replay everywhere) |
| E Merge driver | | detect only | | | | ✓ | | ✓ | medium |
| F Remote claim refs | | S1–S4 | | | S4 | | with leases | | medium |
| G Coordinator service | ✓ | S1, S2 | ✓ | | S1, S2 | | ✓ | ✓ | high (process to manage) |
| H External tracker | ✓ | ✓ | ✓ | | ✓ | ✓ | | | high |
| **Commit hygiene** (§4 L4) | | | | ✓ | | | | ✓ | low |

No single option covers everything. The cheap ones (B, C, E, commit hygiene) combine without overlap, and F adds
multi-machine safety for those who need it.

## 4. Recommended protocol

Five layers, each solving the failures the previous ones can't:

**L1. A single writer tool.** The plugin ships `scripts/atm`, a Python helper behind a small launcher (see Runtime
below). Every status change goes through it; skills never hand-edit status fields:

```
atm next --claim                 # atomically: choose the next ready task (loop rule) and claim it
atm start T-012 | done T-012 | fail T-012 | release T-012
atm heartbeat T-012              # extend the claim's lease during long tasks
atm claims                       # who holds what, with lease expiry
```

Each command takes the project lock (below), re-reads `tasks.json`, applies the change, writes a temporary file,
`fsync`s it and renames it over the original. The dashboard and other agents therefore only ever see a complete old
or new file (F1, F3). The tool also writes `started_at`/`completed_at`, so skills can't get them wrong.

**Runtime.** The helper is a single Python 3.9+ script using only the standard library, run through a small
launcher (`scripts/atm`, POSIX sh) that explains what to install if Python is missing. An earlier draft shipped it
twice, in Python and Node; that was dropped in review because two hand-written copies of the locking and merge logic
would drift. The options considered (an embedded Lua core, Haxe, a compiled Go binary, and others) are in
`docs/helper-runtime-proposal.md`; a single binary is the upgrade path if Node-only environments or Windows need
support.

**The lock.** The lock is a **lock directory** rather than `flock`, so the same protocol keeps working if the helper is
ever ported (to a Windows build or a single binary): `mkdir .agentic-task-manager/.lock` succeeds for exactly one process
(atomic on every OS and file system, including Windows), and is removed when the command finishes. The holder writes
`owner.json` inside it (host, pid, start time). A waiting process retries for up to 10 seconds; it breaks
the lock only when the owner is on the same host and its pid is gone, or the lock is older than 60 seconds (a
command holds it for milliseconds). This loses `flock`'s automatic release on crash, but stale-lock breaking covers
that, and it works on Windows too (§6 Q4). The claims file in the git common directory
uses the same protocol.

**L2. Claims with leases and agent identity.** A claim records the task, the agent identity (session ID if
available, otherwise `hostname:pid`), branch, worktree path, `claimed_at` and `lease_expires_at` (default 30
minutes, extended by `atm heartbeat`). Claims are stored in `$(git rev-parse --git-common-dir)/atm/claims.json`,
shared by all worktrees of the clone (S2), under a lock of their own. Outside a git repository they fall back to
`.agentic-task-manager/claims.json`. `atm next --claim` skips tasks with a live claim. An expired lease frees the
task again: it moves back to `todo`, with a note on who held it (F7). For the dashboard, the tool also writes a
read-only snapshot, `.agentic-task-manager/claims.json`, which is gitignored.

`done` also leaves a **completion record** in the shared store. Each worktree has its own `tasks.json`, so a task
finished in worktree A still reads `todo` in worktree B until the branches merge. Without the record, B's
`atm next` would hand it out again as soon as A's claim was gone. `atm next` skips completed tasks, and
`atm start <id>` clears the record, so deliberately redoing a task stays possible. (Found while writing the stress
test: 16 agents in two worktrees over 40 tasks.)

**L3. Merge-safe tasks.json.** `atm init` (run by `/atm:create-tasks` and on first use) adds
`tasks.json merge=atm` to `.agentic-task-manager/.gitattributes` and registers the driver in the clone's git
config. The driver merges task by task as described in option E. Branches that update different tasks already merge
cleanly today; the driver additionally handles new tasks on both sides and status races, and leaves only real
definition conflicts to humans (F6).

**L4. Commit hygiene.** Skills stop running `git add -A`. They commit `tasks.json` plus exactly the files the task
changed, collected from the agent's own edits, so a commit never carries another agent's unfinished work (F4).

**L5. Optional: remote claims.** With `"coordination": "remote"` in `tasks.json` meta, `atm next --claim` also
pushes `refs/atm/claims/<task-id>` and only proceeds if the push succeeds. `release`, `done` and lease expiry delete
the ref. This covers agents on different clones or machines (S4). It's opt-in because it needs network access and
push rights.

### Setup per scenario

| Scenario | Recommended setup | Layers in play |
|---|---|---|
| S1 one working tree | Allowed for small, non-overlapping tasks; one agent per working tree is better (F8) | L1, L2, L4 |
| **S2 worktrees (recommended for parallel work)** | One worktree and branch per agent, all from one clone; merge back via PRs | L1, L2, L3, L4 |
| S3 branches/PRs | Status changes merge automatically; definition edits on both sides still need a human | L3 |
| S4 several clones or machines | Enable remote claims | L1–L5 |
| S5 humans editing | Run `atm` commands, or edit `tasks.json` while no loop is writing; the lock makes the window small | L1 |

### The rules agents follow (to be written into the skills)

1. Never change `status`, `started_at` or `completed_at` by editing `tasks.json`; use `atm`.
2. Get work only through `atm next --claim` (or `atm start <id>`, which fails if someone else holds the task).
3. Every 10 minutes or so during long tasks, run `atm heartbeat <id>`.
4. Finish with `atm done <id>`. If you give up, use `atm fail <id>`; this releases the claim.
5. Commit only the files you changed, plus `tasks.json`; never `git add -A`.
6. For parallel work, one agent per worktree.

## 5. What this does not solve

- **Two agents editing the same source files** in one working tree (F8). The remedy is one worktree per agent.
- **Conflicting definition edits** (two branches rewriting the same task's description) remain normal merge
  conflicts, as they should.
- **Without remote claims**, two machines can still start the same task. L3 then merges the statuses, but the
  duplicated work has already happened.

## 6. Open questions

1. ~~Python as the helper's language~~ — decided: Python 3.9+ only, one implementation (Runtime, §4;
   `docs/helper-runtime-proposal.md`).
2. **Lease length:** 30 minutes by default? Agent tasks so far take 0.5 to 19 minutes.
3. **Remote claims (L5):** in this round, or wait until someone needs multi-machine work?
4. **Windows:** the lock-directory protocol already works on Windows, so what remains is the launcher (a `.cmd`
   twin of `scripts/atm`) and testing. Now, or later?
