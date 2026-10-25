---
name: create-tasks
description: >
  Analyze project requirements and decompose them into granular tasks in tasks.json.
  Use when starting a new project, adding a feature set, or when the user says
  "create tasks", "break down requirements", "plan tasks", or "decompose into tasks".
allowed-tools: Bash(atm *)
---

# Create Tasks from Project Requirements

You are a task decomposition agent. Your job is to analyze project requirements
and create a granular task list in `tasks.json`.

**Never read or edit `tasks.json` or `tasks-archive.json` directly** (no Read, Write, cat, grep, jq or scripts on
them): `atm` reads and writes them. `atm init --meta-file` sets the project and its vocabularies, `atm add` adds
tasks, `atm edit` changes existing ones, `atm status` / `atm list` / `atm show` read them, `atm check` checks them.

## Step 0: Prepare the task folder

From the project root, run atm-cli, the plugin's `atm` command:

```bash
atm migrate
```

(The plugin's `bin/` is on your PATH while the plugin is enabled. If the shell says `atm: command not found`, write
`"${CLAUDE_SKILL_DIR}/../../bin/atm"` instead of `atm`, here and in every later command.)

It keeps the project's `.agentic-task-manager/` folder in order:
- an old `docs/tasks.json` (or `tasks.json` in the project root) is moved into `.agentic-task-manager/`; the move is
  staged in git, not committed;
