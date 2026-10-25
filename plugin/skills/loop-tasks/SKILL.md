---
name: loop-tasks
description: >
  Loop through available tasks in tasks.json, executing them one by one
  until all are done or no more can be started. Supports flags for auto-commit,
  push strategies, phase/type filters, and pause-between-tasks mode.
  Use when the user says "loop tasks", "do all tasks", "run the loop",
  "Ralph Wiggum it", or "automate the tasks".
allowed-tools: Bash(atm *)
---

# Loop Tasks — Ralph Wiggum Mode 🫠

*"I'm helping!"*

You are a task loop agent. You continuously pick up the next available task,
execute it, and move on to the next one until there's nothing left to do.

## Parse Arguments

Parse `$ARGUMENTS` for optional flags (all are optional):

| Flag | Default | Description |
|---|---|---|
| `--phase <N>` | all | Only work on tasks in phase N |
| `--type <type>` | all | Only work on tasks of a specific type |
| `--max <N>` | unlimited | Stop after completing N tasks |
| `--dry-run` | off | Show what would be executed without doing it |
| `--pause` | off | Ask for user confirmation between each task |
| `--no-commit` | off | Disable the default git commit after each task |
| `--push` | off | Git commit + push after each task |
| `--batch-push` | off | Git commit after each task, single push at the end |
| `--push-every <N>` | off | Git commit after each task, push every N completions |

If no arguments are provided, run all available tasks with no pausing and auto-commit after each task (default behavior).

## Locate tasks.json

Before anything else (also for `--dry-run`):

From the project root, run atm-cli, the plugin's `atm` command:

```bash
atm migrate
```

(The plugin's `bin/` is on your PATH while the plugin is enabled. If the shell says `atm: command not found`, write
`"${CLAUDE_SKILL_DIR}/../../bin/atm"` instead of `atm`, here and in every later command.)

It keeps the project's `.agentic-task-manager/` folder in order:
- an old `docs/tasks.json` (or `tasks.json` in the project root) is moved into `.agentic-task-manager/`; the move is
  staged in git, not committed;
