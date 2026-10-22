# Dashboard v2: release notes, Kanban board, progress forecasts

**Status:** proposal, for review · **Date:** 2026-10-22 · **Starts from:** atm 0.6.0

## 1. Context and goals

The dashboard is now a tested Svelte 5 app (`dashboard/`) built into one self-contained file. Three additions are wanted:

1. **Release notes.** Users should see what changed when the plugin and dashboard update. Today there are none.
   `/atm:update-dashboard` makes up its "What's new" line from the version numbers.
2. **Kanban board.** A status-oriented view of the work, next to the dependency graph.
3. **Burndown and per-phase completion estimates.** How much work is left, and when each phase is likely to be done.
4. **Two behaviour fixes:** auto-refresh should be on by default, and filtering should not reset the graph's zoom.

On screen, the dependency graph section becomes a tabbed panel: **Dependency Graph | Kanban | Progress**.

### Non-goals
- **Editing tasks from the dashboard.** This includes Kanban drag-and-drop. The dashboard is served by a static file
  server and cannot write `tasks.json`. Agents and humans edit the file; the dashboard stays read-only.
- **Syncing with external trackers** (GitHub Issues, Jira, Linear).
- **Multi-project views.**

## 2. Requirements

Priorities: **P1** must ship in this round; **P2** should ship if cheap, otherwise it gets its own task later.

### FR-1 Release notes

| ID | P | Requirement |
|---|---|---|
| FR-1.1 | P1 | A single changelog, `plugin/CHANGELOG.md`, in Keep a Changelog style: `## [x.y.z] - YYYY-MM-DD` with `### Added / Changed / Fixed` lists. It lives in `plugin/` so the installed plugin's skills can read it. |
| FR-1.2 | P1 | Backfill entries for 0.1.0 to 0.6.0 from git history, plus an entry for every new release. |
| FR-1.3 | P1 | `/atm:update-dashboard` reports the actual changelog entries between the project's old version (exclusive) and the new one (inclusive), instead of improvising. A dashboard without a version tag counts as 0.0.0. |
| FR-1.4 | P1 | The build parses the changelog and embeds it in the dashboard, so it needs no extra request and no runtime Markdown library. The header shows a version chip ("v0.7.0"); clicking it opens a **What's new** panel listing versions newest first. |
| FR-1.5 | P2 | After an upgrade, the version chip shows a "new" marker until the panel is opened once. The last-seen version is stored in `localStorage`. If storage is unavailable, the marker simply never shows; this must not cause errors. |
| FR-1.6 | P1 | `npm run check` (and therefore CI) fails if `CHANGELOG.md` has no entry for the version in `plugin.json`. |
| FR-1.7 | P2 | The skills' "dashboard is outdated" hint names the most important change, e.g. "0.8.0 adds a Kanban board". |

### FR-2 Tabbed views

| ID | P | Requirement |
|---|---|---|
| FR-2.1 | P1 | The graph section becomes a panel with three tabs: **Dependency Graph** (default), **Kanban**, **Progress**. Collapse and expand still work for the whole panel. |
| FR-2.2 | P1 | The selected tab survives reloads and auto-refresh, and is shareable via the URL hash (`#view=kanban`). |
| FR-2.3 | P1 | Accessible tabs following the WAI-ARIA pattern: `role=tablist/tab/tabpanel`, Left/Right arrow keys move between tabs. |
| FR-2.4 | P1 | Switching tabs keeps each view's state. For example, the graph's pan and zoom is not reset by visiting Kanban. |
| FR-2.5 | P1 | Phase, type and status filters apply to all three tabs. The badge next to the tabs shows the filtered task count. |
| FR-2.6 | P1 | The DOM hooks the existing specs use (`#graph-section`, `#graph-container`, `#dep-graph`, `#graph-badge`) keep working. |

### FR-3 Kanban board

