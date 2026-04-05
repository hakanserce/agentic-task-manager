# 🔄 Agentic Task Manager

A **Claude Code plugin** that gives any project file-based task management with a live HTML dashboard. Agents decompose requirements into granular tasks, execute them in a loop, and humans watch progress in real time.

**One command to install. Zero external dependencies. Works with any language.**

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)

---

## What It Does

1. **Decompose requirements into tasks** — Point the agent at your PRD, use cases, ADRs, or just describe what you need. It creates a `tasks.json` file with granular, dependency-aware tasks.

2. **Execute tasks one by one** — The agent picks up a task, marks it in-progress, implements it, verifies it, and marks it done. All status changes are written to `tasks.json` immediately.

3. **Loop through all tasks** — "Ralph Wiggum mode" 🫠 — the agent continuously picks up the next available task and works through the entire backlog while you watch.

4. **Watch progress live** — A self-contained HTML dashboard reads `tasks.json` over HTTP and shows filterable task cards, stats, and an interactive dependency graph. Enable auto-refresh to watch tasks turn green as the agent works.

---

## Quick Start

### Install the plugin

In Claude Code (terminal or VS Code), run:

```
/plugin install https://github.com/hakanserce/agentic-task-manager.git
```

Or add the marketplace first for update support:

```
/plugin marketplace add hakanserce/agentic-task-manager
/plugin install agentic-task-manager@hakanserce-plugins
```

### Create tasks

```
/atm:create-tasks
```

The agent searches your project for requirement documents (PRD, use cases, ADRs, roadmap) and decomposes them into granular tasks. If it can't find any, it asks you where to look or lets you describe requirements directly.

### Start the dashboard

In a separate terminal:

```bash
cd docs  # or wherever tasks.json was created
python3 -m http.server 8000
```

Open [http://localhost:8000/tasks-dashboard.html](http://localhost:8000/tasks-dashboard.html) in your browser. Enable **Auto** refresh (5s) to watch live.

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
- A local HTTP server for the dashboard (Python 3 recommended — usually pre-installed)

### Method 1: Direct install from GitHub

```
/plugin install https://github.com/hakanserce/agentic-task-manager.git
```

### Method 2: Via marketplace

```
/plugin marketplace add hakanserce/agentic-task-manager
/plugin install agentic-task-manager@hakanserce-plugins
```

### Method 3: Local development

Clone and load directly:

```bash
git clone https://github.com/hakanserce/agentic-task-manager.git
cd your-project
claude --plugin-dir /path/to/agentic-task-manager/plugin
```

### Verify installation

Type `/atm:` in Claude Code — you should see four skills in autocomplete:
- `/atm:create-tasks`
- `/atm:do-task`
- `/atm:loop-tasks`
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
5. Writes `tasks.json` and copies the dashboard HTML
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
1. Finds the project's `tasks-dashboard.html`
2. Compares its version tag against the plugin's latest template
3. If outdated, copies the latest version over it
4. Reports what changed

The other skills (`do-task`, `loop-tasks`, `create-tasks`) will also hint when the dashboard is outdated.

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
      "status": "todo",
      "dependencies": ["T-000"],
      "files": ["src/file.ts"],
      "created_at": "2026-04-05T12:00:00Z",
      "updated_at": "2026-04-05T14:30:00Z"
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

- **Stats bar** — Total, done, in-progress, todo counts with progress bar
- **Activity timeline** — Mini bar chart showing task completion over time, with hover details
- **Filters** — Filter by phase, type, and status (multi-select)
- **Task cards** — Color-coded by status and type, with dependency links
- **Detail panel** — Click a task to see full description, deps, files, and timestamps
- **Dependency graph** — Interactive SVG graph with topological layout
- **Auto-refresh** — Enable with toggle, configurable interval (default 5s)
- **Manual reload** — Click reload button for instant refresh

### Starting the dashboard

The dashboard must be served over HTTP (not `file://`) because it fetches `tasks.json` via XHR.

**Python** (recommended):
```bash
cd docs && python3 -m http.server 8000
```

**Node.js:**
```bash
cd docs && npx serve -p 8000
```

**PHP:**
```bash
cd docs && php -S localhost:8000
```

**Ruby:**
```bash
cd docs && ruby -run -e httpd . -p 8000
```

**Or use the bundled script:**
```bash
./plugin/scripts/serve-dashboard.sh 8000 docs
```

Then open [http://localhost:8000/tasks-dashboard.html](http://localhost:8000/tasks-dashboard.html).

### Watching live progress

1. Start the dashboard with auto-refresh enabled (5s interval)
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
You can edit `tasks.json` while the loop runs. Changes are picked up on the next iteration. Use this to:
- Mark a task as `skipped` if it's no longer needed
- Mark a task as `blocked` to prevent the agent from picking it up
- Add new tasks mid-loop
- Change task descriptions or dependencies

### Multiple agents
If you run multiple Claude Code sessions, each will pick up different tasks (first-come, first-served via the `in_progress` status). This works for parallelism but there's no formal locking — be aware of potential race conditions on `tasks.json` writes.

---

## Project Structure

```
agentic-task-manager/
├── .claude-plugin/
│   └── marketplace.json         # Self-hosted marketplace config
├── plugin/                      # Plugin directory
│   ├── .claude-plugin/
│   │   └── plugin.json          # Plugin manifest
│   ├── skills/
│   │   ├── create-tasks/
│   │   │   └── SKILL.md         # /atm:create-tasks
│   │   ├── do-task/
│   │   │   └── SKILL.md         # /atm:do-task
│   │   ├── loop-tasks/
│   │   │   └── SKILL.md         # /atm:loop-tasks
│   │   └── update-dashboard/
│   │       └── SKILL.md         # /atm:update-dashboard
│   ├── scripts/
│   │   └── serve-dashboard.sh   # Multi-runtime HTTP server launcher
│   ├── templates/
│   │   ├── tasks.json           # Example tasks.json schema
│   │   └── tasks-dashboard.html # Dashboard HTML (copied to projects)
│   └── CLAUDE.md                # Plugin context for Claude Code
├── README.md                    # This file
└── LICENSE                      # MIT
```

---

## Future Vision

### Multi-tool support
`tasks.json` is plain JSON — any tool that can read/write files can participate. Future adapters planned for:
- **OpenAI Codex CLI**
- **Cursor** (via `.cursorrules`)
- **Aider** (via convention files)
- **Windsurf** (via Cascade rules)

### Multi-agent coordination
Formal task claiming with `"assigned_to"` field and lock files to support parallel agents without race conditions.

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
