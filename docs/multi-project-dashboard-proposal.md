# One dashboard for all projects: proposal

**Status:** proposal, revised after the first review (decisions in §7) · **Date:** 2026-10-25 · **Context:** today each project runs its own
`atm serve` and keeps its own copy of the dashboard; the request is one dashboard, updated with the plugin, that
shows every project, with a project selector and an overview of all projects.

## 1. Today

- Each project has a copy of the dashboard in `.agentic-task-manager/tasks-dashboard.html` (gitignored). `atm migrate`,
  which every skill runs first, copies the plugin's build there when it is missing or older. `/atm:update-dashboard`
  does the same and shows What's new.
- `atm serve` starts one detached server per project (`.server.json` in the task folder), on the first free port from
  8000. It serves only that folder: the dashboard, `tasks.json`, `claims.json` and `tasks-archive.json`.
- The dashboard fetches those files relative to itself (`./tasks.json`, `dashboard/src/lib/load.ts`). Saved views are
  already kept per project, keyed by `meta.id` (`view-store.ts`), and theme, mode and auto-refresh are per browser.

The costs are what the request names:
- **Updates per project.** A plugin update reaches a project only when a skill runs there or someone runs
  `/atm:update-dashboard` in it.
- **A tab and a port per project.** Five projects mean five servers on 8000–8004, and five tabs. A port is a different
  origin, so each tab also has its own theme and preferences.
- **No overview.** Nothing shows all projects at once.

## 2. The proposal in one paragraph

atm keeps a **registry of projects** in the user's home folder, filled automatically whenever atm runs in a project.
**One server per user** (not per project) serves the dashboard **straight from the installed plugin** and each
registered project's files under its own path. The dashboard gets a **project selector** next to the title and an
**All projects** overview: one card per project with its progress and what needs attention, and the project's own
dashboard one click away. Updating the plugin updates the dashboard everywhere; there is nothing to copy.

## 3. Design

### 3.1 The project registry

- **Where:** `~/.agentic-task-manager/projects.json`, the same folder name as in projects. `ATM_HOME` overrides it
  (tests need this). It holds only paths and names, never task data.
- **One lock for the registry, not one per project.** atm's lock is per directory: `locked(dir)` takes `<dir>/.lock`,
  and each project's `tasks.json` is guarded by `.agentic-task-manager/.lock` in that project. The registry is guarded
  by `~/.agentic-task-manager/.lock`, which every project's atm shares. Two agents in different projects that both
  register therefore wait for each other, and each writes the whole file atomically (temp file, then rename), so a
  reader never sees half a file. The project locks aren't involved: an agent holds the registry lock only for the
  moment it takes to rewrite `projects.json`, and never while holding a project's lock, so the two can't deadlock.
- **After a crash, nothing to do by hand.** The registry reuses atm's existing lock and write, which already recover:
  - *A crash while holding the lock.* The lock is a directory with `owner.json` (host, pid, time). The next atm that
    wants it sees the owner's process is gone and breaks the lock at once. If it can't tell (another host, for example
    a home folder on a network drive), it breaks a lock older than 60 seconds. Commands hold it for milliseconds, so
    an older one is abandoned.
  - *A crash while writing.* The new content goes to a temporary file that replaces `projects.json` only when complete
    (rename), so the old file stays intact. At worst a stray `projects.json.<pid>.<random>.tmp` is left, which atm
    ignores.
  - *A damaged or deleted registry anyway* (edited by hand, disk trouble). atm moves the unreadable file aside
    (`projects.json.damaged-<time>`), starts an empty one, and says so in `atm projects`. Projects add themselves back
    the next time atm runs in them, and `atm projects add` adds the others.
  - *The hook never waits.* Registering from the PostToolUse hook tries the lock once and skips it if the lock is
    taken (it registers on a later call), so a stuck lock can't slow down your tool calls.
- **Entry:** `{ "id": meta.id, "name": meta.project, "path": "<project root>", "added_at", "seen_at" }`, keyed by
  path.
- **The main worktree only.** In a linked git worktree, atm registers the repository's main worktree (the folder of
  `git rev-parse --git-common-dir`), not the linked one, so worktrees don't show up as duplicate projects. Support for
  several worktrees is a later phase (3.6).
- **Filled automatically.** `atm init`, `atm migrate` and `atm serve` register the project they run in. The plugin's
  PostToolUse hook (today `atm heartbeat --auto`) also registers the current project when it isn't listed yet. That
  costs one small file read per tool call, the same as the heartbeat check, and catches projects where only `atm`
  commands run. `seen_at` is updated at most once a day, so the registry isn't rewritten constantly.
