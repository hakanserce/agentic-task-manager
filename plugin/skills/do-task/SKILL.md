---
name: do-task
description: >
  Execute a single task from tasks.json. Updates status to in_progress, does
  the work, runs verification, then marks done. Use when the user says
  "do task T-xxx", "work on task", "implement task", "pick a task", or "next task".
allowed-tools: Bash(atm *)
---

# Do a Single Task

You are a task execution agent. You pick up one task from `tasks.json`,
implement it, verify it, and mark it done.

**Never read or edit `tasks.json` or `tasks-archive.json` directly** (no Read, cat, grep, jq or scripts on them):
every read and every change goes through `atm`, which knows the archive, the project's vocabulary and the locking.

| To | Run |
|---|---|
| see the overview: counts, what's in progress, in review or blocked, what's next | `atm status` |
| read tasks in full (description, dependencies, files, notes) | `atm show <id>...` |
| see what a task waits for, and what waits for it | `atm deps <id>` |
| find tasks | `atm list [--status S] [--phase N] [--ready] [--blocked] [--label L]` |
| change a later task's definition | `atm edit <id> ...` |
| change a status | `atm start`, `done`, `review`, `block`, `fail`, `release` (below) |

Every command takes `--json`.

## Step 1: Prepare the task folder

From the project root, run atm-cli, the plugin's `atm` command:

```bash
atm migrate
```

(The plugin's `bin/` is on your PATH while the plugin is enabled. If the shell says `atm: command not found`, write
`"${CLAUDE_SKILL_DIR}/../../bin/atm"` instead of `atm`, here and in every later command.)

It keeps the project's `.agentic-task-manager/` folder in order:
- an old `docs/tasks.json` (or `tasks.json` in the project root) is moved into `.agentic-task-manager/`; the move is
  staged in git, not committed;
- the project is added to the dashboard's list of projects (one dashboard, served by `/atm:serve`, shows them all);
- what older versions left there is cleaned up (the project's own copy of the dashboard and its own server).

Relay what it prints, except "Nothing to migrate.". If it exits with code 127, Python 3.9 or newer is not installed:
atm needs it, so ask the user to install it and stop.

If it said "No tasks.json found", tell the user:
> No tasks.json found. Run `/atm:create-tasks` first to generate tasks from your requirements.

## Step 2: Select and claim a task

Every status change goes through `atm`, run from the project root. It locks the task file while it changes it, writes the timestamps, and records which agent works on which task (a
**claim**), so other agents running at the same time won't take the same task. Never edit `status`, `started_at`,
`completed_at` or `updated_at` in tasks.json yourself.

**Statuses have kinds.** A project may name its own statuses (`meta.statuses` in tasks.json); each has one of six
kinds: `todo`, `active` (in progress), `review`, `blocked`, `done` and `skipped`. atm works by kind, so below "to do",
"in progress", "in review" and "done" mean any status of that kind. When a kind has several statuses (for example
`awaiting_user` and `awaiting_agent`, both `review`), pass `--status <id>` with the one whose name or label fits;
otherwise atm uses the first one listed.

If `$ARGUMENTS` specifies a task ID (e.g., `T-005` or `T-P1-03`), run `atm start <id> --json`; the JSON has the task
under `"task"`, in full. It refuses, with a message,
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

If it exits with code 3, no task is available; its `"reason"` says why. Run `atm status` and report clearly:
> **No tasks available.** (the reason)
>
> (what `atm status` says is in progress, in review, blocked or waiting, and on what)

The dashboard shows the change immediately.

## Step 5: Execute the task

Read the task's `description` carefully and implement exactly what it says. When it builds on other tasks, read
them with `atm show <id>` (`atm deps <id>` lists what it waits for and what waits for it).

Execution approach by task type:

- **feature**: Write the code described. Create new files or modify existing ones as specified in the `files` array. Follow existing project conventions (code style, patterns, frameworks).
- **test**: Write tests as described. Use the project's existing test framework. Ensure tests are runnable.
- **bugfix** / **bug**: Investigate the issue described, identify the root cause, implement the fix.
- **infra**: Set up the infrastructure, configuration, or tooling described.
- **docs**: Write the documentation described. Follow existing doc conventions.
- **refactor**: Restructure the code as described. Ensure no functionality changes.
- **polish**: Make the UI/UX improvements described.

Use the `files` array as hints for which files to create or modify, but also create
any additional files that are needed. Keep a list of every file you create, change or delete: Step 7 commits
exactly those.

Your claim has a lease (30 minutes by default); if it runs out, the task goes back to `todo` for others. The plugin's
hook renews it after each of your tool calls, so you don't need to (`atm heartbeat $TASK_ID` does it by hand). A
command that runs for many minutes (a full test suite, a build, waiting on CI), especially one you leave running in
the background, makes no tool calls: run it as `atm run $TASK_ID -- <command> [args...]`, which keeps the claim
alive while it runs and exits with the command's exit code.

While you work:
- **A later task needs to change** (what you built changes its scope, its files or its dependencies): update it with
  `atm edit <id>` (`--description`, or `--description-file <file>` for several lines, `--add-dep`/`--remove-dep`,
  `--add-file`/`--remove-file`, `--add-label`, ...). Descriptions are Markdown, as `/atm:create-tasks` writes them.
  Its status changes only through the status commands.
- **You can't go on without a decision** (two reasonable designs, a missing requirement, a credential): ask instead of
  guessing. `atm block $TASK_ID --on user --question "<one question>" [--question ...]` releases your claim and shows
  the task as waiting on the user, with the questions. Use `--on agent` when the project or the user hands such
  decisions to a reviewer agent. Commit what is worth keeping first (Step 7), then block it, and report the
  questions.
- **You have to stop before it's finished**: `atm release $TASK_ID --note "<what's done, what's left>"`. The note is a
  `handoff` for whoever takes the task next.
- **Something worth remembering** that isn't the outcome: `atm note $TASK_ID "<text>"` (notes are at most 500
  characters; put longer text in a file in the repository).

