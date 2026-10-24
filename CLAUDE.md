# Agentic Task Manager — development

This repo is a Claude Code plugin marketplace (`.claude-plugin/marketplace.json`) containing one plugin, `atm`, in `plugin/`.
Only `plugin/` is shipped to users. `plugin/CLAUDE.md` is the plugin's own context file — don't put dev notes there.

## Layout
- `plugin/skills/*/SKILL.md` — the `/atm:*` skills
- `plugin/templates/tasks-dashboard.html` — the dashboard that skills copy into user projects
- `plugin/scripts/atm` — atm-cli, the `atm` command the skills call (launcher for `atm.py`, see below)
- `atm-cli/` — atm-cli's source modules and the build that writes `plugin/scripts/atm.py` (dev only, not shipped)
- `dashboard/` — Svelte 5 + TypeScript source for the dashboard (dev only, not shipped)
- `tests/scripts/` — tests for atm-cli (dev only)
- `.agentic-task-manager/tasks.json` — this repo's own task list; we dogfood atm here (`/atm:serve` shows it)
- `docs/` — requirements, designs and plans the tasks were created from

## Dashboard (`dashboard/`)
Builds to a **single self-contained HTML file** (vite-plugin-singlefile). The `atm-dashboard-version` meta tag is
injected from `plugin/.claude-plugin/plugin.json` at build time; never edit it by hand.

`npm run build` writes `plugin/templates/tasks-dashboard.html` — a **committed build artifact**, never edit it by hand.
The pre-commit hook in `.githooks/` rebuilds and stages it when dashboard sources are committed (enabled by
`npm install` in `dashboard/`, which sets `core.hooksPath`); CI fails if the committed file is stale.
The pre-port dashboard is frozen at `dashboard/tests/legacy/tasks-dashboard.v0.4.0.html` (see `docs/svelte-migration-plan.md`).

Commands (run in `dashboard/`):
- `npm run dev` — Vite dev server; it serves this repo's `.agentic-task-manager/` data, or another folder's with
  `ATM_DEV_DATA=<path to .agentic-task-manager> npm run dev` (`build/dev-data.ts`)
- `npm run build` — single-file build
- `npm test` / `npm run test:coverage` — Vitest unit tests (`tests/unit/`, 90% line threshold on `src/lib`)
- `npm run test:e2e` — build, then the Playwright e2e suite
- `npm run check` — svelte-check, ESLint, Prettier
- `npm run build:cli` — build `plugin/scripts/atm.py` from `atm-cli/` (see below)
- `npm run test:scripts` — atm-cli's test suite (see below)
- `npm run verify` — everything above; run before committing

## atm-cli (`atm-cli/`, built into `plugin/scripts/`)
atm-cli is the `atm` command the skills run (earlier docs call it "the helper"). `plugin/scripts/atm` is a POSIX sh
launcher that runs `atm.py` with Python 3.9+ (or explains that Python is needed). atm-cli uses the **standard library
only** and must stay compatible with Python 3.9, the version macOS's Command Line Tools ship. Python is the plugin's
one runtime requirement; why there is a single implementation is in `docs/helper-runtime-proposal.md`.

**Edit the modules in `atm-cli/atm/`, never `plugin/scripts/atm.py`.** That file is a **committed build artifact**:
`atm-cli/build.py` concatenates the modules in dependency order (its `MODULES` list; a module imports only from
earlier ones, and no two modules may define the same top-level name). The pre-commit hook rebuilds it when `atm-cli/`
changes, and CI fails if it is stale. Design: `docs/v4/atm-cli.md`.

Tests (`tests/scripts/`, run with `node tests/scripts/run.mjs` or `npm run test:scripts`) drive the built atm-cli
through the launcher, exactly as users run it. Prefer data-driven scenarios in `tests/scripts/scenarios/*.json` (format at the top of
`scenarios.test.mjs`); use `*.test.mjs` with `helpers.mjs` for things scenarios can't express (servers, concurrency,
git merges). CI runs the suite with Python 3.9 and a current version.

## Testing conventions
- e2e specs import `test`/`expect` from `tests/e2e/helpers.ts`. `tasks.json` is never served from disk: use the
  `tasksServer` fixture (`openDashboard(page, tasksServer, 'standard')` or an inline object) — it can also swap the
  response or return an error. Any non-localhost request fails the test.
- Fixtures live in `tests/fixtures/*.json`.
- Unit tests for `src/lib/x.ts` are `tests/unit/x.test.ts`; component tests are `tests/unit/Name.component.test.ts`.
  The suffix matters: macOS file systems are case-insensitive, so `Filters.test.ts` would overwrite `filters.test.ts`.
- Component tests share the `dashboard` state singleton; reset it with `loadIntoDashboard()` from
  `tests/unit/components.helpers.ts`.
- Specs run against the build (`plugin/templates/tasks-dashboard.html`). They rely on stable DOM hooks (ids,
  `.filter-btn[data-filter]`, `.task-card[data-id]`, `#detail-overlay.open`, …) that date from the pre-Svelte
  dashboard, which was the parity oracle during the port and is kept, unused, at `tests/legacy/`.
- Screenshot baselines are strict and per platform: `-darwin.png` locally, `-linux.png` in CI (pinned Playwright
  container). After an intended UI change: `npx playwright test visual --update-snapshots`, delete the matching
  `-linux.png` files, push; CI generates the missing Linux baselines as an artifact and fails until you commit them
  (or run `npm run test:e2e:linux-snapshots` with Docker running).

## Versions
`plugin/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` versions must match. Bump both when the
dashboard or skills change so `/atm:update-dashboard` detects the new dashboard.
