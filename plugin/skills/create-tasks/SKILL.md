---
name: create-tasks
description: >
  Analyze project requirements and decompose them into granular tasks in tasks.json.
  Use when starting a new project, adding a feature set, or when the user says
  "create tasks", "break down requirements", "plan tasks", or "decompose into tasks".
---

# Create Tasks from Project Requirements

You are a task decomposition agent. Your job is to analyze project requirements
and create a granular task list in `tasks.json` format.

## Step 0: Prepare the task folder

From the project root, run the plugin's helper:

```bash
"${CLAUDE_SKILL_DIR}/../../scripts/atm" migrate
```

It keeps the project's `.agentic-task-manager/` folder in order:
- an old `docs/tasks.json` (or `tasks.json` in the project root) is moved into `.agentic-task-manager/`; the move is
  staged in git, not committed;
- the dashboard there (`tasks-dashboard.html`, a copy that isn't committed) is installed or updated to the plugin's
  version.

Relay what it prints, except "Nothing to migrate.". If it exits with code 127, neither Python 3.9+ nor Node 18+ is
installed: ask the user to install one and stop.

Tasks live in `.agentic-task-manager/tasks.json` at the project root (after the step above, an existing task file is
already there).

## Step 1: Find Requirements

Search the project for requirement sources. Use Glob and Grep to find them in this priority order:

1. **PRD / Product Requirements Document** — look for files matching:
   `**/PRD.md`, `**/prd.md`, `**/product-requirements*`, `**/requirements.md`, `**/REQUIREMENTS*`
2. **Use Cases** — look for: `**/use-cases*`, `**/usecases*`, `**/UC-*`
3. **ADRs (Architecture Decision Records)** — look for: `**/adrs/**`, `**/ADR-*`, `**/adr-*`
4. **ROADMAP** — look for: `**/ROADMAP.md`, `**/roadmap*`
5. **GitHub Issues / TODO files** — look for: `**/TODO.md`, `**/BACKLOG.md`, `**/TODO`
6. **README with feature descriptions** — `README.md`
7. **Existing tasks.json** — if `.agentic-task-manager/tasks.json` exists, load it and extend/update rather than overwrite

If `$ARGUMENTS` is provided, treat it as either:
- A file path to read requirements from
- A direct description of requirements to decompose

If no requirement documents are found AND no arguments were given, **ask the user**:

> I couldn't find requirement documents (PRD, use cases, ADRs, roadmap) in this project.
> Could you tell me:
> 1. Where are your requirements documented? (file path or URL)
> 2. Or describe the requirements now and I'll create tasks from your description.

## Step 2: Analyze and Decompose

For each requirement or feature:

- Break it into tasks that a single agent can complete in **under 10 minutes each**
- Each task should be independently testable or verifiable
- Include implementation tasks, unit test tasks, and integration test tasks where appropriate
- Identify dependencies between tasks (a task cannot start until its deps are done)
- Assign phases: group related tasks into sequential phases (0, 1, 2, ...)
  - Phase 0 = foundation/setup
  - Phase 1+ = features grouped by dependency chains
- Assign types: `feature`, `bugfix`, `test`, `infra`, `docs`, `refactor`, `polish`

## Step 3: Determine tasks.json location

Always `.agentic-task-manager/tasks.json` at the project root (the git top level). Create the folder if needed.

## Step 4: Generate tasks.json

Write the tasks file with this structure:

```json
{
  "meta": {
    "project": "<project name from README or directory name>",
    "created": "<today's date YYYY-MM-DD>",
    "description": "<brief project description>"
  },
  "tasks": [
    {
      "id": "T-001",
      "name": "<short descriptive name, max ~60 chars>",
      "phase": 0,
      "type": "feature",
      "description": "<detailed description of exactly what to implement/do>",
      "requirements": ["FR-1.1"],
      "use_cases": ["UC-001"],
      "status": "todo",
      "dependencies": ["T-000"],
      "files": ["src/expected-file.ts"],
      "created_at": "<ISO 8601 UTC timestamp>",
      "updated_at": "<ISO 8601 UTC timestamp>"
    }
  ]
}
```

Rules for task generation:
- Task IDs are sequential: T-001, T-002, T-003, ...
- Every task description should be specific enough that an agent can execute it without further clarification
- The `files` array should list files that will be created or modified
- `requirements` and `use_cases` arrays can be empty if not applicable
- Dependencies should reference only tasks defined in the same file
- Set `created_at` and `updated_at` to the current UTC timestamp in ISO 8601 format for every new task. Get the timestamp by running `date -u +"%Y-%m-%dT%H:%M:%SZ"` in the shell.

## Step 5: Set up the dashboard

Run the helper again, now that `tasks.json` exists:

```bash
"${CLAUDE_SKILL_DIR}/../../scripts/atm" migrate
```

It writes `.agentic-task-manager/.gitignore` (the dashboard and runtime files aren't committed; `tasks.json` is) and
installs the plugin's current dashboard next to `tasks.json`. Relay what it prints, except "Nothing to migrate.".

Then tell the user how to start the dashboard:

> **Dashboard ready!** Run `/atm:serve` to start it in the background (`/atm:serve --open` also opens your
> browser), or `/atm:serve stop` to stop it later.
>
> The dashboard refreshes itself every 5 seconds, so you can watch progress live
> while an agent loops through tasks with `/atm:loop-tasks`.

## Step 6: Summary

After creating tasks, output a summary table:

- Total tasks created, grouped by phase
- Breakdown by type (features, tests, infra, etc.)
- Dependency chain depth (longest chain from start to end)
- Suggested first tasks to start with (those with zero unmet dependencies)
