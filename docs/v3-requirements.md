# atm v3: project folder, serve skill, themes, saved views, parallel agents

**Status:** proposal, for review · **Date:** 2026-10-23 · **Starts from:** atm 0.9.0

## 1. Context and goals

Eight requests from this round:

1. Store `tasks.json` and the dashboard in a dedicated **`.agentic-task-manager/`** folder.
2. **Light and dark modes.**
3. **Themes.**
4. **Counts on the filter buttons.**
5. **Remember filters and view choices per project**, and restore them when the dashboard is reopened.
6. A skill to **start and stop the dashboard server**.
7. **Fix the update instructions:** `/reload-plugins` is enough; no restart.
8. A safe way for **several agents to work in parallel** without corrupting or racing on `tasks.json`. The analysis,
   alternatives and recommended protocol are in **`docs/parallel-agents-design.md`**; FR-8 below implements it.

### Non-goals
- Editing tasks from the dashboard (it stays read-only; FR-8 changes how agents write, not the dashboard).
- User-defined themes in this round (themes are built in, but defined as data so adding one is cheap).
- Windows support for the new scripts beyond what is noted as P2.

## 2. Requirements

Priorities: **P1** must ship in this round; **P2** if cheap, otherwise later.

### FR-1 Project folder `.agentic-task-manager/`

| ID | P | Requirement |
|---|---|---|
| FR-1.1 | P1 | `tasks.json` and `tasks-dashboard.html` live in `.agentic-task-manager/` at the project root. All skills look there first. |
| FR-1.2 | P1 | `/atm:create-tasks` creates the folder, plus `.agentic-task-manager/.gitignore` for runtime files (server state, claims snapshot, lock) **and `tasks-dashboard.html`**. Only `tasks.json` (and `.gitattributes`, FR-8.6) is committed. |
| FR-1.3 | P1 | **Automatic migration.** When any atm skill finds the task file in an old location (`docs/tasks.json`, or `tasks.json` in the root) and no `.agentic-task-manager/tasks.json` exists, it moves it there before doing anything else: `git mv` when the file is tracked (history is kept), a plain move otherwise. The old dashboard is removed (`git rm --cached` if tracked, then deleted); the current one is copied into the new folder. The skill reports what it moved in one line. |
| FR-1.4 | P1 | The migration is its own change: `/atm:loop-tasks` commits it as `chore: move atm files to .agentic-task-manager/` before the first task (unless `--no-commit`); the other skills stage it and say so. If files exist in both the old and the new location, nothing is moved and the skill warns and uses the new one. |
| FR-1.5 | P1 | README, `plugin/CLAUDE.md`, skill texts and script defaults use the new location. |
| FR-1.6 | P1 | This repository moves its own `docs/tasks.json` into `.agentic-task-manager/` (through the migration above) and stops committing `docs/tasks-dashboard.html`. Plans and requirements stay in `docs/`. |
| FR-1.7 | P1 | The dashboard HTML is not committed: it is a copy of the plugin's template, restored by `/atm:serve` (FR-6.7), `/atm:create-tasks` and `/atm:update-dashboard` whenever it is missing or outdated. Dashboard upgrades therefore no longer produce large diffs. |

### FR-2 Light and dark modes

| ID | P | Requirement |
|---|---|---|
| FR-2.1 | P1 | Every colour is a CSS token, defined for both light and dark. Nothing in components hard-codes a dark colour (today the graph node fills do). |
| FR-2.2 | P1 | Default: follow the operating system (`prefers-color-scheme`). A **System / Light / Dark** control in the header overrides it. |
| FR-2.3 | P1 | The choice is remembered per browser (shared by all projects). |
| FR-2.4 | P1 | The right mode applies before the first paint (no flash of the wrong mode on load). |
| FR-2.5 | P1 | All views work in both modes: stats, filters, cards, detail and What's new panels, graph (nodes, edges, minimap), Kanban, Progress (chart series colours validated per mode, as was done for dark). |
| FR-2.6 | P1 | Screenshot baselines cover light mode for the main views. |

### FR-3 Themes

