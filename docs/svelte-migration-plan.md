# Plan: Turn the dashboard into a tested Svelte 5 project

## Context
`plugin/templates/tasks-dashboard.html` is a ~1,000-line hand-written HTML/JS file with no tests. The zoom/pan/minimap work showed the cost: verification meant ad-hoc Playwright scripts in a scratchpad. Goal: a real dev project (Svelte 5 + TypeScript, Vitest unit tests, Playwright e2e, shared fixtures, CI) whose **build output is still a single, self-contained `plugin/templates/tasks-dashboard.html`** — so the plugin, `/atm:create-tasks` and `/atm:update-dashboard` keep working unchanged (they just copy that file).

Order matters: **regression tests first, against the current dashboard**, then migrate, using the same tests as the parity oracle.

Decisions made with the user:
- Baseline = last committed dashboard (v0.4.0). The uncommitted zoom/pan/minimap work gets **stashed** and re-implemented test-first in the new structure as the final phase.
- The migration is tracked by **dogfooding atm**: this plan becomes `docs/tasks.json` and is executed with `/atm:do-task` / `/atm:loop-tasks`.

## Target layout
```
dashboard/                         # dev project — NOT shipped (plugin source is ./plugin)
  package.json  vite.config.ts  svelte.config.js  tsconfig.json  playwright.config.ts
  index.html                       # Vite entry; keeps <meta name="atm-dashboard-version">
  src/
    main.ts  App.svelte
    lib/
      types.ts                     # Task, TasksFile, Status, TaskType
      theme.ts                     # TYPE_COLORS, STATUS_COLORS, PHASE_PALETTE, emoji maps
      load.ts                      # fetch ./tasks.json?<ts>, error shape
      filters.ts                   # filter options (status order), filterTasks (OR within group, AND across)
      stats.ts                     # counts, %, per-type counts
      timeline.ts                  # completion buckets (4–16), ranges
      graph/layout.ts              # topological layers (+cycle fallback), positions, edges, truncate
      graph/view.ts                # (phase 6) pan/zoom/fit math
      state.svelte.ts              # runes-based app state: tasks, filters, autoRefresh
    components/
      Header  Stats  Timeline  Filters  RefreshControls  TaskGrid  TaskCard  DetailPanel  DepGraph
      (phase 6: GraphControls  Minimap)
  tests/
    fixtures/                      # tasks.json variants (see below)
    legacy/tasks-dashboard.v0.4.0.html   # frozen baseline copy
    unit/                          # Vitest (+ @testing-library/svelte for a few components)
    e2e/                           # Playwright specs + shared helpers + snapshots
docs/tasks.json, docs/tasks-dashboard.html   # dogfood: this migration's task list
CLAUDE.md                          # repo-level dev instructions (root files aren't shipped)
.github/workflows/ci.yml
```

### Build → plugin folder
- Vite + `vite-plugin-singlefile` inlines all JS/CSS into one `tasks-dashboard.html`.
- **Until cutover (phase 5) the build writes to `dashboard/dist/`** so the shipped legacy file is never overwritten by a half-finished port; the `svelte` Playwright project serves `dashboard/dist/tasks-dashboard.html`. At cutover, `build.outDir` switches to `../plugin/templates/` (`emptyOutDir: false` so the `tasks.json` template stays) and the `svelte` project points there.
- A tiny Vite plugin (`transformIndexHtml`) injects the version from `plugin/.claude-plugin/plugin.json` into the `atm-dashboard-version` meta → one source of truth for versions.
- The built file is **committed by the developer, verified by CI** — the "check-dist" pattern used by GitHub's own `actions/typescript-action` template. CI never writes to the repo; it rebuilds and fails on `git diff --exit-code plugin/templates/tasks-dashboard.html` if the committed artifact is stale. To make this painless: `npm run build` is part of `npm run verify`, and a lightweight pre-commit hook (simple-git-hooks + lint-staged style, scoped to `dashboard/**`) rebuilds and stages the artifact.
  - Why not have CI commit the build: bot commits to `main` fight branch protection, need a write token, can retrigger CI, and put unreviewed artifacts on the default branch.
  - Alternative if artifact diffs ever get noisy: CI builds on tag and publishes to a separate `release` branch that the marketplace entry points at (needs the marketplace source to support a pinned branch/ref — verify first). Not needed now: the file is small and the plugin must install from git with no build step.
- Guardrails (tested): no external URLs/requests (zero-dependency promise), size budget (e.g. < 150 KB).

## Test design

### Fixtures (`dashboard/tests/fixtures/`)
`empty.json`, `minimal.json` (1 task), `standard.json` (all 7 types × 5 statuses, 3 phases, deps, use_cases/requirements/files, timestamps), `large-90.json` (wide graph — same generator I used for the zoom test, checked in as a script + output), `cycle.json` (dependency cycle → layout fallback), `edge-cases.json` (unknown type/status, missing dep IDs, no timestamps, long names, unicode, `<b>`-style HTML in name/description), `no-meta.json` (falls back to "Task Dashboard").

