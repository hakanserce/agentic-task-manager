# Agentic Task Manager — development

This repo is a Claude Code plugin marketplace (`.claude-plugin/marketplace.json`) containing one plugin, `atm`, in `plugin/`.
Only `plugin/` is shipped to users. `plugin/CLAUDE.md` is the plugin's own context file — don't put dev notes there.

## Layout
- `plugin/skills/*/SKILL.md` — the `/atm:*` skills
- `plugin/templates/tasks-dashboard.html` — the dashboard that skills copy into user projects
- `dashboard/` — Svelte 5 + TypeScript source for the dashboard (dev only, not shipped)
- `docs/` — this repo's own task list (`tasks.json`) and migration plan; we dogfood atm here

## Dashboard (`dashboard/`)
Builds to a **single self-contained HTML file** (vite-plugin-singlefile). The `atm-dashboard-version` meta tag is
injected from `plugin/.claude-plugin/plugin.json` at build time; never edit it by hand.

`npm run build` writes `plugin/templates/tasks-dashboard.html` — a **committed build artifact**, never edit it by hand.
The pre-commit hook in `.githooks/` rebuilds and stages it when dashboard sources are committed (enabled by
`npm install` in `dashboard/`, which sets `core.hooksPath`); CI fails if the committed file is stale.
The pre-port dashboard is frozen at `dashboard/tests/legacy/tasks-dashboard.v0.4.0.html` (see `docs/svelte-migration-plan.md`).

Commands (run in `dashboard/`):
- `npm run dev` — Vite dev server
- `npm run build` — single-file build
- `npm test` / `npm run test:coverage` — Vitest unit tests (`tests/unit/`, 90% line threshold on `src/lib`)
- `npm run test:e2e` — build, then the Playwright e2e suite
- `npm run check` — svelte-check, ESLint, Prettier
- `npm run verify` — everything above; run before committing

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