| ID | P | Requirement |
|---|---|---|
| FR-3.1 | P1 | Built-in themes, each with a light and a dark variant: **Default** (today's GitHub-like look), **Nord**, **Solarized**, **Catppuccin** (Latte for light, Mocha for dark), **Tokyo Night** (Day for light, Night for dark) and **High contrast**. Colours follow each theme's published palette; where a palette has no fitting colour for a slot (e.g. a chart series that fails validation), the nearest passing colour is used and noted in the theme file. |
| FR-3.2 | P1 | A theme picker next to the mode control; remembered per browser. |
| FR-3.3 | P1 | Each theme defines the full token set: surfaces, text, accent, status, type and phase colours, chart series. Status colours keep their meaning in every theme (done is green-ish, blocked red-ish). |
| FR-3.4 | P1 | Text and chart colours meet contrast requirements in every theme and mode, checked with the same palette validator used for the burndown. High contrast is designed to meet WCAG AAA for text. |
| FR-3.5 | P2 | Themes are data (one token map per theme), so adding a theme doesn't touch components. |

### FR-4 Counts on filter buttons

| ID | P | Requirement |
|---|---|---|
| FR-4.1 | P1 | Every filter button shows a count badge: how many tasks match that value **given the selections in the other filter groups** (standard faceted counts). |
| FR-4.2 | P1 | The "All" button of a group shows the count for the whole group under the other groups' selections. |
| FR-4.3 | P1 | Buttons with a count of 0 are dimmed but stay clickable. |
| FR-4.4 | P1 | Counts update on reload and auto-refresh. |
| FR-4.5 | P1 | Screen readers hear the count too (e.g. "Feature, 3 tasks"). |

### FR-5 Saved view per project

| ID | P | Requirement |
|---|---|---|
| FR-5.1 | P1 | Remembered **per project**: filters, selected tab, graph panel collapsed, Kanban options (group by phase, show skipped), focused phase on the Progress tab. |
| FR-5.2 | P1 | A project is identified by a new `meta.id` in `tasks.json` (a random ID written by `/atm:create-tasks`). Without one, the dashboard falls back to `meta.project`. This matters because projects served on the same port share browser storage. |
| FR-5.3 | P1 | On load, the saved view is restored. Values that no longer exist (a removed phase or type) are dropped silently. |
| FR-5.4 | P1 | A `#view=` in the URL overrides the saved tab, so shared links still work. |
| FR-5.5 | P1 | A "Reset view" control clears the saved view for this project. |
| FR-5.6 | P1 | Theme, mode, auto-refresh and the last-seen version stay **per browser**, not per project. |
| FR-5.7 | P2 | The graph's zoom and pan position is saved per project too. |

### FR-6 `/atm:serve` skill

| ID | P | Requirement |
|---|---|---|
| FR-6.1 | P1 | `/atm:serve` starts the dashboard server for the current project; `/atm:serve stop` stops it; `/atm:serve status` reports it. |
| FR-6.2 | P1 | The server serves `.agentic-task-manager/` by absolute path, so it works from any directory, including a terminal whose folder was deleted and recreated. |
| FR-6.3 | P1 | Port 8000 by default; if busy, the next free port. The port and process ID are recorded in `.agentic-task-manager/.server.json` (gitignored). |
| FR-6.4 | P1 | Starting when this project's server is already running just reports its URL. A stale record (process gone) is cleaned up. |
| FR-6.5 | P1 | `stop` only kills the process it started: it checks the recorded process is really this project's server. |
| FR-6.6 | P1 | The server runs detached and keeps running after the Claude Code session ends. |
| FR-6.7 | P1 | Before starting, it makes sure `tasks-dashboard.html` exists and is current; if not, it copies the plugin's version. |
| FR-6.8 | P1 | Output: the URL to open. `--open` also opens it in the default browser. |
| FR-6.9 | P1 | `/atm:create-tasks` suggests `/atm:serve` instead of the `python3 -m http.server` command. |
| FR-6.10 | P1 | Implemented in the plugin's Python helper (Python 3.9+, standard library only) with automated tests. macOS and Linux; Windows is P2. |

### FR-7 Update instructions

| ID | P | Requirement |
|---|---|---|
| FR-7.1 | P1 | README install and update steps use `/plugin marketplace update hakanserce-plugins` followed by `/reload-plugins`; all "restart Claude Code" advice is removed. |
| FR-7.2 | P1 | Check once that a fresh install also works with `/reload-plugins`, and document any exception. |

### FR-8 Parallel agents (see `docs/parallel-agents-design.md`)

| ID | P | Requirement |
|---|---|---|
| FR-8.1 | P1 | The `atm` helper: makes every status change under an exclusive lock, with atomic replace-on-write (design L1). One implementation, `plugin/scripts/atm.py`, behind a launcher (`plugin/scripts/atm`) that explains what to install if Python 3.9+ is missing (see `docs/helper-runtime-proposal.md`). |
| FR-8.2 | P1 | `/atm:do-task` and `/atm:loop-tasks` use it for every status change and never edit status fields by hand. |
| FR-8.3 | P1 | `atm next --claim` chooses and claims the next ready task in one atomic step, using the loop's selection rule and skipping tasks with a live claim (L2). |
| FR-8.4 | P1 | Claims record agent identity, branch, worktree, claim time and a lease (default 30 min). `heartbeat` extends the lease, `release`/`done`/`fail` end it, and expired claims make the task available again (L2). |
| FR-8.5 | P1 | Claims are stored in the git common directory, so all worktrees of a clone share them; outside git, in `.agentic-task-manager/` (L2). |
| FR-8.6 | P1 | A `tasks.json` merge driver, plus `atm init` to register it, merges task by task as specified in design option E (L3). |
| FR-8.7 | P1 | The skills commit `tasks.json` plus only the files the task changed; no `git add -A` (L4). |
| FR-8.8 | P1 | The dashboard shows live claims (agent, branch, how long ago) on in-progress cards and in the Kanban board, from the gitignored claims snapshot. |
| FR-8.9 | P1 | README gets a "Running agents in parallel" section with the recommended worktree setup and the agent rules. |
| FR-8.10 | P1 | Tests: a stress test where many processes claim concurrently and no task is claimed twice; atomic-write tests (readers never see invalid JSON); merge-driver tests covering the design's experiments; lease expiry. |
| FR-8.11 | P2 | Optional remote claims through `refs/atm/claims/<task-id>` for several clones or machines (L5). *Deferred: see the reason recorded on T-081.* |

### Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | The dashboard stays one self-contained file within 150 KB (0.9.0 is 114 KB; themes add CSS). |
| NFR-2 | New scripts need no installed packages: Python 3.9+ standard library only. Python is atm's one runtime requirement. CI runs the test suite with Python 3.9 and a current version. |
| NFR-3 | Backward compatible: old locations, old `tasks.json` files and dashboards without `meta.id` keep working. |
| NFR-4 | Strict screenshots continue, now in both modes for the main views. |

## 3. Release plan

| Release | Contents | Why this order |
|---|---|---|
| **0.10.0** | FR-1 (folder and migration), FR-6 (`/atm:serve`), FR-7 (update instructions) | Every later feature refers to the new folder. The server skill builds on it and gives users the simplest way in. |
| **0.11.0** | FR-8 (parallel agents, P1 parts) | Correctness for anyone running loops in parallel, before more UI. It changes how the skills write `tasks.json`. |
| **0.12.0** | FR-4 (filter counts), FR-5 (saved views), FR-2 and FR-3 (modes and themes) | UI improvements together, with one round of screenshot updates. |

## 4. Decisions (review rounds)
1. **Dashboard HTML is not committed** (FR-1.2, FR-1.7); `tasks.json` stays committed.
2. **Themes:** Default, Nord, Solarized, Catppuccin, Tokyo Night and High contrast (FR-3.1).
3. **Theme and mode are per browser** (FR-5.6).
4. **Migration is automatic** (FR-1.3, FR-1.4).
5. **Helper runtime:** Python 3.9+ only, one implementation (FR-8.1, NFR-2). Round 1 chose Python *or* Node; the
   phase 10 review replaced that with a single implementation, see `docs/helper-runtime-proposal.md`.

## 5. Open questions
1. The remaining questions at the end of `docs/parallel-agents-design.md` (lease length, remote claims now or
   later, Windows).