### Playwright harness
- `webServer`: static server for the HTML under test; **`tasks.json` is served per test via `page.route`** (fixture helper `useFixture(page, 'standard')`), which also enables reload/auto-refresh tests (swap the response mid-test) and the 404 error state.
- Two **projects running the same specs**: `legacy` (serves `tests/legacy/…v0.4.0.html`) and `svelte` (serves the build output — `dashboard/dist/` before cutover, `plugin/templates/` after). Chromium only, fixed viewport, `page.clock` for auto-refresh timing.
- **DOM contract**: specs use the legacy hooks the port must preserve — `#stats .stat-card`, `.filter-btn[data-filter][data-value]`, `.task-card[data-id]`, `#detail-overlay.open`, `#dep-graph`, `#graph-badge`, `#reload-btn`, `#auto-refresh-check`, `#auto-refresh-interval` — plus role/text selectors where natural.
- **Visual regression**: `toHaveScreenshot` per fixture (full page, graph section, detail panel), snapshots recorded from `legacy`; `snapshotPathTemplate` omits project name so `svelte` compares against legacy baselines with a small `maxDiffPixelRatio`.
- Request guard: fail any test that makes a non-localhost request.

### Regression spec inventory (written against legacy, must be green before any port work)
1. Load: title/subtitle text, project name, `no-meta` fallback, 404 → error box with server instructions.
2. Stats: total/done/in-progress/todo, blocked card only when >0, per-type counts, progress %.
3. Timeline: shown only with timestamps, bucket count, date range labels, tooltip on hover.
4. Filters: generated options & ordering (status order, capitalized labels), multi-select OR within group, AND across groups, "All" resets, active-state sync, "N of M shown", empty-filter message (cards and graph).
5. Task cards: badges, `needs:` dep links → `scrollToTask` highlight, UC/requirement tags.
6. Detail panel: open from card and graph node, Depends On / Required By lists navigate, timestamps, files, close via ×, overlay click, Escape.
7. Graph: node count = filtered count, edge count, badge text, cycle fixture still renders all nodes, collapse/expand toggle.
8. Refresh: Reload button re-fetches and re-renders; auto-refresh toggle + interval (via `page.clock`); filters survive reload.
9. Edge cases: unknown type/status render with fallbacks, missing deps don't crash, long names truncated (22 chars) in graph.

Known intentional divergence: legacy injects task text as raw HTML (XSS). The HTML-in-name test is `test.fail()` for `legacy` and must pass (escaped) for `svelte` — documented in the spec.

### Unit tests (Vitest)
Pure modules in `src/lib` get characterization tests mirroring legacy behavior: layer assignment & cycle fallback, filter semantics, status ordering, stats math, bucket clamping, truncation; later `graph/view.ts` (fit/clamp/zoom-at-point). Coverage threshold (e.g. 90% lines on `src/lib`). A few component tests (TaskCard, Filters) with `@testing-library/svelte`.

## Phases (each becomes tasks in docs/tasks.json)
0. **Prep** — `git stash push -m "zoom-pan-minimap wip"` (dashboard + README line + 0.5.0 bumps); branch `dev/svelte-dashboard`; write `docs/tasks.json` for this plan + copy dashboard to `docs/`.
1. **Scaffold** — `dashboard/` with Vite, Svelte 5, TS, Vitest, Playwright, ESLint/Prettier, svelte-check; freeze `tests/legacy/…v0.4.0.html`; root `CLAUDE.md` with commands (`npm run dev|build|test|test:e2e|check`).
2. **Regression suite on legacy** — fixtures, harness, all specs above + baseline screenshots, green on `legacy` project. Commit before touching app code.
3. **Port logic** — `src/lib/*` in TS with unit tests (logic lifted from the legacy inline script: `filterTasks`, `buildFilters` ordering, `renderStats` math, timeline bucketing, `renderDepGraph` layering).
4. **Port UI** — Svelte components, styles moved over verbatim first; build into `dashboard/dist/`; iterate until the `svelte` project passes every regression spec and screenshot.
5. **Cut over** — switch build output to `plugin/templates/`; CI workflow (check, lint, unit+coverage, build-freshness diff, e2e both projects, version-consistency check plugin.json ↔ marketplace.json); bump to 0.5.0; README "Development" section; once stable, re-baseline screenshots from `svelte` and retire the `legacy` project (keep the frozen file for reference).
6. **Zoom/pan/minimap, test-first** — e2e specs from the earlier manual run (big graph opens ≥60% centered on in-progress task; small graph 100% centered; drag pans without opening details; click opens details; Ctrl/⌘+wheel zooms at cursor; +/−/fit/1:1 and keys; minimap click/drag moves view and hides when all visible; view persists across reload, resets on filter change) + `view.ts` unit tests → implement as `DepGraph` + `GraphControls` + `Minimap`, porting logic from the stash; bump to 0.6.0; drop the stash.

## Verification
- `cd dashboard && npm run check && npm test && npm run build && npx playwright test` — both projects green (phases 2–5), then svelte-only.
- `git diff --exit-code plugin/templates/tasks-dashboard.html` after build (artifact fresh).
- Manual smoke: `cd docs && python3 -m http.server 8000`, open the dogfood dashboard while `/atm:loop-tasks` runs; `/atm:update-dashboard` in a scratch project upgrades from 0.4.0 → new version.
