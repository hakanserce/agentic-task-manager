# 🔄 Agentic Task Manager

A **Claude Code plugin** that gives any project file-based task management with a live HTML dashboard. Agents decompose requirements into granular tasks, execute them in a loop, and humans watch progress in real time.

**One command to install. Nothing to set up beyond Python 3. Works with any language.**

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)

---

## What It Does

1. **Decompose requirements into tasks** — Point the agent at your PRD, use cases, ADRs, or just describe what you need. It creates a `tasks.json` file with granular, dependency-aware tasks.

2. **Execute tasks one by one** — The agent picks up a task, marks it in-progress, implements it, verifies it, and marks it done. All status changes are written to `tasks.json` immediately.

3. **Loop through all tasks** — "Ralph Wiggum mode" 🫠 — the agent continuously picks up the next available task and works through the entire backlog while you watch.

4. **Watch progress live** — A self-contained HTML dashboard reads `tasks.json` over HTTP and shows progress, an interactive dependency graph, a Kanban board, task cards and a per-agent timeline, all searchable and filterable. It refreshes itself every few seconds, so you can watch tasks turn green as the agent works.

---

## Quick Start

### Install the plugin

In Claude Code (terminal or VS Code), add the marketplace and install the `atm` plugin:

```
/plugin marketplace add hakanserce/agentic-task-manager
/plugin install atm@hakanserce-plugins
```

Then run `/reload-plugins` so the skills load (no restart needed).

### Create tasks

```
/atm:create-tasks
```

The agent searches your project for requirement documents (PRD, use cases, ADRs, roadmap) and decomposes them into granular tasks. If it can't find any, it asks you where to look or lets you describe requirements directly.

Tasks go to `.agentic-task-manager/tasks.json` in your project, next to a copy of the dashboard.

### Start the dashboard

```
/atm:serve --open
```

This starts a small local server in the background and opens the dashboard in your browser. It refreshes every
5 seconds, so it stays live while agents work. `/atm:serve stop` stops it; it otherwise keeps running after you close
Claude Code.

### Execute tasks

Do a single task:
```
/atm:do-task T-001
```

Or let the agent pick the next available task:
```
/atm:do-task
```

Or loop through everything:
```
/atm:loop-tasks
```

---

## Installation

### Prerequisites

