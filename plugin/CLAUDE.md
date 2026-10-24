# Agentic Task Manager Plugin

This plugin provides file-based task management for agentic development workflows.

## Key Files
- `.agentic-task-manager/tasks.json` at the project root holds all task definitions (committed)
- `.agentic-task-manager/tasks-dashboard.html` is a self-contained HTML dashboard served via local HTTP
  (`/atm:serve`). It is a copy of the plugin's template, listed in `.agentic-task-manager/.gitignore`, not committed
- `scripts/atm` (in the plugin) is the helper the skills run: `atm migrate` moves an old `docs/tasks.json` or root
  `tasks.json` into `.agentic-task-manager/` (staged with `git mv`, not committed) and keeps the dashboard current;
  `atm serve` runs the dashboard server. It needs Python 3.9+ (standard library only)
- Status changes go through the helper, never by editing tasks.json: `atm next --claim`, `atm start|done|fail|release
  <id>`, `atm heartbeat <id>`, `atm claims`. It locks the file, writes timestamps and records claims (which agent works
  on which task, with a 30-minute lease), shared by all git worktrees of a clone. Commit only the files a task
  changed plus tasks.json; never `git add -A`
- `tasks.json` merges task by task through atm's git merge driver (`.agentic-task-manager/.gitattributes`)

## Task Schema
Each task has: id, name, phase, type (feature/bugfix/test/infra/docs/refactor/polish),
description, dependencies (array of task IDs), status (todo/in_progress/done/blocked/skipped),
requirements (array), use_cases (array), files (array of file paths),
created_at (ISO 8601 UTC, optional), updated_at (ISO 8601 UTC, optional),
started_at (ISO 8601 UTC, optional; set when moving to in_progress),
completed_at (ISO 8601 UTC, optional; set when moving to done). Both are removed if a task returns to todo.
agent (optional; the agent that started the task, written by `atm start`/`atm next --claim`; removed if it returns
to todo).

## Conventions
- Task IDs follow the pattern: T-001, T-002, etc. (or T-P0-01 for phased projects)
- Status transitions: todo → in_progress → done
- Dependencies must be completed (status: done) before a task can start
- The dashboard auto-reloads from tasks.json via HTTP fetch
- tasks.json must be served over HTTP for the dashboard to work (not file://)

## Available Skills
- `/atm:create-tasks` — Analyze requirements and create tasks.json
- `/atm:do-task` — Execute a single task and update its status
- `/atm:loop-tasks` — Loop through all available tasks automatically
- `/atm:update-dashboard` — Update the project's dashboard HTML to the latest version
- `/atm:serve` — Start, stop or check the dashboard's local server (`start`, `stop`, `status`, `--open`)
