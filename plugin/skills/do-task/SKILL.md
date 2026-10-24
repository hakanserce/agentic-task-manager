---
name: do-task
description: >
  Execute a single task from tasks.json. Updates status to in_progress, does
  the work, runs verification, then marks done. Use when the user says
  "do task T-xxx", "work on task", "implement task", "pick a task", or "next task".
---

# Do a Single Task

You are a task execution agent. You pick up one task from `tasks.json`,
implement it, verify it, and mark it done.

## Step 1: Locate and load tasks.json

From the project root, run the plugin's helper:

```bash
"${CLAUDE_SKILL_DIR}/../../scripts/atm" migrate
```

It keeps the project's `.agentic-task-manager/` folder in order:
- an old `docs/tasks.json` (or `tasks.json` in the project root) is moved into `.agentic-task-manager/`; the move is
  staged in git, not committed;
- the dashboard there (`tasks-dashboard.html`, a copy that isn't committed) is installed or updated to the plugin's
  version.

Relay what it prints, except "Nothing to migrate.". If it exits with code 127, Python 3.9 or newer is not installed:
atm needs it, so ask the user to install it and stop.

The task file is `.agentic-task-manager/tasks.json` at the project root. If the helper said "No tasks.json found",
tell the user:
> No tasks.json found. Run `/atm:create-tasks` first to generate tasks from your requirements.

Read and parse the file. Build a map of task IDs to task objects.

## Step 2: Select and claim a task

Every status change goes through the plugin's helper. Below, `atm` stands for
`"${CLAUDE_SKILL_DIR}/../../scripts/atm"`: write out that full path in each command, run from the project root.
It locks the task file while it changes it, writes the timestamps, and records which agent works on which task (a
**claim**), so other agents running at the same time won't take the same task. Never edit `status`, `started_at`,
`completed_at` or `updated_at` in tasks.json yourself.

**Statuses have kinds.** A project may name its own statuses (`meta.statuses` in tasks.json); each has one of six
kinds: `todo`, `active` (in progress), `review`, `blocked`, `done` and `skipped`. atm works by kind, so below "to do",
"in progress", "in review" and "done" mean any status of that kind. When a kind has several statuses (for example
`awaiting_user` and `awaiting_agent`, both `review`), pass `--status <id>` with the one whose name or label fits;
otherwise atm uses the first one listed.

If `$ARGUMENTS` specifies a task ID (e.g., `T-005` or `T-P1-03`), run `atm start <id>`. It refuses, with a message,
when the task isn't to do, when a dependency isn't done yet (it lists them), or when another agent has claimed it
(exit code 4). Report the message and stop:
> **Task $ID can't start:** (the message)
>
> Complete the blocking tasks first, or pick a different task.

If no task ID is given, run `atm next --claim --json`. It picks the **next available task** (to do, all
dependencies done, not claimed by another agent; lowest phase first, then the most urgent priority — `P0` before `P3`,
a task without one counting as the default `P2` — then lowest task ID), starts it and claims it in one step. The JSON
has the task under `"task"`.

If the task has notes (`"notes"`), read them first: a `rejection` says what a reviewer wants changed, a `handoff` what
the previous agent left unfinished, a `failure` why an earlier attempt failed.

If it exits with code 3, no task is available; its `"reason"` says why. Report clearly:
> **No tasks available.** (the reason)
>
> Remaining tasks:
> - (list any todo/in_progress tasks and what blocks them)

The dashboard shows the change immediately.

## Step 5: Execute the task

Read the task's `description` carefully and implement exactly what it says.

Execution approach by task type:

- **feature**: Write the code described. Create new files or modify existing ones as specified in the `files` array. Follow existing project conventions (code style, patterns, frameworks).
- **test**: Write tests as described. Use the project's existing test framework. Ensure tests are runnable.
- **bugfix** / **bug**: Investigate the issue described, identify the root cause, implement the fix.
- **infra**: Set up the infrastructure, configuration, or tooling described.
- **docs**: Write the documentation described. Follow existing doc conventions.
- **refactor**: Restructure the code as described. Ensure no functionality changes.
- **polish**: Make the UI/UX improvements described.

Use the `files` array as hints for which files to create or modify, but also create
any additional files that are needed. Keep a list of every file you create, change or delete: Step 7b commits
exactly those.

On a long task, run `atm heartbeat $TASK_ID` every ten minutes or so (before a long build or test run is a good
moment). Your claim has a lease (30 minutes by default); if it runs out, the task goes back to `todo` for others.

## Step 6: Verify

After implementation, verify the work:

1. **Build check**: If the project has a build command (check package.json scripts, Makefile, Cargo.toml, build.gradle, etc.), run it and ensure it passes.
2. **Test check**: If you wrote tests or the task is a test task, run the relevant test suite.
3. **Lint check**: If the project has a linter configured, run it on changed files.
4. **Self-review**: Quickly review your changes for obvious issues — missing imports, typos, logic errors.

If verification fails:
- Try to fix the issue (up to 2 attempts)
- If still failing after 2 attempts, run `atm fail $TASK_ID --reason "<one line on what failed>"` (the task goes back
  to `todo` and the reason is recorded) and report the failure

## Step 7: Mark as done, or ask for a review

If verification passes, decide how the task ends:

- **A review is asked for** — by the task's description, the project's instructions (e.g. its `CLAUDE.md`) or the
  user, whether by the user or by another agent: run `atm review $TASK_ID --note "<what the reviewer should check>"`
  (with `--status <id>` when the project has several review statuses and one fits, e.g. `awaiting_user`). The task
  moves to in review, your claim is released, and the tasks that depend on it keep waiting until the review passes.
  Commit your work as usual (Step 7b) and report the task as **waiting for review**.
- **Otherwise**: run `atm done $TASK_ID`. It sets the status and `completed_at`, and drops your claim.

If either says your lease expired and another agent holds the task, tell the user instead of committing.

**Reviewing a task** (when the user or another agent asks you to review one that is in review): read its `review`
note and the commit, then either pass it with `atm done <id>`, or send it back with
`atm reject <id> --reason "<what needs to change>"`. A rejected task returns to to do with the reason as a `rejection`
note, for the next agent to address.

## Step 7b: Git commit

After marking the task as done (or in review), commit the changes.
If the helper moved files in Step 1 and you are going to commit, first commit the move on its own:
`git commit -m "chore: move atm files to .agentic-task-manager/" -- <old tasks.json> .agentic-task-manager/tasks.json .agentic-task-manager/.gitignore`
(add the old `tasks-dashboard.html` path too if it was removed). Then commit the task.
- `git add -- <the files from your list> .agentic-task-manager/tasks.json` (`git add -A -- <path>` for a deleted
  file; also add `.agentic-task-manager/.gitignore` and `.agentic-task-manager/.gitattributes` if `git status` shows
  them staged by atm)
- `git commit -m "feat($TASK_ID): $TASK_NAME"`

Never `git add -A` or `git add .`: another agent's unfinished work may be in the same working tree.

This is the default behavior. Do NOT push — only commit locally.

## Step 8: Report

Output a concise completion report:

> **Completed: $TASK_ID — $TASK_NAME** (or **Waiting for review: $TASK_ID — $TASK_NAME**, with who reviews it)
>
> **What was done:** (2-3 sentence summary)
>
> **Files changed:**
> - path/to/file1 (created/modified)
> - path/to/file2 (created/modified)
>
> **Verification:** ✅ Build passed, tests passed
>
> **Now unblocked:** (list task IDs that were waiting on this task, if any; none while it waits for review)
