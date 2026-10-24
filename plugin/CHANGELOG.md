# Changelog

All notable changes to the atm plugin and its task dashboard. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).
To get a new dashboard into a project, update the plugin and run `/atm:update-dashboard`.

## [0.12.0] - 2026-10-24

### Added
- Light and dark mode: the dashboard follows your system setting, or choose System, Light or Dark in the top right.
  Your choice is remembered per browser and applied before the page appears, so there's no flash of the other mode.
- Themes: Default, Nord, Solarized, Catppuccin (Latte/Mocha), Tokyo Night (Day/Night) and High contrast, each with a
  light and a dark variant. All colours meet contrast targets for readable text (see docs/theme-validation.md in the
  repository).
- Filter buttons show how many tasks each would show, given the other filters; values with no tasks are dimmed.
- A new top bar that stays in view while you scroll: a progress ring and an activity sparkline next to the title.
  Click the ring for completion overall, by phase and by type. Click the sparkline for activity: tasks completed by
  type, how many agents were working, time per task, and idle stretches when no agent worked, for a period you pick
  (hour, day, week, month, all time or custom; ‹ › step back to yesterday, last week, last month, …). Reload,
  auto-refresh, mode and theme are compact menus in the top right.
- Keyword search over task ID, name, description and type. The filters fold into one line under the title that shows
  only what's selected, with the number of matching tasks; **Filters** opens Phase, Type and Status.
- **Agents** tab: a timeline with a lane per agent and a bar per task, from start to completion, coloured by type;
  work in progress runs up to now. Zoom with the buttons, Ctrl/⌘ + scroll or the "last hour" presets, drag to move
  in time, or pick a range on the overview below the lanes. **Live** keeps it at the current time. Tasks outside the
  search and filters are greyed out.
- Agent utilisation on the Progress tab: agent work time against calendar time (24 hours a day) and against working
  time (8 hours a day, Monday to Friday), overall and per agent.
- `atm start` (and `atm next --claim`) record which agent took a task in its new `agent` field. It stays when the
  task is done and is removed if the task goes back to todo. Tasks finished earlier show as "Unattributed".
- **Task List** tab: the task cards, which used to sit below the views. The tabs have icons and sit on the view,
  which fills the rest of the window (the dependency graph uses all of it).
- The dependency graph can hide tasks outside the search and filters (the default) or show them greyed out.
- The dashboard remembers your view per project: filters and search, the selected tab, the options in each tab
  (Kanban, Progress focus, graph hide/grey out, Agents Live, the Activity period), and the zoom of the graph and the
  Agents timeline. **Reset view** forgets it.
- `/atm:create-tasks` gives new task files a `meta.id`, and `atm init` adds one to existing files, so dashboards of
  different projects on the same port keep separate views.

### Changed
- Kanban "Group by phase" is now remembered per project instead of per browser (your previous choice is kept as the
  starting point).
- The count boxes and the small completion chart above the filters are replaced by the top-bar widgets, and the
  views panel no longer collapses.

### Fixed
- Phase badges have their tinted background again (lost in 0.5.0).

## [0.11.0] - 2026-10-23

### Added
- Several agents can now work on one project at once. Run `/atm:loop-tasks` in more than one session, ideally each
  in its own git worktree: they never take the same task or overwrite each other's changes to `tasks.json`. See
  "Running agents in parallel" in the README.
- Claims: the skills take each task with `atm next --claim`, which records the agent, branch and worktree. All
  worktrees of a clone share the claims. A claim lasts 30 minutes and is renewed during long tasks; if an agent stops,
  its task becomes available again when the claim runs out.
- The dashboard shows who works on each in-progress task, on which branch and since when (cards, Kanban board and
  task details).
- `tasks.json` merges task by task: status changes from different branches combine, and tasks added on both
  branches are both kept. A git merge driver for this is registered automatically.

### Changed
- `/atm:do-task` and `/atm:loop-tasks` change task status only through the plugin's helper, which locks
  `tasks.json` and writes it atomically, so the dashboard never reads a half-written file.
- The skills commit only the files a task changed plus `tasks.json`, instead of everything in the working tree.
- A failed task records why in `last_failure`.

### Fixed
- `/atm:serve stop` no longer waits several seconds in containers (dev containers, CI images) before reporting the
  server stopped.

## [0.10.0] - 2026-10-23

### Added
- `/atm:serve` starts the dashboard in a background server (`--open` opens the browser, `stop` and `status` manage
  it). It uses port 8000 or the next free one, keeps running after the session ends, and only ever stops the server
  it started for this project.
- Everything atm needs now lives in one folder, `.agentic-task-manager/`, at the root of your project.

