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

## Step 1: Find Requirements

Search the project for requirement sources. Use Glob and Grep to find them in this priority order:

1. **PRD / Product Requirements Document** — look for files matching:
   `**/PRD.md`, `**/prd.md`, `**/product-requirements*`, `**/requirements.md`, `**/REQUIREMENTS*`
2. **Use Cases** — look for: `**/use-cases*`, `**/usecases*`, `**/UC-*`
3. **ADRs (Architecture Decision Records)** — look for: `**/adrs/**`, `**/ADR-*`, `**/adr-*`
4. **ROADMAP** — look for: `**/ROADMAP.md`, `**/roadmap*`
5. **GitHub Issues / TODO files** — look for: `**/TODO.md`, `**/BACKLOG.md`, `**/TODO`
6. **README with feature descriptions** — `README.md`
7. **Existing tasks.json** — if one exists, load it and extend/update rather than overwrite

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

Check where to place the file:
1. If `docs/tasks.json` already exists → update it there
2. If `docs/` directory exists → create `docs/tasks.json`
3. Otherwise → create `tasks.json` in the project root

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

Check if `tasks-dashboard.html` exists in the same directory as `tasks.json`.

If it does NOT exist, copy it from the plugin templates:
- Look for the dashboard template at the plugin root's `templates/tasks-dashboard.html`
- Copy it to the same directory as `tasks.json`

If `tasks-dashboard.html` already exists, check for a `<meta name="atm-dashboard-version">` tag in it.
If the version is older than the plugin's current version, suggest:
> Your dashboard may be outdated. Run `/atm:update-dashboard` to get the latest version with new features.

Then tell the user how to start the dashboard:

> **Dashboard ready!** Start a local server to view your tasks:
> ```
> cd <directory-containing-tasks.json> && python3 -m http.server 8000
> ```
> Then open http://localhost:8000/tasks-dashboard.html
>
> Tip: Enable "Auto" refresh in the dashboard (set to 5s) to watch progress live
> while an agent loops through tasks with `/atm:loop-tasks`.

## Step 6: Summary

After creating tasks, output a summary table:

- Total tasks created, grouped by phase
- Breakdown by type (features, tests, infra, etc.)
- Dependency chain depth (longest chain from start to end)
- Suggested first tasks to start with (those with zero unmet dependencies)
