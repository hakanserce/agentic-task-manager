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

Search for the tasks file in this order:
1. `docs/tasks.json`
2. `tasks.json` (project root)

If not found, tell the user:
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

Update the task's status to `"in_progress"` in tasks.json.
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
- If still failing after 2 attempts, set the task status back to `"todo"` and report the failure

## Step 7: Mark as done

If verification passes, update the task's status to `"done"` in tasks.json.
**Write the file immediately.**

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