| ID | P | Requirement |
|---|---|---|
| FR-3.1 | P1 | Columns **Todo**, **In Progress**, **Blocked**, **Done**, each with a count. **Skipped** is hidden behind a "Show skipped" toggle. Unknown statuses get an **Other** column, shown only if any exist. |
| FR-3.2 | P1 | Compact cards: id, name, phase and type badges. Clicking a card opens the existing detail panel. |
| FR-3.3 | P1 | **Readiness** on Todo cards: either "Ready" (all dependencies done) or "Waiting on T-007, T-009". |
| FR-3.4 | P1 | A **Next up** marker on the task `/atm:loop-tasks` would pick next: the first ready Todo task with the lowest phase, then lowest ID. This uses the same selection rule as the skills. |
| FR-3.5 | P1 | Column order: **Todo** puts ready tasks first, then sorts by phase and ID (the loop's order). **In Progress** sorts by most recently started. **Done** sorts by most recently completed. **Blocked** sorts by phase and ID. |
| FR-3.6 | P1 | Long columns stay usable: **Done** shows the 20 most recent tasks with a "Show all (N)" link. Columns scroll on their own, and the board scrolls sideways on narrow screens. |
| FR-3.7 | P2 | A **Group by phase** toggle that splits the board into one row (swimlane) per phase. |
| FR-3.8 | P1 | With a status filter active, only the matching columns are shown. |

### FR-4 Progress: burndown and phase estimates

| ID | P | Requirement |
|---|---|---|
| FR-4.1 | P1 | **Burndown chart:** remaining tasks over time, drawn as a step line. A second line shows total scope (tasks created over time), so added work is visible instead of hidden. A forecast segment runs from now to the projected finish. |
| FR-4.2 | P1 | **Phase table:** one row per phase with done/total, a progress bar, remaining count, state (Done / In progress / Not started), and either a **completion estimate** or, for finished phases, the date it was done. |
| FR-4.3 | P1 | Estimates follow the forecast model in §3, with a likely value and a range (optimistic to pessimistic). The table says what the estimate is based on, e.g. "based on the last 10 tasks: ~6 min each". |
| FR-4.4 | P1 | With fewer than 3 completed tasks that have timestamps, show "Not enough history to estimate" instead of a guess. |
| FR-4.5 | P1 | The chart has a text alternative: the phase table is the accessible summary, and data points show a tooltip on hover. |
| FR-4.6 | P2 | Clicking a phase row limits the burndown to that phase. |
| FR-4.7 | P2 | If tasks carry `estimated_minutes` (FR-5.3), estimates use the remaining estimated effort, corrected by how past estimates compared with actual durations. |

### FR-5 Task data and skills

| ID | P | Requirement |
|---|---|---|
| FR-5.1 | P1 | New optional task fields: `started_at` (set when a task moves to `in_progress`) and `completed_at` (set when it moves to `done`), both ISO 8601 UTC. `/atm:do-task` and `/atm:loop-tasks` write them. A task that goes back to `todo` clears both. |
| FR-5.2 | P1 | The dashboard accepts old files. If `completed_at` is missing on a done task, it falls back to `updated_at`. If `started_at` is missing, durations are estimated from the gaps between completions (§3). |
| FR-5.3 | P2 | An optional `estimated_minutes` field, which `/atm:create-tasks` can fill when asked. |
| FR-5.4 | P1 | Schema documentation is updated in `README.md`, `plugin/CLAUDE.md` and `plugin/templates/tasks.json`. |

### FR-6 Behaviour fixes

| ID | P | Requirement |
|---|---|---|
| FR-6.1 | P1 | **Auto-refresh is on by default** (every 5 seconds), so the dashboard is live as soon as it opens. |
| FR-6.2 | P1 | The auto-refresh setting and interval are remembered per browser (`localStorage`), so switching it off survives a reload. Without storage, the default applies and nothing breaks. |
| FR-6.3 | P1 | **Changing filters never changes the graph's zoom level.** This applies whether or not the user has zoomed. The same goes for a reload that changes the set of visible tasks. Only the first load fits the graph automatically (and the "fit" button, on request). |
| FR-6.4 | P1 | After the visible tasks change, the pan position is kept if at least one task is still on screen. If none is, the view pans at the same zoom level to bring the graph into view: centred on the task in progress (or the next todo) if there is one, otherwise starting at the graph's top-left corner. |
| FR-6.5 | P1 | The minimap and zoom label update to match the new layout. |

### Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | The dashboard stays a single self-contained file: no runtime dependencies, no external requests. Charts are hand-written SVG. The size budget stays at 150 KB (0.6.0 is 77 KB). |
| NFR-2 | Stays usable with 500 tasks: switching tabs and refreshing data feel instant (under 200 ms render). |
| NFR-3 | Matches the existing dark theme and colours: status colours on the Kanban board and in charts, phase colours in the phase table. |
| NFR-4 | Tests follow the project conventions: unit tests for every new `src/lib` module (90% line threshold), e2e specs for each tab, screenshot baselines per tab. Anything that depends on the current time is tested with a fixed clock (`page.clock`, `vi.useFakeTimers`). |
| NFR-5 | Backward compatible: a 0.6.0-era `tasks.json` renders without errors in every tab. |

## 3. Forecast model (FR-4)

Agent work comes in bursts. A loop finishes tasks every few minutes, then nothing happens until someone starts it
again. A calendar-time rate ("tasks per day") averages those idle gaps into nonsense, so the model measures
**working time per task** instead:

1. **Duration per completed task:** `completed_at − started_at` when both exist. Otherwise, the gap since the
   previous completion, capped at 30 minutes so idle gaps don't count as work.
2. **Pace:** the median duration over the last 10 completions. The 25th and 75th percentiles give the
   optimistic and pessimistic range. The median keeps a single slow task from skewing the estimate.
3. **Phase estimates follow the loop's order** (lowest phase first). The remaining work for phase N is all
   unfinished tasks in phases ≤ N, multiplied by the pace. Shown as working time, e.g. "≈ 1 h 10 m of agent work
   (50 m – 1 h 40 m)".
4. **Calendar estimate:** the same working time added to "now", labelled "if the loop keeps running". This is shown
   as secondary information, because nobody can predict when the next session starts.
5. **Blocked** and **skipped** tasks don't count as remaining work. Blocked tasks are listed with a warning, since
   they hold back their phase.

## 4. Release plan

Each milestone becomes one phase of tasks and one release.

| Release | Contents | Why this order |
|---|---|---|
| **0.7.0** | FR-6 (behaviour fixes), FR-1 (release notes) and FR-5.1, FR-5.2, FR-5.4 (start/complete timestamps in the skills) | Small and useful straight away. The fixes are the first entries in the new changelog, and projects start collecting the timing data the forecasts need. |
| **0.8.0** | FR-2 (tabs) and FR-3 (Kanban) | The tab panel is needed by both views. Kanban needs no new data. |
| **0.9.0** | FR-4 (Progress tab) and the P2 items that turned out cheap | By then, real projects (including this repo's `docs/tasks.json`) have timing data to check the estimates against. |

## 5. Testing approach
- **New fixtures:** `progress.json` (tasks across phases with `started_at`/`completed_at` over several days, including
  idle gaps, scope added midway, and a blocked task), plus Kanban cases (ready versus waiting, unknown status,
  more than 20 done tasks).
- **Unit tests:** changelog parser, version comparison and range selection, Kanban grouping/ordering/next-up
  (checked against the loop's selection rule), forecast maths (durations, gap capping, percentiles, phase
  accumulation, the "not enough history" threshold).
- **Changed e2e specs (FR-6):** "auto-refresh is off by default" becomes "on by default, and switching it off is
  remembered". "Changing the visible tasks re-fits" becomes "keeps the zoom level, and pans only when no task would
  be visible". Every other spec that relies on auto-refresh being off must switch it off explicitly or use a fixed
  clock, so a background reload can't change what it checks.
- **e2e tests:** tab behaviour (hash, keyboard, state kept, filters), Kanban columns and ordering, the progress table
  with a fixed clock, the What's new panel and its "new" marker, and fallbacks with old `tasks.json` files. New
  screenshot baselines for each tab.

## 6. Open questions
1. **Forecast display:** should "working time" (§3.3) be the main estimate, with the calendar time secondary?
   Proposed: yes.
2. **Kanban versus the task list:** should the task card list below the panel stay when Kanban is selected?
   Proposed: keep it. It's the full list, and it's what the "needs:" links scroll to.
3. **Estimates:** should `estimated_minutes` (FR-4.7, FR-5.3) be in this round, or wait for the timing data?
   Proposed: wait. Measured pace may turn out to be good enough.
4. **GitHub releases:** should the release process also tag `vX.Y.Z` and create a GitHub release from the changelog
   entry? Cheap to add to CI, but it publishes externally.
