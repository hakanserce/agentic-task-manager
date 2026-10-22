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

Migration in progress (see `docs/svelte-migration-plan.md`): until cutover (T-023) the build writes to
`dashboard/dist/`, and `plugin/templates/tasks-dashboard.html` is still the hand-written legacy file. After cutover it
becomes a committed build artifact: rebuild it whenever `dashboard/` changes; CI fails if it is stale.

Commands (run in `dashboard/`):
- `npm run dev` — Vite dev server
- `npm run build` — single-file build
- `npm test` / `npm run test:coverage` — Vitest unit tests (`tests/unit/`, 90% line threshold on `src/lib`)
- `npm run test:e2e` — build, then the Playwright regression suite against both projects
- `npm run test:e2e:legacy` / `npm run test:e2e:svelte` — one project only
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
- The same specs run against two Playwright projects: `legacy` (frozen `tests/legacy/tasks-dashboard.v0.4.0.html`) and
  `svelte` (the build). The port must keep the legacy DOM hooks the specs use (ids, `.filter-btn[data-filter]`,
  `.task-card[data-id]`, `#detail-overlay.open`, …). Fix the port, don't loosen the spec; document intentional
  differences in the spec itself.
- Screenshot baselines are shared between projects (no project name in the snapshot path) and are per-platform.

## Versions
`plugin/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` versions must match. Bump both when the
dashboard or skills change so `/atm:update-dashboard` detects the new dashboard.