- **By hand:** `atm projects` lists them (`--json`); `atm projects add [PATH]`, `atm projects remove <id|PATH>`,
  `atm projects prune` (drops entries whose folder or `tasks.json` is gone). A project can opt out with
  `meta.dashboard: { "listed": false }` (for example a scratch or client project you don't want shown).
- **Missing folders** (a deleted clone or an unmounted disk) stay in the registry, shown as "not found" in the
  overview with a Remove button, until pruned.

### 3.2 One server per user

- `atm serve` starts (or reuses) **one** server for the user, recorded in `~/.agentic-task-manager/server.json`
  (pid, port, plugin version, build ID, started_at). It tries port **8765** first, which is less likely than 8000 to
  be taken by another local server, so the URL usually stays the same; if 8765 is busy it takes the next free port, as
  today. `atm serve --open` opens it, whatever port it got.
- **Routes:**

  | Path | What |
  |---|---|
  | `/` | the dashboard (from the plugin, see 3.3) |
  | `/api/projects` | the registry with a summary per project (3.5), with an ETag |
  | `/p/<id>/tasks.json`, `claims.json`, `tasks-archive.json` | that project's files, as today (ETag and 304) |
  | `/__atm/whoami` | `{atm, pid, version, build}`, as today plus the version |

  Only those three file names are served from a project folder, and only for registered projects. There is no
  directory listing and no other path. This is narrower than today's server, which serves anything in the task folder.
- **Safety:** it binds to 127.0.0.1 only, as today. New: it refuses requests whose `Host` header isn't
  `localhost:<port>` or `127.0.0.1:<port>`. A local server that serves many projects is worth protecting from DNS
  rebinding, where a web page you visit points its own domain at 127.0.0.1 and reads the responses. It sends no CORS
  headers.
- **Per-project URLs** use the hash, like the tabs: `/#project=<id>&view=kanban`. `atm serve` in a project opens
  (`--open`) or prints that project's URL; `atm serve --all` prints the overview's.
- `atm serve stop` stops the user's server. `--dir` keeps working: it registers that project and prints its URL.

### 3.3 The dashboard comes from the plugin

- The server reads `plugin/templates/tasks-dashboard.html` from **its own plugin folder** at start and keeps it in
  memory. Each plugin version has its own folder (`~/.claude/plugins/cache/<marketplace>/atm/<version>/`), and Claude
  Code deletes an old version's folder 14 days after an update, so a long-running server must not read it again later.
- **After a plugin update, the running server is still the old one, and Claude Code has no hook for "plugin
  updated".** Its documented hook events (code.claude.com/docs/en/hooks) include none for installing, updating or
  reloading a plugin. `Setup` runs only with `claude --init`/`--maintenance`, and the docs don't say that
  `/reload-plugins` fires anything. What the public API does offer:
  - **`SessionStart`** runs on a new session, `--resume`/`/resume`, `/clear` and compaction. The plugin adds a
    SessionStart hook, `"${CLAUDE_PLUGIN_ROOT}/bin/atm" serve --refresh`. It reads `~/.agentic-task-manager/server.json`
    and, if a server runs with an older version or build than this plugin's, restarts it on the same port. Otherwise it
    does nothing; it never starts a server that isn't running.
  - **Hooks switch to the new version on `/reload-plugins`**: hooks keep the old plugin path mid-session until
    reloaded. So after `/plugin marketplace update` and `/reload-plugins`, the next tool call's PostToolUse hook
    (already there for claim heartbeats) runs the new atm, which makes the same cheap check (one small file read) and
    restarts the server.
  - **Any `atm` command** the new skills run does the same check, as a backstop.

  So the update is still one step for you, updating the plugin, and the server follows within a tool call or at the
  next session, whichever comes first.
- **What refreshing the browser gets you.** The page always comes from the running server, so a refresh shows the
  new dashboard **once the server has restarted**, and the old one until then. The restart needs Claude Code to run
  one of atm's hooks or commands after the update:
  - the usual way, `/plugin marketplace update` then `/reload-plugins`, followed by **any tool call** in that session
    (it doesn't need to be a skill or an atm command), or
  - starting, resuming, clearing or compacting a session (SessionStart), or
  - `/atm:serve` (or `atm serve --refresh`) when you want it right away.

  If you update the plugin and only refresh the browser, with no tool call in between, you still get the old
  dashboard. The server can't notice the update by itself through anything public: the only signal is a new version
  folder in Claude Code's plugin cache, whose layout is internal and may change. Watching it was considered and
  rejected for that reason. Open tabs notice the restart: `/__atm/whoami` reports a new build, and the
  dashboard shows "A new version of the dashboard is ready: Reload" instead of reloading under you. What's new opens on
  first use, as it does now.
- **Not the plugin's data folder for the registry.** Claude Code offers a per-plugin folder that survives updates
  (`${CLAUDE_PLUGIN_DATA}`, `~/.claude/plugins/data/<id>/`), but the docs say it isn't set for commands Claude runs
  through the Bash tool, which is how skills run `atm`. So the registry and `server.json` live in
  `~/.agentic-task-manager/` (or `ATM_HOME`), where both hooks and skills find them.
- **Per-project copies go away.** `atm migrate` stops installing `tasks-dashboard.html` into projects.
- **`atm migrate` stays**, because every skill runs it first and it has jobs besides the dashboard. After this change
  it:
  - moves a legacy `docs/tasks.json` (or a root `tasks.json`) into `.agentic-task-manager/`, as today;
  - keeps `.agentic-task-manager/.gitignore` and the merge driver set up, and gives the archive hint, as today;
  - registers the project (3.1);
  - cleans up after per-project dashboards, once per project: it deletes the project's dashboard copy (gitignored, so
    nothing changes in git), stops that project's old per-project server (from its `.server.json`, only if `whoami`
    confirms it is that folder's server, as `atm serve stop` does today), and removes the record. Projects you no
    longer open keep their copies until atm next runs in them, which costs only a few hundred KB.
- **`/atm:update-dashboard` is removed** in this release, with no transition. Nothing is left for it to do: the server
  serves the plugin's dashboard, `atm migrate` (run by every skill) does the cleanup, and What's new is in the
  dashboard. The skill comes with the plugin, so it disappears when the plugin is updated, and nobody can run an old
  copy against the new layout. The README and Help say "update the plugin" instead.
- **No single-project mode.** The dashboard always talks to the atm server's API (`/api/projects`, `/p/<id>/...`);
  opening `tasks-dashboard.html` some other way (for example `python3 -m http.server` in the task folder) is no longer
  supported. The dev server (`build/dev-data.ts`) and the e2e `tasksServer` fixture serve the same API instead of
  `./tasks.json`: one project by default, several when a test asks for it. That leaves one way to load data, not two.

### 3.4 The dashboard: project selector

- The title becomes a button, **project name ▾**, opening a list of registered projects. Each row shows the name, a
  small progress bar, and a dot when something needs you (in review, or blocked on you). An **All projects** entry at
  the top opens the overview. It is keyboard-navigable and type-to-filter, the same listbox pattern as the theme combo
  box (T-163).
- Switching projects loads that project's files. Its saved view (filters, tab, graph zoom) is restored, as it is per
  `meta.id` today. Theme, mode and auto-refresh now apply to all projects, because they share one origin.
- The header's attention count ("2 need you") becomes **this project's count**, with a separate small badge on the
  selector for the **other projects'** total, so a question waiting in another project isn't missed.
- Auto-refresh polls only the open project's files, plus `/api/projects` for the selector's dots. Both are conditional
  requests (304 when nothing changed), so polling stays cheap.

### 3.5 The dashboard: All projects overview

One card per project, in a responsive grid:

| On the card | From |
|---|---|
| Name, and the path on hover | registry |
| Progress bar and "120 / 164 · 3 skipped" | done / (total − skipped), as T-162 defines it |
| Current phase (lowest unfinished) and its progress | tasks |
| Agents working now ("2 agents") | claims |
| Needs you: in review, blocked on you, with counts | status kinds, `waiting_on` |
| Last activity ("12 min ago") | the newest timestamp |
| A 14-day sparkline of completions | completion times |

- **Order:** projects that need you first, then by last activity. A toggle **Active only** (on by default) hides
  projects with no activity in the last N days (14 by default) and no open work. This is the same idea as the Progress
  tab's "Active phases only".
- **Click a card** to open that project. Clicking its "Needs you" opens that project's Kanban, filtered to review and
  blocked.
- **The summaries are computed by the server, not the browser.** With 20 projects, the browser would otherwise fetch
  and parse 20 task files every few seconds. The server builds each card's numbers with atm-cli's own `status` logic
  (`query.py`), so there is still one implementation of what counts as done, ready or blocked. It caches each summary
  until that `tasks.json`'s size or mtime changes.
- **Landing page** (`/` with no `#project=`):
  - **two or more projects:** the overview;
  - **one project:** that project's dashboard (the overview is still in the selector);
  - **none:** a short page on how to add one: run `/atm:create-tasks` in a project (which registers it), or
    `atm projects add <path>` for a project that already has tasks.

### 3.6 Git worktrees and several clones of one project

**How it works today.** Running agents in parallel (README, `docs/parallel-agents-design.md`) means one git worktree
and branch per agent. What is shared and what isn't:

| | Shared across worktrees? |
|---|---|
| `tasks.json` | **No.** It is committed, so each worktree has its branch's copy. An agent's status changes reach the others only when branches merge (atm's merge driver merges them task by task). |
| Claims (who works on what) | **Yes.** The claims store is in the git common directory (`.git/atm/claims.json`), so no two agents take the same task. |
| `claims.json` snapshot (what the dashboard reads) | **No.** atm writes it into the task folder of the worktree where the command ran. |
| Dashboard and server | **No.** One per task folder, so one per worktree, each on its own port. |

So the dashboard has **no multi-worktree view today**. The main worktree's dashboard shows that branch's tasks, and
claims only from atm commands run in that worktree, so agents working in other worktrees are invisible to it until
their branches merge. To watch them you'd run `atm serve` in each worktree and open a tab each. It is a missing
feature, not something this change breaks.

**Proposal: not in this phase.** This change registers only the main worktree (3.1), so the dashboard shows exactly
what the main worktree's dashboard shows today. A later task (phase 16) adds worktree support: list a project's
worktrees with `git worktree list`, write the claims snapshot where every worktree's dashboard can see it, and let
the project page switch between worktrees, or show all of them on one Kanban with a branch chip on each card.

## 4. What changes where

| Area | Change |
|---|---|
| atm-cli | `registry.py` (registry under `~/.agentic-task-manager/` with its own lock, main worktree only, `atm projects`); `server.py` becomes per user (port 8765 first; routes, the Host check, summaries, `serve --refresh`); `migrate.py` stops copying the dashboard, registers the project, and cleans up per-project copies and servers; the PostToolUse hook registers projects and checks the server version |
| Plugin | a SessionStart hook in `plugin/hooks/hooks.json` (`atm serve --refresh`); `plugin/skills/update-dashboard/` deleted; `templates/tasks-dashboard.html` is no longer copied into projects |
| Dashboard | data from the API only (`load.ts`: `/api/projects`, `/p/<id>/...`; no `./tasks.json`); hash routing for `project=`; the landing page rule; a project selector; the overview (new components, reusing `Ring`/progress bars and the activity sparkline); a "new version ready" notice; `build/dev-data.ts` serves the API |
| Skills | `/atm:serve` (one server, prints the project URL, `--all`, `--open`); create-tasks registers the project; mentions of `/atm:update-dashboard` replaced by "update the plugin" |
| Docs | README (one dashboard for all projects, updating, the registry and what the server exposes), `docs/help.md` (selector, overview), `plugin/CLAUDE.md`, the root `CLAUDE.md` (dev server and test fixture serve the API) |
| Tests | atm-cli: registry scenarios (`ATM_HOME` in a temp folder, concurrent registration, a linked worktree registers the main one), server tests (routes, only the three files of registered projects, the Host check, `--refresh` restarting an older server and leaving a current one, migrating from a per-project server). Dashboard: the e2e `tasksServer` fixture serves the API (one project by default, several on request); unit tests for routing and the landing rule; e2e for the selector, the overview and the "new version" notice; screenshots of both in both modes |
| Size | the overview and selector add a few KB to the ~262 KB build, within the 320 KiB budget |

## 5. Plan

This becomes **phase 15**. The tasks now in phase 15 (T-156 to T-164) move to **phase 16**, along with the later
worktree support (3.6).

1. **API format first:** `/api/projects` and `/p/<id>/...`, written down in
   [`docs/multi-project-api.md`](multi-project-api.md) so the atm-cli and dashboard work can go in parallel.
2. **Registry** (atm-cli): `atm projects`; registration from init, migrate, serve and the hook.
3. **User server** (atm-cli): routes, the Host check, summaries, `serve --refresh`, the SessionStart hook, and taking
   over from per-project servers.
4. **Dashboard:** the API data source with the dev server and the test fixture, then routing and the landing page,
   then the selector, then the overview, then the "new version" notice.
5. **Skills and docs:** `/atm:serve`, `atm migrate` cleans up, `/atm:update-dashboard` removed, README and Help.
6. **Release** as 0.15.0. It changes how everyone opens the dashboard, so the What's new entry says so plainly.

Steps 2–3 and 4 can run in parallel after step 1. The dashboard and the server ship together: the new dashboard
needs the API, and the old per-project servers can't serve it.

## 6. Not in scope

- Projects on other machines, or a shared team dashboard (it stays local, with no accounts).
- Changing tasks from the dashboard (it stays read-only; agents and people use atm).
- Starting agents from the overview.

## 7. Decisions (review, 2026-10-25)

1. **Landing page:** the overview with two or more projects, the project itself with one, and how to add a project
   with none (3.5).
2. **Registration:** automatic, with an opt-out (3.1).
3. **Worktrees:** not in this phase. Only the main worktree is registered; worktree support is a phase 16 task (3.6).
4. **`/atm:update-dashboard`:** removed in this release, with no transition (3.3).
5. **Port:** 8765 first, then the next free port; `atm serve --open` opens it (3.2).
6. **No single-project mode:** the dashboard always uses the server's API (3.3).
7. **Server updates:** no plugin-update hook exists, so a SessionStart hook plus the version check in atm (hook and
   commands) restart an outdated server (3.3).