Notes, questions, answers and reasons (`--note`, `--question`, `--answer`, `--reason`, `atm note`) show on the
dashboard as Markdown: put paths, commands and identifiers in `` `code` `` and use `*italics*` or `**bold**` where
they help; keep them short, without headings.

**Answering a block** (when the user or an agent decides): `atm unblock <id> --answer "<answer>" [--answer ...]`, one
answer per question, in order. The task goes back to to do with the questions and answers kept as an `answer` note,
which the next agent reads.

## Step 6: Verify

After implementation, verify the work:

1. **Build check**: If the project has a build command (check package.json scripts, Makefile, Cargo.toml, build.gradle, etc.), run it and ensure it passes.
2. **Test check**: If you wrote tests or the task is a test task, run the relevant test suite.
3. **Lint check**: If the project has a linter configured, run it on changed files.
4. **Self-review**: Quickly review your changes for obvious issues — missing imports, typos, logic errors.

Run a long check through `atm run $TASK_ID -- <command>` (e.g. `atm run $TASK_ID -- npm run verify`), so your claim
doesn't expire while it runs.

If verification fails:
- Try to fix the issue (up to 2 attempts)
- If still failing after 2 attempts, run `atm fail $TASK_ID --reason "<one line on what failed>"` (the task goes back
  to `todo` and the reason is recorded) and report the failure

## Step 7: Commit, while the task is still in progress

**Commit first, then mark the task done** (Step 7b): a task is done only once its work is committed. If you marked it
done first and the commit failed, the task would show as done with its work uncommitted.

If `atm migrate` moved files in Step 1, first commit the move on its own:
`git commit -m "chore: move atm files to .agentic-task-manager/" -- <old tasks.json> .agentic-task-manager/tasks.json .agentic-task-manager/.gitignore`
(add the old `tasks-dashboard.html` path too if it was removed). Then commit the task:

```bash
atm commit $TASK_ID --file <path> --file <path> ...
```

Name **every** file from your list, deleted ones too (also `.agentic-task-manager/.gitignore` and
`.agentic-task-manager/.gitattributes` if `git status` shows atm changed them); paths are relative to where you run
it. atm commits exactly those plus `tasks.json`, with the project's commit message (`feat($TASK_ID): $TASK_NAME`
unless the project sets another), and records the commit on the task. It refuses `.`, `-A` and directories: another
agent's unfinished work may be in the same working tree, so never `git add -A` or `git add .` either.

