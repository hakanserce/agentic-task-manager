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

Relay what it prints, except "Nothing to migrate.". If it exits with code 127, Python 3.9 or newer is not installed:
atm needs it, so ask the user to install it and stop.

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
- Assign types: `feature`, `bugfix`, `test`, `infra`, `docs`, `refactor`, `polish` (or the project's own, see Step 3)
- Assign every task a **priority**, most urgent first: `P0` Critical/Required (the release can't go without it, or
  other work is blocked on it), `P1` High, `P2` Medium (the usual), `P3` Low/Nice-to-have. Use the project's own
  priorities instead if it has them (Step 3). Agents take tasks phase by phase and, within a phase, by priority.

## Step 3: Confirm the vocabularies

A project's statuses, phases, task types and priorities are its **vocabularies**, kept in `tasks.json` `meta`. Each
status has a **kind**, one of `todo`, `active`, `review`, `blocked`, `done` and `skipped`: atm and the dashboard act
on the kind, so a project can name its statuses as it likes.

Show the user the vocabularies you will use, in one short message:
- **adding to an existing `tasks.json`**: the lists in its `meta`, and the defaults for any list it doesn't have;
- **a new project**: the defaults.

The defaults:

| List | Default |
|---|---|
| Statuses (kind) | `todo` To Do (todo), `in_progress` In Progress (active), `in_review` In Review (review), `blocked` Blocked (blocked), `done` Done (done), `skipped` Skipped (skipped) |
| Types | `feature`, `bugfix`, `test`, `infra`, `docs`, `refactor`, `polish` |
| Priorities | `P0` Critical, `P1` High, `P2` Medium (the default for tasks without one), `P3` Low |
| Phases | numbers only |

Also **propose a name for each phase** of your decomposition (e.g. `0 Foundations`, `1 Core features`).

Then ask the user to confirm or change each list (statuses, phases, types, priorities) before you write any task. If
they define their own:
- every status needs an `id`, a `label` and one of the six kinds; there must be at least one status of the kinds
  `todo`, `active` and `done`; IDs are unique. A kind may have several statuses (e.g. `awaiting_user` and
  `awaiting_agent`, both `review`): agents pick one with `--status`, otherwise the first listed is used;
- priorities are listed most urgent first; ask which one is the default for tasks without a priority.

Write to `meta` only the lists that differ from the defaults, plus the phase names:

```json
"meta": {
  "phases": [{ "id": 0, "name": "Foundations" }, { "id": 1, "name": "Core features" }],
  "statuses": [
    { "id": "todo", "label": "To Do", "kind": "todo" },
    { "id": "in_progress", "label": "In Progress", "kind": "active" },
    { "id": "awaiting_user", "label": "Awaiting you", "kind": "review" },
    { "id": "done", "label": "Done", "kind": "done" }
  ],
  "priorities": [{ "id": "must", "label": "Must" }, { "id": "should", "label": "Should" }, { "id": "could", "label": "Could" }],
  "default_priority": "should"
}
```

New tasks start in the first `todo`-kind status, and use only the confirmed types and priorities.

## Step 4: Determine tasks.json location

Always `.agentic-task-manager/tasks.json` at the project root (the git top level). Create the folder if needed.

## Step 5: Generate tasks.json

Write the tasks file with this structure:

```json
{
  "meta": {
    "project": "<project name from README or directory name>",
    "id": "<8 random hex characters, e.g. from `openssl rand -hex 4`; keep an existing one>",
    "created": "<today's date YYYY-MM-DD>",
    "description": "<brief project description>",
    "phases": [{ "id": 0, "name": "<confirmed phase name>" }]
  },
  "tasks": [
    {
      "id": "T-001",
      "name": "<short descriptive name, max ~60 chars>",
      "phase": 0,
      "type": "feature",
      "priority": "P1",
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

Plus the vocabularies confirmed in Step 3 (only lists that differ from the defaults).

Rules for task generation:
- Task IDs are sequential: T-001, T-002, T-003, ...
- Every task has a `priority` from the confirmed priorities
- Every task description should be specific enough that an agent can execute it without further clarification
- The `files` array should list files that will be created or modified
- `requirements` and `use_cases` arrays can be empty if not applicable
- Dependencies should reference only tasks defined in the same file
- Set `created_at` and `updated_at` to the current UTC timestamp in ISO 8601 format for every new task. Get the timestamp by running `date -u +"%Y-%m-%dT%H:%M:%SZ"` in the shell.

## Step 6: Set up the dashboard

Run the helper again, now that `tasks.json` exists:

```bash
"${CLAUDE_SKILL_DIR}/../../scripts/atm" migrate && "${CLAUDE_SKILL_DIR}/../../scripts/atm" init
```

(`init` also adds `meta.id` if the file has none: the dashboard remembers each project's filters and tabs under it.)

It writes `.agentic-task-manager/.gitignore` (the dashboard and runtime files aren't committed; `tasks.json` is),
installs the plugin's current dashboard next to `tasks.json`, and in a git repository registers atm's merge driver
for `tasks.json` (`.agentic-task-manager/.gitattributes` plus the clone's git config), so branches that changed
different tasks merge cleanly. Relay what it prints, except "Nothing to migrate.".

`init` also checks the vocabularies in `meta`. If it reports a problem (for example `meta.statuses needs at least one
status of the kind 'done'`), fix `meta` as it says and run it again.

Then tell the user how to start the dashboard:

> **Dashboard ready!** Run `/atm:serve` to start it in the background (`/atm:serve --open` also opens your
> browser), or `/atm:serve stop` to stop it later.
>
> The dashboard refreshes itself every 5 seconds, so you can watch progress live
> while an agent loops through tasks with `/atm:loop-tasks`.

## Step 7: Summary

After creating tasks, output a summary table:

- Total tasks created, grouped by phase (with the phase names)
- Breakdown by type (features, tests, infra, etc.) and by priority
- Dependency chain depth (longest chain from start to end)
- Suggested first tasks to start with (those with zero unmet dependencies)
