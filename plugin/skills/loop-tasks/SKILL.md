---
name: loop-tasks
description: >
  Loop through available tasks in tasks.json, executing them one by one
  until all are done or no more can be started. Supports flags for auto-commit,
  push strategies, phase/type filters, and pause-between-tasks mode.
  Use when the user says "loop tasks", "do all tasks", "run the loop",
  "Ralph Wiggum it", or "automate the tasks".
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

## Dry Run Mode

If `--dry-run` is set, do NOT execute any tasks. Instead:

1. Load tasks.json
2. Walk through the selection logic and list tasks in the order they would execute
3. Show the dependency chain and estimated execution order
4. Report total count and exit

## The Main Loop

```
completed_count = 0

while true:

    1. READ tasks.json (fresh read every iteration — the human or another
       agent may have edited it since the last iteration)

    2. FIND the next available task:
       - status == "todo"
       - all dependencies have status == "done"
       - matches --phase filter if specified
       - matches --type filter if specified
       - sort by: lowest phase first, then lowest task ID
       - pick the first match

    3. If NO task available → EXIT the loop

    4. If --max is set and completed_count >= max → EXIT the loop

    5. If --pause is set:
       - Show the task that's about to be executed
       - Ask: "About to start $TASK_ID: $TASK_NAME. Proceed? (y/n/skip/quit)"
       - If 'n' or 'quit' → EXIT the loop
       - If 'skip' → skip this task (leave as todo) and continue to next iteration

    6. UPDATE tasks.json: set this task's status to "in_progress"
       and `updated_at` to the current UTC timestamp (`date -u +"%Y-%m-%dT%H:%M:%SZ"`).
       Write the file immediately.

    7. EXECUTE the task:
       - Read the task description carefully
       - Implement what it describes (same approach as /atm:do-task Step 5)
       - Follow project conventions

    8. VERIFY the task:
       - Run build/test/lint if available (same as /atm:do-task Step 6)
       - If verification fails after 2 attempts:
         - Set status back to "todo" and update `updated_at` to current UTC timestamp
         - Log the failure
         - Continue to next iteration (skip the failed task)

    9. UPDATE tasks.json: set status to "done"
       and `updated_at` to the current UTC timestamp.
       Write the file immediately.

    10. completed_count += 1

    11. GIT OPERATIONS (default: commit after each task):
        - Unless --no-commit is set:
          - git add -A
          - git commit -m "feat($TASK_ID): $TASK_NAME"
        - If --push:
          - git push
        - If --push-every <N> and completed_count % N == 0:
          - git push

    12. BRIEF REPORT for this task:
        - "✅ $TASK_ID: $TASK_NAME — done ($completed_count completed so far)"

    13. Loop back to step 1
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
> **Remaining:** N tasks still todo
> **Blocked:** N tasks waiting on dependencies
> **Failed:** N tasks that failed verification (if any)
>
> **Next steps:** (list tasks that are now available to work on, if any)

> If `tasks-dashboard.html` exists and its `<meta name="atm-dashboard-version">` is older than the plugin's current version:
> **Note:** Your dashboard is outdated. Run `/atm:update-dashboard` to get the latest version.

If `--batch-push` was set, run `git push` now.

## Error Handling

- If tasks.json cannot be read → stop the loop, report the error
- If a task fails verification → set it back to "todo", skip it, continue
- If git commit/push fails → log a warning but continue the loop
- If the task description is too vague to execute → set it back to "todo", skip it,
  note it in the summary as "skipped: unclear description"

## Important Notes

- **Re-read tasks.json every iteration.** The human watching the dashboard might
  change a task's status, add new tasks, or re-prioritize while the loop runs.
- **Write tasks.json after every status change.** This keeps the dashboard live.
- **Don't skip verification.** Quality matters even in a loop.
- **Respect the --pause flag.** When set, always wait for user input.
