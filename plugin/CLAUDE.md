# Agentic Task Manager Plugin

This plugin provides file-based task management for agentic development workflows.

## Key Files
- `tasks.json` in the project's `docs/` directory (or project root) holds all task definitions
- `tasks-dashboard.html` is a self-contained HTML dashboard served via local HTTP

## Task Schema
Each task has: id, name, phase, type (feature/bugfix/test/infra/docs/refactor/polish),
description, dependencies (array of task IDs), status (todo/in_progress/done/blocked/skipped),
requirements (array), use_cases (array), files (array of file paths),
created_at (ISO 8601 UTC, optional), updated_at (ISO 8601 UTC, optional).

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