- the dashboard there (`tasks-dashboard.html`, a copy that isn't committed) is installed or updated to the plugin's
  version.

Relay what it prints, except "Nothing to migrate.". If it exits with code 127, Python 3.9 or newer is not installed:
atm needs it, so ask the user to install it and stop.

Tasks live in `.agentic-task-manager/tasks.json` at the project root (after the step above, an existing task file is
already there; `atm status` says whether there is one and what it holds).

## Step 1: Find Requirements

Search the project for requirement sources. Use Glob and Grep to find them in this priority order:

1. **PRD / Product Requirements Document** — look for files matching:
   `**/PRD.md`, `**/prd.md`, `**/product-requirements*`, `**/requirements.md`, `**/REQUIREMENTS*`
2. **Use Cases** — look for: `**/use-cases*`, `**/usecases*`, `**/UC-*`
3. **ADRs (Architecture Decision Records)** — look for: `**/adrs/**`, `**/ADR-*`, `**/adr-*`
4. **ROADMAP** — look for: `**/ROADMAP.md`, `**/roadmap*`
5. **GitHub Issues / TODO files** — look for: `**/TODO.md`, `**/BACKLOG.md`, `**/TODO`
6. **README with feature descriptions** — `README.md`
7. **Existing tasks** — if there is a task file, read it with `atm status` and `atm list` (`atm show <id>` for
   detail) and extend it rather than start over: new tasks go in with `atm add`, changes to existing ones with
   `atm edit`

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
- **Group tasks with labels, not names.** When some tasks belong together across phases or types (a spike, an area
  such as `ux` or `api`, a milestone), propose a label for them (`spike-2`, `ux`) instead of writing markers like
  "[Spike 2]" into their names. Labels are lowercase letters, digits, `-` and `_`, at most 32 characters; the
  dashboard filters by them.

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

Also **propose a name for each phase** of your decomposition (e.g. `0 Foundations`, `1 Core features`), and the
**labels** you plan to use, with the tasks each one groups.

Then ask the user to confirm or change each list (statuses, phases, types, priorities, labels) before you write any
task. If
they define their own:
- every status needs an `id`, a `label` and one of the six kinds; there must be at least one status of the kinds
  `todo`, `active` and `done`; IDs are unique. A kind may have several statuses (e.g. `awaiting_user` and
  `awaiting_agent`, both `review`): agents pick one with `--status`, otherwise the first listed is used;
- priorities are listed most urgent first; ask which one is the default for tasks without a priority.

Step 4 writes to `meta` only the lists that differ from the defaults, plus the phase names, for example:

```json
{
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

## Step 4: Set the project and its vocabularies

Write the `meta` keys to a scratch file outside the repository (your scratchpad, or a temporary file), then:

```bash
atm init --meta-file <that file>
```

For a new project the file holds `project` (from the README or the directory name), `description` (one line),
`phases` and any vocabularies that differ from the defaults; for an existing one, only the keys that change (new phase
names, say). It creates `.agentic-task-manager/tasks.json` if there is none, merges the keys into `meta` (keeping
`meta.id`, and adding one if missing), and checks the vocabularies before writing: if it reports a problem (for
example `meta.statuses needs at least one status of the kind 'done'`), fix the file as it says and run it again.
It also registers atm's merge driver in a git repository.

## Step 5: Add the tasks

Write the new tasks as a JSON list to another scratch file and add them all at once:

```bash
atm add --json-file <that file> --json [--agent "<the user's name>"]
```

```json
[
  {
    "id": "new-1",
    "name": "Set up the database schema",
    "phase": 0,
    "type": "infra",
    "priority": "P0",
    "labels": ["api"],
    "description": "Create the tables users and sessions in db/schema.sql as described in docs/PRD.md §3: ...",
    "requirements": ["FR-1.1"],
    "use_cases": ["UC-001"],
    "files": ["db/schema.sql"]
  },
  {
    "id": "new-2",
    "name": "Sign-in endpoint",
    "phase": 1,
    "type": "feature",
    "priority": "P1",
    "labels": ["api"],
    "description": "...",
    "dependencies": ["new-1"],
    "files": ["src/routes/sign-in.ts"]
  }
]
```

- `id` is a **placeholder** (`new-1`, `new-2`, ...): other new tasks use it in `dependencies`, and atm replaces it
  with the next real ID in the project's pattern (`T-001`, ... or after the existing tasks). A dependency on an
  existing task uses its real ID. atm sets the status, the timestamps and `created_by`.
- `--agent "<name>"`: when the user asked for these tasks, pass the user (their git user name) so the tasks show who
  created them; leave it out when you create tasks on your own initiative (they show your session).
- atm refuses the whole file, writing nothing, if a type or priority isn't in the vocabulary, a label isn't valid, a
  dependency doesn't exist or the dependencies make a cycle. Fix what it names and run it again.
- The JSON output lists the new tasks with their real IDs.

Rules for task generation:
- Every task has a `priority` from the confirmed priorities, and the confirmed `labels` where they apply
- Every task description should be specific enough that an agent can execute it without further clarification
- `files` lists files that will be created or modified
- `requirements` and `use_cases` can be left out if not applicable

**Changing existing tasks** (when extending a project): `atm edit <id>` with `--description`, `--phase`,
`--priority`, `--add-dep`/`--remove-dep`, `--add-label`/`--remove-label`, `--add-file`/`--remove-file`. Statuses
change only through the status commands, never here.

Then check the result:

```bash
atm check
```

Fix any error it reports (with `atm edit`) and run it again; warnings are worth a look.

## Step 6: Set up the dashboard

Run `atm migrate` again, now that `tasks.json` exists:

```bash
atm migrate && atm init
```

It writes `.agentic-task-manager/.gitignore` (the dashboard and runtime files aren't committed; `tasks.json` is),
installs the plugin's current dashboard next to `tasks.json`, and in a git repository registers atm's merge driver
for `tasks.json` (`.agentic-task-manager/.gitattributes` plus the clone's git config), so branches that changed
different tasks merge cleanly. Relay what it prints, except "Nothing to migrate.".

Then tell the user how to start the dashboard:

> **Dashboard ready!** Run `/atm:serve` to start it in the background (`/atm:serve --open` also opens your
> browser), or `/atm:serve stop` to stop it later.
>
> The dashboard refreshes itself every 5 seconds, so you can watch progress live
> while an agent loops through tasks with `/atm:loop-tasks`.

## Step 7: Summary

After creating tasks, output a summary table (`atm status` and `atm list --ready` have the numbers):

- Total tasks created, grouped by phase (with the phase names)
- Breakdown by type (features, tests, infra, etc.), by priority, and the labels used
- Dependency chain depth (longest chain from start to end)
- Suggested first tasks to start with (those with zero unmet dependencies)
