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

## Step 2: Select a task

If `$ARGUMENTS` specifies a task ID (e.g., `T-005` or `T-P1-03`), select that task.

If no specific task is given, select the **next available task** using this priority:
1. Filter to tasks with `"status": "todo"`
2. From those, keep only tasks where ALL dependencies have `"status": "done"`
3. Sort by: lowest phase first, then lowest task ID (natural sort)
4. Pick the first one

If no task is available, report clearly:
> **No tasks available.** All tasks are either done, in progress, or blocked by unfinished dependencies.
>
> Remaining tasks:
> - (list any todo/in_progress tasks and what blocks them)

## Step 3: Validate dependencies

Before starting, verify ALL dependency tasks have `"status": "done"`.

If any dependency is NOT done, report:
> **Task $ID is blocked.** These dependencies are not yet done:
> - $DEP_ID: $DEP_NAME (status: $DEP_STATUS)
>
> Complete those first, or pick a different task.

Do NOT proceed if dependencies are unmet.

## Step 4: Mark as in_progress

Update the task in tasks.json:
- Set `status` to `"in_progress"`
- Set `updated_at` and `started_at` to the current UTC timestamp (run `date -u +"%Y-%m-%dT%H:%M:%SZ"` to get it)
- Remove `completed_at` if the task has one (e.g. from an earlier attempt)

**Write the file immediately** so the dashboard reflects the change in real time.

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
any additional files that are needed.

## Step 6: Verify

After implementation, verify the work:

1. **Build check**: If the project has a build command (check package.json scripts, Makefile, Cargo.toml, build.gradle, etc.), run it and ensure it passes.
2. **Test check**: If you wrote tests or the task is a test task, run the relevant test suite.
3. **Lint check**: If the project has a linter configured, run it on changed files.
4. **Self-review**: Quickly review your changes for obvious issues — missing imports, typos, logic errors.

If verification fails:
- Try to fix the issue (up to 2 attempts)
- If still failing after 2 attempts, set the task status back to `"todo"`, update `updated_at` to the current UTC timestamp, remove `started_at` and `completed_at`, and report the failure

## Step 7: Mark as done

If verification passes, update the task in tasks.json:
- Set `status` to `"done"`
- Set `updated_at` and `completed_at` to the current UTC timestamp (keep `started_at`)

**Write the file immediately.** The dashboard uses `started_at` and `completed_at` for its completion history and estimates.

## Step 7b: Git commit

After marking the task as done, commit the changes.
If the helper moved files in Step 1 and you are going to commit, first commit the move on its own:
`git commit -m "chore: move atm files to .agentic-task-manager/" -- <old tasks.json> .agentic-task-manager/tasks.json .agentic-task-manager/.gitignore`
(add the old `tasks-dashboard.html` path too if it was removed). Then commit the task.
- `git add -A`
- `git commit -m "feat($TASK_ID): $TASK_NAME"`

This is the default behavior. Do NOT push — only commit locally.

## Step 8: Report

Output a concise completion report:

> **Completed: $TASK_ID — $TASK_NAME**
>
> **What was done:** (2-3 sentence summary)
>
> **Files changed:**
> - path/to/file1 (created/modified)
> - path/to/file2 (created/modified)
>
> **Verification:** ✅ Build passed, tests passed
>
> **Now unblocked:** (list task IDs that were waiting on this task, if any)