- [Claude Code](https://claude.com/code) (CLI or VS Code extension)
- **Python 3.9 or newer** (`python3`). The skills run a small helper script (`plugin/scripts/atm.py`) that moves task
  files and serves the dashboard. It uses only Python's standard library, so there is nothing to install. On macOS,
  `python3` comes with the Command Line Tools (the same install that provides `git`). macOS and Linux are supported.

### Method 1: Via marketplace (recommended)

This repo is its own marketplace (`hakanserce-plugins`) containing the `atm` plugin:

```
/plugin marketplace add hakanserce/agentic-task-manager
/plugin install atm@hakanserce-plugins
```

Then run `/reload-plugins` to load the skills. To get a new version later:

```
/plugin marketplace update hakanserce-plugins
/reload-plugins
```

No restart is needed. Your project's dashboard is updated automatically the next time a skill runs (or with
`/atm:update-dashboard`, which also shows what's new).

### Method 2: Local development

Clone and load directly:

```bash
git clone https://github.com/hakanserce/agentic-task-manager.git
cd your-project
claude --plugin-dir /path/to/agentic-task-manager/plugin
```

### Verify installation

Type `/atm:` in Claude Code — you should see five skills in autocomplete:
- `/atm:create-tasks`
- `/atm:do-task`
- `/atm:loop-tasks`
- `/atm:serve`
- `/atm:update-dashboard`

---

## Skills Reference

### `/atm:create-tasks`

**Decompose requirements into tasks.**

```
/atm:create-tasks                          # Auto-detect requirements
/atm:create-tasks docs/PRD.md              # Use specific file
/atm:create-tasks Build a REST API with    # Describe requirements directly
  user auth, CRUD for posts, and pagination
```

**What it does:**
1. Searches for PRD, use cases, ADRs, roadmap, README, or existing tasks.json
2. If nothing found, asks you where to look
3. Decomposes requirements into granular tasks (~10 min each)
4. Assigns phases, types, dependencies
5. Writes `.agentic-task-manager/tasks.json` and sets up the folder (dashboard copy, `.gitignore`)
6. Outputs a summary with task counts and suggested starting tasks

**Supported requirement sources** (searched automatically):
- `**/PRD.md`, `**/requirements.md`
- `**/use-cases*`, `**/usecases*`
- `**/adrs/**`, `**/ADR-*`
- `**/ROADMAP.md`
- `**/TODO.md`, `**/BACKLOG.md`
- `README.md`

### `/atm:do-task`

**Execute a single task.**

```
/atm:do-task T-005     # Execute a specific task
/atm:do-task           # Auto-pick the next available task
```

**What it does:**
1. Loads tasks.json
2. Selects the specified task (or auto-picks next available)
3. Validates all dependencies are done
4. Sets status to `in_progress` (writes file immediately)
5. Implements the task according to its description
6. Runs build/test/lint verification
7. Sets status to `done` (writes file immediately)
8. Reports what was done and what's now unblocked

**Task selection priority** (when auto-picking):
1. Status must be `todo`
2. All dependencies must be `done`
3. Lowest phase number first
4. Lowest task ID as tiebreaker

### `/atm:loop-tasks`

**Loop through all available tasks. Ralph Wiggum mode.** 🫠

```
/atm:loop-tasks                           # Run all available tasks
/atm:loop-tasks --phase 1                 # Only phase 1 tasks
/atm:loop-tasks --type test               # Only test tasks
/atm:loop-tasks --max 5                   # Stop after 5 tasks
/atm:loop-tasks --pause                   # Ask before each task
/atm:loop-tasks --no-commit               # Skip auto-commit
/atm:loop-tasks --push                    # Git commit + push after each
/atm:loop-tasks --batch-push              # Commit each, push at the end
/atm:loop-tasks --push-every 3            # Commit each, push every 3
/atm:loop-tasks --dry-run                 # Preview execution order
```

**Flags:**

| Flag | Description |
|---|---|
| `--phase <N>` | Only tasks in phase N |
| `--type <type>` | Only tasks of a specific type (feature, test, etc.) |
| `--max <N>` | Stop after N completed tasks |
| `--dry-run` | Preview execution order without doing anything |
| `--pause` | Ask for confirmation before each task |
| `--no-commit` | Disable the default auto-commit after each task |
| `--push` | `git commit` + `git push` after each task |
| `--batch-push` | `git commit` after each, single `git push` at the end |
| `--push-every <N>` | `git commit` after each, `git push` every N tasks |

**Commit message format:** `feat(T-001): Short task name`

**The loop re-reads tasks.json every iteration**, so you can edit tasks, change priorities, or mark tasks as done/skipped from the dashboard or another editor while the agent runs.

### `/atm:update-dashboard`

**Update the dashboard HTML to the latest version.**

```
/atm:update-dashboard
```

**What it does:**
1. Compares `.agentic-task-manager/tasks-dashboard.html` with the plugin's latest version
2. If it's outdated (or missing), copies the latest version over it
3. Prints the release notes since your previous version

The other skills (`do-task`, `loop-tasks`, `create-tasks`, `serve`) also bring the dashboard up to date when they
start; this skill is the way to see what changed.

### `/atm:serve`

**Run the dashboard server.**

```
/atm:serve              # start it (or show the one already running)
/atm:serve --open       # start it and open the browser
/atm:serve status       # is it running, and where?
/atm:serve stop         # stop it
```

The server serves `.agentic-task-manager/` on `localhost`, port 8000 or the next free port, in the background, and
keeps running after the session ends. Each project gets its own server; `stop` only stops the one started for this
project. Its port and process ID are kept in `.agentic-task-manager/.server.json` (not committed).

---

## Project files

atm keeps everything in one folder at the root of your project (the top of the git repository):

```
.agentic-task-manager/
├── tasks.json             # the task list — committed
├── .gitignore             # written by atm — committed
├── .gitattributes         # merges tasks.json task by task (see below) — committed
├── tasks-dashboard.html   # copy of the plugin's dashboard — not committed, updated automatically
├── claims.json            # who works on what, for the dashboard — not committed
└── .server.json, .server.log, .lock/   # server state and the write lock — not committed
```

The dashboard isn't committed because it is the same file for every project; atm copies the current version in when
it's missing or outdated, so plugin updates don't produce large diffs in your repository.

**Upgrading from an earlier version:** projects that keep `tasks.json` in `docs/` (or the project root) are moved
automatically the first time any atm skill runs. The move uses `git mv`, so history is kept; the old
`tasks-dashboard.html` is removed from git. The change is staged for you to commit — `/atm:loop-tasks` commits it on
its own (`chore: move atm files to .agentic-task-manager/`) before its first task.

---

## Task Schema

### tasks.json format

```json
{
  "meta": {
    "project": "My Project",
    "created": "2026-04-03",
    "description": "Project description"
  },
  "tasks": [
    {
      "id": "T-001",
      "name": "Short descriptive name",
      "phase": 0,
      "type": "feature",
      "description": "Detailed description of what to implement.",
      "requirements": ["FR-1.1"],
      "use_cases": ["UC-001"],
      "status": "done",
      "dependencies": ["T-000"],
      "files": ["src/file.ts"],
      "created_at": "2026-04-05T12:00:00Z",
      "updated_at": "2026-04-05T14:30:00Z",
      "started_at": "2026-04-05T14:22:00Z",
      "completed_at": "2026-04-05T14:30:00Z"
    }
  ]
}
```

### Field reference

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | ✅ | Unique task ID (e.g., `T-001`) |
| `name` | string | ✅ | Short name, ~60 chars max |
| `phase` | integer | ✅ | Execution phase (0, 1, 2, ...) |
| `type` | string | ✅ | Task type (see below) |
| `description` | string | ✅ | Detailed description for the agent |
| `status` | string | ✅ | Current status (see below) |
| `dependencies` | string[] | ✅ | Task IDs that must be done first |
| `requirements` | string[] | ❌ | Requirement IDs (FR-x.x, etc.) |
| `use_cases` | string[] | ❌ | Use case IDs (UC-xxx, etc.) |
| `files` | string[] | ❌ | Expected file paths to create/modify |
| `created_at` | string | ❌ | ISO 8601 UTC timestamp when task was created |
| `updated_at` | string | ❌ | ISO 8601 UTC timestamp of last status change |
| `started_at` | string | ❌ | ISO 8601 UTC timestamp when the task moved to `in_progress` |
| `completed_at` | string | ❌ | ISO 8601 UTC timestamp when the task moved to `done` |
| `agent` | string | ❌ | The agent that started the task, e.g. `claude:e5ea9db0` (written by `atm`; removed if the task goes back to `todo`) |
| `last_failure` | object | ❌ | `{at, reason}` when an attempt failed or its lease expired (written by `atm`) |

`/atm:do-task` and `/atm:loop-tasks` maintain the timestamps (through the `atm` helper): `started_at` when a task starts, `completed_at` when it
is done, and both are removed if a task goes back to `todo`. The dashboard uses them for completion history and
estimates; files without them still work (`updated_at` is used instead).

### Task types

| Type | Color | Description |
|---|---|---|
| `feature` | 🟢 Green | New functionality |
| `bugfix` | 🔴 Red | Bug fix |
| `test` | 🟣 Purple | Test writing |
| `infra` | 🟠 Orange | Infrastructure/tooling |
| `docs` | 🔵 Cyan | Documentation |
| `refactor` | 🟡 Yellow | Code restructuring |
| `polish` | 🩷 Pink | UI/UX improvements |

### Task statuses

| Status | Description |
|---|---|
| `todo` | Not started |
| `in_progress` | Currently being worked on |
| `done` | Completed and verified |
| `blocked` | Cannot proceed (manual flag) |
| `skipped` | Intentionally skipped |

---

## Dashboard

The dashboard is a single self-contained HTML file with no external dependencies. It reads `tasks.json` via HTTP fetch and renders an interactive view.

### Features

- **Top bar** — Stays in view while you scroll. A progress ring (click for completion overall, by phase and by type) and an activity sparkline (click for completions, cycle times and work in progress over time, by task type); reload, auto-refresh, mode and theme menus on the right
- **Search and filters** — Keyword search over ID, name, description and type, and filters by phase, type and status (multi-select) in one line that shows what's selected and how many tasks match. Every filter button shows how many tasks it would show given the other filters, and empty choices are dimmed
- **Detail panel** — Click a task to see full description, deps, files, and timestamps
- **Views** — Tabs for the Dependency Graph, a Kanban board, the task List, Agents and Progress; the selected tab is kept in the URL
- **Dependency graph** — Interactive SVG graph with topological layout. Tasks outside the search and filters are hidden or, if you choose, greyed out. Opens at a readable scale centered on the active task; drag to pan, Ctrl/⌘ + scroll (or pinch) to zoom, zoom/fit/1:1 buttons, keyboard shortcuts (`+` `-` `0` `F`, arrows) when focused, and a clickable minimap when the graph doesn't fit. Filtering and auto-refresh keep your zoom level
- **Kanban board** — Todo / In Progress / Blocked / Done columns; todo cards show whether they're ready or what they wait on, and **Next up** marks the task `/atm:loop-tasks` will pick next; optional swimlanes per phase
- **List** — Task cards, color-coded by status and type, with dependency links
- **Agents** — A timeline with a lane per agent and a bar per task (start to completion, colored by type; work in progress runs to now). Zoom with the buttons, Ctrl/⌘ + scroll or "last hour" presets, drag to move in time, or pick a range on the overview. Agents are recorded by `atm` since 0.12.0; older tasks show as "Unattributed"
- **Progress** — Burndown chart (remaining vs. scope, with a forecast) and per-phase completion estimates in agent working time; click a phase to focus the chart. Estimates are most accurate with `started_at`/`completed_at`, which `/atm:do-task` and `/atm:loop-tasks` write since 0.7.0
- **Saved view per project** — Filters and search, the tab, each tab's options (Kanban, Progress focus, graph hide/grey out) and the zoom of the graph and the Agents timeline come back when you reopen the dashboard. Each project keeps its own (by `meta.id` in `tasks.json`, else the project name); **Reset view** clears it. A `#view=` link still opens that tab
- **Light and dark mode** — Follows your system by default; switch between System, Light and Dark in the menu at the top right
- **Themes** — Default, Nord, Solarized, Catppuccin, Tokyo Night and High contrast, each in light and dark, checked for readable contrast (see [docs/theme-validation.md](docs/theme-validation.md)). Theme and mode are remembered per browser
- **Live claims** — In-progress tasks show which agent works on them, on which branch, and since when
- **Auto-refresh** — On by default every 5s; the toggle and interval (in the menu next to the reload button) are remembered per browser
- **What's new** — The version next to the title opens the release notes; a "new" marker appears after an upgrade
- **Manual reload** — Click reload button for instant refresh

### Starting the dashboard

The dashboard must be served over HTTP (not `file://`) because it fetches `tasks.json`. The easiest way is
`/atm:serve` (see [Skills Reference](#atmserve)). Any static server works too, for example:

```bash
cd .agentic-task-manager && python3 -m http.server 8000
```

Then open [http://localhost:8000/tasks-dashboard.html](http://localhost:8000/tasks-dashboard.html).

### Watching live progress

1. Start the dashboard (auto-refresh is on by default, every 5s)
2. In another terminal, start Claude Code and run `/atm:loop-tasks`
3. Watch tasks move from todo → in_progress → done in real time

---

## Git Push Strategies

The `/atm:loop-tasks` skill supports flexible git strategies:

| Strategy | Command | When to use |
|---|---|---|
| Commit only (default) | `/atm:loop-tasks` | Local history, push manually later |
| No git | `/atm:loop-tasks --no-commit` | You want full manual control |
| Commit + push | `/atm:loop-tasks --push` | Real-time backup, CI after every task |
| Batch push | `/atm:loop-tasks --batch-push` | Clean remote history, single CI run |
| Periodic push | `/atm:loop-tasks --push-every 5` | Balance: CI every 5 tasks |
| Human-in-the-loop | `/atm:loop-tasks --pause --push` | Review each task before pushing |

---

## Tips & Best Practices

### Task granularity
Each task should be completable by a single agent in under 10 minutes. If a task description is longer than a paragraph, it should probably be split.

### Dependencies
Use dependencies to enforce execution order. A task won't be picked up until all its dependencies are `done`. This prevents issues like "write tests for code that doesn't exist yet."

### Phases
Use phases to group related work. Phase 0 is typically setup/foundation. Higher phases build on earlier ones. The loop processes lower phases first.

### Manual intervention
You can edit `tasks.json` while the loop runs. Changes are picked up on the next iteration. Edit task definitions
freely, but change statuses with the helper (`plugin/scripts/atm start|done|fail|release <id>`), which locks the file
so your change and an agent's can't overwrite each other. Use this to:
- Mark a task as `skipped` if it's no longer needed
- Mark a task as `blocked` to prevent the agent from picking it up
- Add new tasks mid-loop
- Change task descriptions or dependencies

### Multiple agents
See [Running agents in parallel](#running-agents-in-parallel).

---

## Running agents in parallel

You can run several `/atm:loop-tasks` (or `/atm:do-task`) sessions on one project at the same time. atm makes sure
they don't take the same task or overwrite each other's changes to `tasks.json`.

**Recommended setup: one git worktree per agent.** Agents that edit code in the same folder step on each other's
files and builds, which atm can't prevent. Give each agent its own worktree and branch from the same clone:

```bash
git worktree add ../myproject-agent2 -b agent2
cd ../myproject-agent2 && claude      # then /atm:loop-tasks
```

Merge each branch back as usual (or open a PR per branch).

**What atm guarantees**
- **One writer at a time.** Every status change goes through the plugin's helper (`atm`), which takes a lock,
  re-reads `tasks.json`, changes one task and writes the file atomically. The dashboard and other agents never see a
  half-written file, and two changes never overwrite each other.
- **Claims.** `atm next --claim` picks the next task and claims it in one step. Claims record the agent (each Claude
  Code session has its own identity), branch and worktree. They are stored in the clone's `.git` directory, so agents
  in different worktrees of the clone see each other's claims straight away. A task finished in one worktree isn't
  handed out again in another before the branches merge.
- **Leases.** A claim lasts 30 minutes and is renewed by `atm heartbeat` during long tasks (`"lease_minutes"` in
  `tasks.json`'s `meta` changes the length). If an agent crashes, its task goes back to `todo` when the lease runs out,
  with a note in `last_failure`.
- **Merging `tasks.json`.** A git merge driver (registered automatically) merges `tasks.json` task by task. Status
  changes from different branches combine (the further-along status wins, e.g. `done` over `in_progress`). Tasks
  added on both branches are both kept, and the incoming ones are renumbered if their IDs collide. Only conflicting
  edits to the same task's definition still need you.
- **Clean commits.** The skills commit only the files a task changed plus `tasks.json`, never `git add -A`, so a
  commit doesn't carry another agent's unfinished work.
- **Live view.** In-progress tasks on the dashboard show who works on them, on which branch, and since when.

**What it doesn't do**
- Two agents in the **same** working tree can still edit the same source files. Use worktrees.
- Agents on **different machines or clones** don't see each other's claims; they may start the same task, and the
  merge driver then reconciles the statuses.

**For humans: the helper's commands** (run from the project; the plugin's `scripts/atm`):

| Command | What it does |
|---|---|
| `atm claims` | Who works on what, with time left on each lease |
| `atm next [--phase N] [--claim]` | The task the loop would take next (and claim it) |
| `atm start\|done\|fail\|release <id>` | Change a task's status (with `--reason` for `fail`) |
| `atm heartbeat <id>` | Extend your claim's lease |
| `atm init` | Register the `tasks.json` merge driver (the skills do this automatically) |

The full analysis (scenarios, failure modes, the alternatives considered) is in
[docs/parallel-agents-design.md](docs/parallel-agents-design.md).

---

## Project Structure

```
agentic-task-manager/
├── .claude-plugin/
│   └── marketplace.json         # Self-hosted marketplace config
├── plugin/                      # The plugin (the only part that ships)
│   ├── .claude-plugin/
│   │   └── plugin.json          # Plugin manifest (version source of truth)
│   ├── skills/
│   │   ├── create-tasks/SKILL.md      # /atm:create-tasks
│   │   ├── do-task/SKILL.md           # /atm:do-task
│   │   ├── loop-tasks/SKILL.md        # /atm:loop-tasks
│   │   ├── serve/SKILL.md             # /atm:serve
│   │   └── update-dashboard/SKILL.md  # /atm:update-dashboard
│   ├── scripts/
│   │   ├── atm                  # Helper launcher: checks for Python 3.9+, runs atm.py
│   │   └── atm.py               # The helper (standard library only)
│   ├── templates/
│   │   ├── tasks.json           # Example tasks.json schema
│   │   └── tasks-dashboard.html # Dashboard (build output of dashboard/, copied to projects)
│   └── CLAUDE.md                # Plugin context for Claude Code
├── dashboard/                   # Dashboard source: Svelte 5 + TypeScript (development only)
├── .agentic-task-manager/       # This repo's own atm task list (we dogfood atm)
├── docs/                        # Requirements, designs and plans
├── .githooks/pre-commit         # Rebuilds the dashboard when its sources are committed
├── .github/workflows/ci.yml     # Lint, unit, build-freshness and e2e checks
├── CLAUDE.md                    # Development notes for Claude Code
├── README.md                    # This file
└── LICENSE                      # MIT
```

---

## Development

The dashboard is developed in `dashboard/` (Svelte 5, TypeScript, Vite) and built into a **single self-contained HTML
file** at `plugin/templates/tasks-dashboard.html`. That file is committed, because the plugin installs straight from
git with no build step.

```bash
cd dashboard
npm install          # also enables the pre-commit hook (git core.hooksPath = .githooks)
npm run dev          # Vite dev server
npm run verify       # check + unit tests with coverage + build + e2e — run before committing
```

| Script | What it does |
|---|---|
| `npm run build` | Builds `plugin/templates/tasks-dashboard.html`; the version meta tag comes from `plugin.json` |
| `npm test` / `npm run test:coverage` | Vitest unit and component tests (`tests/unit/`), 90% line threshold on `src/lib` |
| `npm run test:e2e` | Build, then the Playwright regression suite (`tests/e2e/`) |
| `npm run check` | Version consistency, svelte-check, ESLint, Prettier |

**Tests.** e2e specs serve fixtures from `tests/fixtures/` as `tasks.json` per test and fail on any external request.
They run against the build, with strict screenshot baselines per platform; CI runs them in the pinned Playwright
container and generates any missing Linux baselines for you to commit.

**Build artifact.** Never edit `plugin/templates/tasks-dashboard.html` by hand. The pre-commit hook rebuilds and stages
it when dashboard sources change, and CI fails if the committed file doesn't match a fresh build.

**Releasing.** Bump `version` in both `plugin/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`
(`npm run check` enforces that they match) and rebuild, so `/atm:update-dashboard` picks up the new dashboard.

---

## Future Vision

### Multi-tool support
`tasks.json` is plain JSON — any tool that can read/write files can participate. Future adapters planned for:
- **OpenAI Codex CLI**
- **Cursor** (via `.cursorrules`)
- **Aider** (via convention files)
- **Windsurf** (via Cascade rules)

### Multi-machine coordination
Claims shared between clones on different machines, through refs on the shared remote (see the design doc).

### External tool sync
MCP servers to sync `tasks.json` bidirectionally with GitHub Issues, Linear, or Jira.

### AI task estimation
Optional `estimated_minutes` and `actual_minutes` fields with burndown chart in the dashboard.

---

## Contributing

Contributions welcome! Please open an issue or PR on [GitHub](https://github.com/hakanserce/agentic-task-manager).

## License

MIT — see [LICENSE](LICENSE).

## Author

**Hakan Serce** — [blog.hakanserce.com](https://blog.hakanserce.com) · [GitHub](https://github.com/hakanserce)
