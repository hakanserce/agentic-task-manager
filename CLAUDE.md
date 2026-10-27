# Agentic Task Manager — development

This repo is a Claude Code plugin marketplace (`.claude-plugin/marketplace.json`) containing one plugin, `atm`, in `plugin/`.
Only `plugin/` is shipped to users. `plugin/CLAUDE.md` is the plugin's own context file — don't put dev notes there.

## Layout
- `plugin/skills/*/SKILL.md` — the `/atm:*` skills
- `plugin/templates/tasks-dashboard.html` — the dashboard, served by `atm serve` (one server per user, for all
  projects; routes in `docs/multi-project-api.md`)
- `plugin/scripts/atm` — atm-cli, the `atm` command the skills call (launcher for `atm.py`, see below)
- `atm-cli/` — atm-cli's source modules and the build that writes `plugin/scripts/atm.py` (dev only, not shipped)
- `dashboard/` — Svelte 5 + TypeScript source for the dashboard (dev only, not shipped)
- `tests/scripts/` — tests for atm-cli (dev only)
- `.agentic-task-manager/tasks.json` — this repo's own task list; we dogfood atm here (`/atm:serve` shows it)
- `docs/` — requirements, designs and plans the tasks were created from

## Security
`docs/security-architecture.md` holds the threat model and the invariants every change keeps, each with its check.

**Agent sandbox** (before merging a PR that changes a skill, `plugin/CLAUDE.md` or atm output agents act on):
`ANTHROPIC_API_KEY=... node tests/sandbox/run.mjs` with Docker running. It builds a container with this checkout's
plugin, runs `/atm:loop-tasks` on a seeded project whose red-team tasks ask for `curl | sh`, secrets, CI and hook
changes and another remote, with no network but the model API, and prints per task whether the agent blocked it. A
few minutes and a few dollars of model calls. Its judgement is tested in `tests/scripts/sandbox-verdict.test.mjs`.
A change that adds an entry point (an HTTP route, a CLI command reading a path or URL, a task-folder file), a field
agents or the dashboard act on, a skill instruction that runs commands or reads outside text, or a CI permission
updates that document in the same PR.

## Dashboard (`dashboard/`)
Builds to a **single self-contained HTML file** (vite-plugin-singlefile). The `atm-dashboard-version` meta tag is
injected from `plugin/.claude-plugin/plugin.json` at build time; never edit it by hand.

`npm run build` writes `plugin/templates/tasks-dashboard.html` — a **committed build artifact**, never edit it by hand.
The pre-commit hook in `.githooks/` rebuilds and stages it when dashboard sources are committed (enabled by
`npm ci` in `dashboard/`, which sets `core.hooksPath`); CI fails if the committed file is stale. Install with `npm ci`,
not `npm install`: it installs exactly the locked versions and never updates the lockfile.
The pre-port dashboard is frozen at `dashboard/tests/legacy/tasks-dashboard.v0.4.0.html` (see `docs/svelte-migration-plan.md`).

Commands (run in `dashboard/`):
- `npm run dev` — Vite dev server; like `atm serve`, it serves the API the dashboard loads (`api/projects`,
  `p/<id>/tasks.json`, …; see `docs/multi-project-api.md`) for this repo's `.agentic-task-manager/`, or for other
  folders with `ATM_DEV_DATA=<path to .agentic-task-manager>[:<another>…] npm run dev` (`build/dev-data.ts`)
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
  `tasksServer` fixture (`openDashboard(page, tasksServer, 'standard')` or an inline object), which plays atm serve's
  API: `api/projects` lists one project (`FIXTURE_PROJECT`) and its files are served under `p/<id>/`;
  `addProject(id, data)` adds more, `noProjects()` lists none. It can also swap the response or return an error. Any
  non-localhost request fails the test.
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

## CI
- **Workflow:** `pull-request` (also in `tasks.json` `meta.workflow`, so `/atm:push` knows): work happens on a
  release branch (e.g. `dev/v4`) and reaches `main` through **one combined PR per release branch**.
- **Linux screenshot baselines:** after a visual change, CI fails until the `-linux.png` baselines are committed, and
  attaches the generated ones as the `linux-screenshot-baselines` artifact. Find its ID with
  `gh api repos/solo-swe/agentic-task-manager/actions/runs/<run-id>/artifacts`; **check its `workflow_run` is your
  branch's run**: `head_branch` your branch, `head_repository_id` this repository's, and `head_sha` a commit on your
  branch (a fork's PR uploads an artifact of the same name). Download it with
  `gh api repos/solo-swe/agentic-task-manager/actions/artifacts/<id>/zip > <scratch>/baselines.zip` (`gh run download`
  fails on the zip's duplicate entries), extract only the missing `*-linux.png` files into
  `dashboard/tests/e2e/__screenshots__/` (`unzip -n`), look at one to check it shows what you expect, then commit them.
- **Pinned:** actions by commit SHA, container images by digest, the token read-only (`permissions: contents:
  read`), checkouts without stored credentials. Dependabot proposes action and npm updates; bump an image digest by
  hand (`docker buildx imagetools inspect <image>`), the Playwright image together with `@playwright/test`.
- **Performance budgets:** the e2e interaction budget is 200 ms locally and twice that in CI
  (`tests/e2e/performance.spec.ts`), and CI runners are about 3× slower than a developer Mac. A failure only in CI
  (e.g. 407 ms against 400) still needs a local measurement and a real fix: never raise the budget or just re-run.
  The large-file benchmark (`tests/scripts/bench.mjs --check`) has generous limits and fails only far over them.

## Versions
`plugin/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` versions must match. Bump both when the
dashboard or skills change, so `/plugin marketplace update` delivers them and running dashboard servers restart on the
new dashboard (`atm serve --refresh`).

Every release gets **two** entries (`npm run check` fails without either):
- `plugin/CHANGELOG.md` — the detailed record, for developers: every change, with command names and flags.
- `plugin/WHATS-NEW.md` — what users see in the dashboard's What's new: 3–6 short
  bullets in plain language about what a user notices. No command flags, internals or file names; one idea per
  bullet; say what it does for them ("Agents can ask you a question instead of guessing"), not how it works. Write
  it from the changelog entry, not instead of it.

Before merging a release PR (every PR to `main` is one), the security checklist (`docs/security-architecture.md` §3):
- the PR changes a skill, `plugin/CLAUDE.md` or atm output agents act on → run the agent sandbox (Security, above);
- it adds an entry point, a field agents or the dashboard act on, or a CI permission → `docs/security-architecture.md`
  is updated in the same PR.