**If the commit fails**, the task stays in progress: fix the cause (a hook, a file you forgot) and commit again. If
you can't, don't mark it done: `atm release $TASK_ID --note "<what's done; why the commit failed>"`, or block it on
what it waits for, and tell the user.

The same goes for a task you are about to send for review or block (Step 5): commit what is worth keeping first.

This is the default behavior. Do NOT push — only commit locally (`/atm:push` pushes, when the user asks for it).

## Step 7b: Mark as done, or ask for a review

(A task you blocked in Step 5 is already finished here.)

Once the commit is in, decide how the task ends:

- **A review is asked for** — by the task's description, the project's instructions (e.g. its `CLAUDE.md`) or the
  user, whether by the user or by another agent: run `atm review $TASK_ID --note "<what the reviewer should check>"`
  (with `--status <id>` when the project has several review statuses and one fits, e.g. `awaiting_user`). The task
  moves to in review, your claim is released, and the tasks that depend on it keep waiting until the review passes.
  Report the task as **waiting for review**.
- **Otherwise**: run `atm done $TASK_ID --note "<one-line outcome>"`. It sets the status and `completed_at`, records
  the outcome as a note (the commit atm recorded stays), drops your claim, and prints the tasks it made ready
  ("Now ready:").

This status change is written to `tasks.json` after the commit, so it goes in with the next commit, like the commit's
SHA. If either command says your lease expired (exit code 4), the task went back to todo with your commit kept: run
`atm start $TASK_ID`, then the same command again. If another agent has claimed it in the meantime, tell the user.

**Reviewing a task** (when the user or another agent asks you to review one that is in review): read its `review`
note and the commit, then either pass it with `atm done <id>`, or send it back with
`atm reject <id> --reason "<what needs to change>"`. A rejected task returns to to do with the reason as a `rejection`
note, for the next agent to address.

**A task marked done by mistake** (its work isn't finished or committed): `atm reopen <id> --reason "<why>"` takes it
back to to do. Never change its status by editing `tasks.json`.

## Step 7c: Archive when atm suggests it

`atm done`, `atm status` and `atm migrate` say when `tasks.json` has grown big enough that archiving would help
("tasks.json is … KB with … finished tasks; `atm archive` would move …"; with `--json`, a `suggest.archive` object).
If one of them said so during this task, archive now, after the task's commit (never in the middle of a task):

1. Skip this step if the project's instructions (e.g. its `CLAUDE.md`) say not to archive automatically, or if the
   hint's `"auto"` is `false` (`atm status --json`, under `suggest.archive`: the project set `meta.archive.auto`
   to false); then only relay the hint to the user.
2. `atm archive` moves finished tasks to `.agentic-task-manager/tasks-archive.json` (recent ones and those in an open
   PR stay) and prints what it moved.
3. Commit that on its own:
   `git add -- .agentic-task-manager/tasks.json .agentic-task-manager/tasks-archive.json .agentic-task-manager/.gitattributes`
   then `git commit -m "chore: archive N finished tasks" -- .agentic-task-manager/tasks.json .agentic-task-manager/tasks-archive.json .agentic-task-manager/.gitattributes`
   (leave out `.gitattributes` if `git status` doesn't show it changed).
4. Tell the user in one line: "Archived N finished tasks (`atm unarchive <id>` brings one back)."

## Step 8: Report

Output a concise completion report:

> **Completed: $TASK_ID — $TASK_NAME** (or **Waiting for review: $TASK_ID — $TASK_NAME**, with who reviews it, or
> **Blocked: $TASK_ID — $TASK_NAME**, with the questions and who answers them)
>
> **What was done:** (2-3 sentence summary)
>
> **Files changed:**
> - path/to/file1 (created/modified)
> - path/to/file2 (created/modified)
>
> **Verification:** ✅ Build passed, tests passed
>
> **Now unblocked:** (the tasks `atm done` listed as now ready, if any; none while it waits for review)

If the branch now has task commits that aren't pushed (`git status` says "ahead of"), end with one line:
> `/atm:push` pushes them (and opens or updates the PR, in a pull-request project) and watches CI.