- the dashboard there (`tasks-dashboard.html`, a copy that isn't committed) is installed or updated to the plugin's
  version.

Relay what it prints, except "Nothing to migrate.". If it exits with code 127, Python 3.9 or newer is not installed:
atm needs it, so ask the user to install it and stop.

The task file is `.agentic-task-manager/tasks.json` at the project root. If the helper said "No tasks.json found",
tell the user to run `/atm:create-tasks` and stop.

If it moved files and committing is on (no `--no-commit`, and not `--dry-run`), commit the move on its own before the
first task:
`git commit -m "chore: move atm files to .agentic-task-manager/" -- <old tasks.json> .agentic-task-manager/tasks.json .agentic-task-manager/.gitignore`
(add the old `tasks-dashboard.html` path too if it was removed). With `--no-commit`, mention in the final summary that
the move is staged but not committed.

## Dry Run Mode

If `--dry-run` is set, do NOT execute any tasks. Instead:

1. Load tasks.json (`atm next --json` shows the first task the loop would take)
2. Walk through the selection logic and list tasks in the order they would execute
3. Show the dependency chain and estimated execution order
4. Report total count and exit

## atm

Every status change goes through `atm`, run from the project root. It locks the task file while it changes it, writes timestamps, and records which agent works on which task (a
**claim**), so several agents can run loops on one project, in one working tree or in separate git worktrees, without
taking the same task. Its exit codes: 0 ok, 3 no task available, 4 the task is claimed by another agent, 1 other
errors (the message says what).

**Rules:**
1. Never edit `status`, `started_at`, `completed_at` or `updated_at` in tasks.json yourself; use `atm`.
2. Get work only from `atm next --claim` (or `atm start <id>`).
3. Your claim's lease (30 minutes by default) is renewed by the plugin's hook while you work; if you stop, it runs
   out and the task goes back to `todo` for someone else (`atm heartbeat <id>` renews it by hand).
4. Finish with `atm done <id>`, or with `atm review <id> --note "..."` when a review is asked for (step 5 below);
   give up with `atm fail <id> --reason "..."`.
5. Commit only the files you changed for the task, plus `.agentic-task-manager/tasks.json`. Never `git add -A`
   or `git add .`: another agent's unfinished work may be in the same working tree.
6. **Statuses have kinds.** A project may name its own statuses; each has one of six kinds (`todo`, `active`,
   `review`, `blocked`, `done`, `skipped`) and atm works by kind, so "to do", "in review" and "done" below mean any
   status of that kind. When a kind has several statuses (e.g. `awaiting_user` and `awaiting_agent`, both `review`),
   pass `--status <id>` with the one whose name or label fits; otherwise atm uses the first one listed.

## The Main Loop

```
completed_count = 0

while true:

    1. If --max is set and completed_count >= max → EXIT the loop

    2. GET the next task:
       - Without --pause: `atm next --claim --json [--phase N] [--type T]`
         This picks the next task by the loop's rule (to do, all dependencies done, not claimed by another
         agent; lowest phase, then the most urgent priority, then lowest task ID; a task without a priority counts
         as the default, P2) and starts and claims it in one step, so no other agent can take it. The JSON has the
         task under "task".
       - With --pause: `atm next --json [--phase N] [--type T]` (looks without claiming), then show it and ask:
         "About to start $TASK_ID: $TASK_NAME. Proceed? (y/n/skip/quit)"
         - 'n' or 'quit' → EXIT the loop
         - 'skip' → leave it, remember to skip it, and continue with the next iteration
         - 'y' → `atm start $TASK_ID`; if that fails (another agent was faster), continue with the next iteration
       - Exit code 3 means no task is available ("reason" says why) → EXIT the loop

    3. EXECUTE the task:
       - Read the task description carefully (re-read tasks.json if you need the other tasks: a human or another
         agent may have changed it), and its notes: a `rejection` says what a reviewer wants changed, a `handoff`
         what the previous agent left unfinished
       - Implement what it describes (same approach as /atm:do-task Step 5)
       - Follow project conventions
       - Keep a list of the files you create, change or delete for this task

    4. VERIFY the task:
       - Run build/test/lint if available (same as /atm:do-task Step 6)
       - If verification fails after 2 attempts:
         - `atm fail $TASK_ID --reason "<one line on what failed>"`
         - Log the failure
         - Continue to next iteration (the failed task is back in todo; skip it for the rest of this loop)

    5. FINISH the task:
       - If a review is asked for (by the task's description, the project's instructions or the user; by the user
         or by another agent): `atm review $TASK_ID --note "<what the reviewer should check>"` (with `--status`
         when one of several review statuses fits). The claim is released and the tasks that depend on it keep
         waiting; the loop goes on with other ready tasks. Count it as waiting for review, not completed.
       - Otherwise: `atm done $TASK_ID`

    6. completed_count += 1 (for done tasks)

    7. GIT OPERATIONS (default: commit after each task):
        - Unless --no-commit is set:
          - `git add -- <the files from your list> .agentic-task-manager/tasks.json`
            (`git add -A -- <path>` for a deleted file; also add `.agentic-task-manager/.gitignore` and
            `.agentic-task-manager/.gitattributes` if `git status` shows them staged by atm)
          - `git commit -m "feat($TASK_ID): $TASK_NAME"`
        - If --push:
          - git push
        - If --push-every <N> and completed_count % N == 0:
          - git push

    8. BRIEF REPORT for this task:
        - "✅ $TASK_ID: $TASK_NAME — done ($completed_count completed so far)"
        - or "👀 $TASK_ID: $TASK_NAME — waiting for review by <who>"

    9. Loop back to step 1
```

## On Loop Exit

When the loop ends (no more tasks, max reached, or user quit), output a final summary:

> **Loop complete!**
>
> **Completed this session:** N tasks
> - T-001: Task name
> - T-002: Task name
> - ...
>
> **Waiting for review:** N tasks (with who reviews each; their dependents wait until the review passes)
> **Remaining:** N tasks still to do
> **Blocked:** N tasks waiting on dependencies
> **Failed:** N tasks that failed verification (if any)
>
> To pass a review: `atm done <id>`; to send it back: `atm reject <id> --reason "..."`.
>
> **Next steps:** (list tasks that are now available to work on, if any)

If `--batch-push` was set, run `git push` now.

## Error Handling

- If tasks.json cannot be read → stop the loop, report the error
- If a task fails verification → `atm fail` it (back to todo), skip it, continue
- If `atm` exits with code 4 (claimed by another agent) → leave that task alone and continue
- If `atm` reports that your lease expired → another agent may have taken the task: stop working on it, don't
  commit it, and continue with the next iteration
- If git commit/push fails → log a warning but continue the loop
- If the task description is too vague to execute → `atm release $TASK_ID`, skip it,
  note it in the summary as "skipped: unclear description"

## Important Notes

- **atm re-reads tasks.json for every command.** The human watching the dashboard might change a task's status,
  add new tasks, or re-prioritize while the loop runs; the next `atm next` sees it.
- **Every status change is written immediately** (by atm), so the dashboard stays live.
- **Running several loops at once** works: each one claims its own tasks. For agents that edit code in parallel, give
  each its own git worktree (`git worktree add ../project-2 -b agent-2`) so they don't edit the same files.
- **Don't skip verification.** Quality matters even in a loop.
- **Respect the --pause flag.** When set, always wait for user input.
