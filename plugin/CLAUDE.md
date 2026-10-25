# Agentic Task Manager Plugin

This plugin provides file-based task management for agentic development workflows.

## Key Files
- `.agentic-task-manager/tasks.json` at the project root holds all task definitions (committed)
- `.agentic-task-manager/tasks-dashboard.html` is a self-contained HTML dashboard served via local HTTP
  (`/atm:serve`). It is a copy of the plugin's template, listed in `.agentic-task-manager/.gitignore`, not committed
- `atm` (atm-cli, the plugin's `bin/atm`, on the Bash tool's PATH while the plugin is enabled) is the command the
  skills run: `atm migrate` moves an old `docs/tasks.json` or root
  `tasks.json` into `.agentic-task-manager/` (staged with `git mv`, not committed) and keeps the dashboard current;
  `atm serve` runs the dashboard server. It needs Python 3.9+ (standard library only)
- `tasks.json` merges task by task through atm's git merge driver (`.agentic-task-manager/.gitattributes`)

## Never read or edit the task files directly
Agents never read or edit `tasks.json` or `tasks-archive.json` themselves (no Read, cat, grep, jq or scripts on
them): every read and change goes through `atm`, which knows the archive, the project's vocabulary and the locking.
Every command takes `--json`; `atm help` lists them all.
- Read: `atm status` (the overview), `atm show <id>...` (tasks in full, with notes), `atm deps <id>`,
  `atm list [--status S] [--phase N] [--type T] [--priority P] [--label L] [--ready] [--blocked] [--in-pr]
  [--archived]`, `atm claims`, `atm workflow`
- Work: `atm next --claim`, `atm start <id>`, `atm done <id> [--note]`, `atm review <id> --note`,
  `atm block <id> --on user|agent --question ...`, `atm fail <id> --reason`, `atm release <id> --note`,
  `atm note <id> TEXT`
- Answer: `atm unblock <id> --answer ...` (a block), `atm done <id>` / `atm reject <id> --reason` (a review)
- Undo: `atm reopen <id> --reason ...` takes a done or skipped task back to to-do (never edit its status by hand)
- Commit: `atm commit <id> --file F [--file F]...`, naming every file the task changed
- Push: `/atm:push` records the PR with `atm pr <id>... --number N --url U` and merges with `atm merged --pr N`
- Define: `atm init --meta-file F` (project, phases, vocabularies), `atm add` (`--json-file` for many),
  `atm edit <id>`, `atm check`, `atm workflow set`
- Archive: `atm archive` (when atm suggests it), `atm unarchive <id>...`
- atm locks the file, writes timestamps and actors, and records claims (which agent works on which task, with a
  30-minute lease that the plugin's hook renews), shared by all git worktrees of a clone. `atm commit` commits only
  the files a task changed plus tasks.json; never `git add -A`

## Task Schema
atm-cli writes these fields; this is for reading `atm show --json` output, not for editing the file.
- Definition: id, name, phase, type (feature/bugfix/test/infra/docs/refactor/polish by default), description,
  dependencies (task IDs), priority (`P0`–`P3` by default; none counts as `P2`), labels (tags like `spike-2`, `ux`),
  requirements, use_cases, files
- Status: status (todo/in_progress/in_review/blocked/done/skipped by default, each with a kind), created_at,
  updated_at, started_at, completed_at, review_requested_at (ISO 8601 UTC)
- Actors: created_by, updated_by, started_by (the claim's owner; older files have `agent`), completed_by. An actor
  starting with `claude:` is an agent; anything else is a person
- Blocked: waiting_on (`user` or `agent`), questions (the open questions), blocked_at
- Notes: `notes`, a list of `{at, by, kind, text}` (kind: handoff, outcome, review, rejection, failure, answer, note;
  at most 500 characters each). Older files may have `last_failure` instead of failure notes
- Git: commit (the task's SHA), pr (`{number, url}`), merged_at. Stages of Done are derived from them: Done, In PR,
  Merged; they never affect dependencies
- `meta`: project, id, phases, statuses, types, priorities, default_priority, labels, workflow
  (`{type: direct|pull-request, base, verify, max_rounds, commit_template, trailers}`), archive (thresholds),
  archived (how many tasks are in `tasks-archive.json`), next_id

## Conventions
- Task IDs follow the pattern: T-001, T-002, etc. (or T-P0-01 for phased projects)
- Status transitions: todo → in_progress → done, or in_progress → in_review → done (`atm review`, then `atm done`
  to pass or `atm reject --reason` to send it back to todo)
- Statuses have kinds (`todo`, `active`, `review`, `blocked`, `done`, `skipped`); a project may name its own in
  `meta.statuses`. atm and the skills act on the kind; `--status <id>` picks one when a kind has several
- Dependencies must be completed (a done-kind status) before a task can start; a task in review is not done yet;
  an archived task counts as done
- Agents take tasks phase by phase, then by `priority` (`P0`…`P3`; none counts as the default, `P2`), then by ID
- A task that can't go on without a decision is blocked (`atm block --on user|agent --question ...`), not guessed at;
  whoever decides answers with `atm unblock --answer ...`
- The project's `CLAUDE.md` comes first on how to push, branch and handle CI; `meta.workflow` is the default
- Finished tasks move to `tasks-archive.json` with `atm archive` when atm suggests it, at a break between tasks
- The dashboard reloads tasks.json over HTTP (not file://), and the archive only when a view needs history

## Available Skills
- `/atm:create-tasks` — Analyze requirements and create tasks.json
- `/atm:do-task` — Execute a single task and update its status
- `/atm:loop-tasks` — Loop through all available tasks automatically
- `/atm:push` — Push (direct) or open/update the PR (pull-request), watch CI and fix failures until it's green
- `/atm:update-dashboard` — Update the project's dashboard HTML to the latest version
- `/atm:serve` — Start, stop or check the dashboard's local server (`start`, `stop`, `status`, `--open`)