### Changed
- Projects that keep `tasks.json` in `docs/` or the project root are moved into `.agentic-task-manager/` the first
  time a skill runs, with `git mv` so history is kept. The move is staged for you to commit; `/atm:loop-tasks`
  commits it on its own before its first task.
- The dashboard HTML is no longer committed to your repository. It's a copy of the plugin's dashboard, listed in
  `.agentic-task-manager/.gitignore`, and the skills bring it up to date automatically when they run.
- The skills use a small helper script that needs **Python 3.9 or newer** (standard library only, nothing to
  install). On macOS it comes with the Command Line Tools, like `git`.
- Updating the plugin: run `/plugin marketplace update hakanserce-plugins`, then `/reload-plugins`. No restart.

## [0.9.0] - 2026-10-23

### Added
- **Progress** tab: a burndown chart of remaining work and total scope over time, with a forecast to the estimated
  finish. Click a phase to see only that phase.
- Per-phase table with progress, remaining work and a completion estimate, e.g. "≈ 1 h 10 m of agent work
  (50 m – 1 h 40 m)", plus the clock time if the loop keeps running. Estimates use the median time per task over
  the last 10 completed tasks and follow the loop's phase order; blocked work is flagged, not estimated.
- Estimates use `started_at`/`completed_at` when present (written by the skills since 0.7.0). Older task files
  still work: the time between completions is used instead, with idle gaps capped at 30 minutes.

## [0.8.0] - 2026-10-23

### Added
- Kanban board: the dependency graph now shares its panel with a **Kanban** tab (and a Progress tab, coming next).
  The selected tab is part of the URL, so a reload or a shared link opens the same view.
- Kanban columns for Todo, In Progress, Blocked and Done (Skipped on request). Todo cards say whether they are
  ready or which tasks they are waiting on, and **Next up** marks the task `/atm:loop-tasks` will pick next.
- Optional "Group by phase" swimlanes on the Kanban board, remembered per browser.

### Changed
- The graph keeps its zoom and position while you look at another tab.

## [0.7.0] - 2026-10-22

### Added
- Release notes in the dashboard: the version next to the title opens a "What's new" panel, and shows a "new" marker
  after an upgrade until you've opened it.

### Changed
- Auto-refresh is now on by default (every 5 seconds), and the dashboard remembers whether you switched it off and
  which interval you chose.
- The dependency graph keeps its zoom level when filters change or a reload changes the visible tasks. It only pans
  when no task would be left on screen.
- `/atm:do-task` and `/atm:loop-tasks` record when each task started (`started_at`) and was completed
  (`completed_at`). The activity timeline uses the completion time.

### Fixed
- `/atm:update-dashboard` looked for the new dashboard one directory too high inside the installed plugin, and now
  prints the actual release notes between your old and new version instead of a summary it made up.

## [0.6.0] - 2026-10-22

### Added
- Dependency graph zoom and pan: drag to pan, Ctrl/⌘ + scroll or pinch to zoom, zoom/fit/1:1 buttons, keyboard
  shortcuts when the graph has focus, and a clickable minimap when the graph doesn't fit.
- Large graphs open at a readable scale, centered on the task in progress; small graphs open at 100% instead of
  being stretched to the page width.

## [0.5.0] - 2026-10-22

### Changed
- The dashboard was rebuilt (Svelte 5) with an automated test suite. It looks and behaves the same as before.
- Filter buttons and the browser tab title now update when tasks.json is reloaded.

### Fixed
- Task names and descriptions are shown as plain text. Previously, HTML in tasks.json was rendered as markup.
- Installation instructions in the README use the correct plugin name (`atm@hakanserce-plugins`).

## [0.4.0] - 2026-04-05

### Added
- Task timestamps: `created_at` and `updated_at`.
- Activity timeline on the dashboard showing when tasks were completed.
- `/atm:update-dashboard` to copy the latest dashboard into a project.

### Changed
- `/atm:loop-tasks` commits after each task by default (`--no-commit` to opt out).

## [0.3.0] - 2026-04-04

### Changed
- The plugin lives in its own `plugin/` directory, separate from the marketplace configuration.

## [0.2.0] - 2026-04-04

### Changed
- The plugin is now called `atm`, so skills are `/atm:create-tasks`, `/atm:do-task`, `/atm:loop-tasks`.
- Repository restructured to follow Claude Code plugin conventions; installable from the `hakanserce-plugins`
  marketplace.

## [0.1.0] - 2026-04-03

### Added
- Initial release: skills to decompose requirements into `tasks.json`, execute one task, and loop through all tasks,
  plus a self-contained HTML dashboard with stats, filters, task cards and a dependency graph.
