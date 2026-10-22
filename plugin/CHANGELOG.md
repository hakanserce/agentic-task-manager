# Changelog

All notable changes to the atm plugin and its task dashboard. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).
To get a new dashboard into a project, update the plugin and run `/atm:update-dashboard`.

## [Unreleased]

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
