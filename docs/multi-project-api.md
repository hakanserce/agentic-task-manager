# The multi-project server: routes and formats

**Status:** agreed format for phase 15 (T-165) · **Design:** [the proposal](multi-project-dashboard-proposal.md)

One `atm serve` per user serves the dashboard and every registered project. This page fixes what the server answers
and what it stores, so atm-cli (the registry and the server) and the dashboard (which reads them) can be built in
parallel. The e2e `tasksServer` fixture and the dev server (`dashboard/build/dev-data.ts`) implement the same routes.

## 1. Rules for every request

- The server binds to `127.0.0.1` only.
- **Host check.** A request whose `Host` header isn't `localhost:<port>` or `127.0.0.1:<port>` (the server's own port)
  gets `403` with `{"error": "unexpected Host header"}`, whatever the path. This blocks DNS rebinding.
- Only `GET` and `HEAD`. Anything else gets `405`.
- Every response has `Cache-Control: no-store`, except a project's logo (§2.3). No CORS headers are sent.
- Error responses are JSON, `{"error": "<what went wrong>"}`, with `Content-Type: application/json`.
- **Conditional requests.** Responses marked *ETag* below carry a strong `ETag`. A request with a matching
  `If-None-Match` gets `304` with no body. The dashboard always sends the last ETag it got.

## 2. Routes

| Route | Answer | ETag |
|---|---|---|
| `GET /` | the dashboard (`text/html`), from the plugin, held in memory since the server started | no |
| `GET /api/projects` | the registered projects with their summaries (§3) | yes |
| `GET /p/<id>/tasks.json` | that project's `.agentic-task-manager/tasks.json`, as stored | yes |
| `GET /p/<id>/claims.json` | that project's live claims, from every worktree (§2.1) | yes |
| `GET /p/<id>/tasks-archive.json` | that project's archive, as stored | yes |
| `GET /p/<id>/worktrees.json` | that project's git worktrees and their changed tasks (§2.2) | yes |
| `GET /p/<id>/logo` | that project's logo image (§2.3) | yes |
| `GET /__atm/whoami` | who this server is (§4) | no |
| anything else | `404` | |

- `<id>` is a project id from `/api/projects` (§3.1). An unknown id gets `404` with `{"error": "unknown project"}`.
- Only those names are served for a project: `tasks.json` and `tasks-archive.json` from its
  `.agentic-task-manager/` folder, `claims.json` and `worktrees.json` computed, and `logo`. There is no other file, no directory
  listing, no path segments after the name. A file that doesn't exist (no archive yet, no claims yet) gets `404` with
  `{"error": "not found"}`. The dashboard treats a missing archive, claims or worktrees as empty.
- A missing project (§3.1 `missing: true`) answers `404` for its files.
- The ETag of a project file is its size and nanosecond mtime, as today's `json_etag` (`"<size hex>-<mtime_ns hex>"`).
- Query strings are ignored.

### 2.1 `claims.json`: claims from every worktree

The claims of all a clone's worktrees are in one store, in the git common directory (`.git/atm/claims.json`; outside
git, `claims-store.json` in the task folder). The server answers from it, as `{generated_at, claims: [...]}` sorted by
task, so an agent at work in a linked worktree shows on the project's board. Its ETag is the store's size and mtime.
Without a store yet, the server falls back to the task folder's own snapshot (`claims.json`, which atm writes there).

### 2.2 `worktrees.json`: the project's git worktrees

```json
{
  "generated_at": "2026-10-26T04:30:00Z",
  "worktrees": [
    { "path": "/Users/me/workplace/agentic-task-manager", "branch": "main", "main": true },
    {
      "path": "/Users/me/workplace/atm-agent-2",
      "branch": "agent-2",
      "main": false,
      "tasks": [{ "id": "T-179", "status": "in_progress", "...": "the task as that worktree's tasks.json has it" }]
    }
  ]
}
```

- The worktrees are those `git worktree list` shows, main first, read from the git directory (`.git/HEAD`,
  `.git/worktrees/*/gitdir` and `HEAD`). A linked worktree whose folder is gone is left out. `branch` is the checked-out
  branch, the short SHA of a detached HEAD, or `null`. Outside git the list is empty.
- Each linked worktree lists the tasks of its own `tasks.json` that differ from the main worktree's copy, or that only
  it has; the main worktree's tasks are `tasks.json` itself.
- The ETag changes when a worktree is added or removed, switches branch, or its `tasks.json` changes.
- The dashboard shows all of them on one board: each task from the worktree where it got furthest (by status kind:
  todo, blocked, active, review, then done or skipped; the main worktree's copy on a tie), with that worktree's branch
  on its card.

### 2.3 `logo`: the project's logo

- **Which file.** `meta.logo` in the project's `tasks.json`: a path relative to the project root, set with
  `atm logo set <path>` (and removed with `atm logo unset`). Without it, the first usable file of `logo.svg`,
  `logo.png`, `.github/logo.*`, `public/favicon.*`, `assets/logo.*` (each `.*` tried as `.svg`, `.png`, `.webp`,
  `.ico`). A `meta.logo` that is unusable means no logo: nothing is searched for then.
- **Usable** means an SVG, PNG, WebP or ICO file (by its extension), inside the project folder once symbolic links are
  followed, and at most 512 KB. `atm logo set` refuses anything else; the server answers `404` with
  `{"error": "no logo"}` for a project without a usable logo.
- `Content-Type` is the image type (`image/svg+xml`, `image/png`, `image/webp`, `image/x-icon`). Unlike the other
  routes it has `Cache-Control: no-cache`: the browser may keep it but asks again, and gets `304` while it is unchanged
  (the ETag is the file's size and mtime). It also has `Content-Security-Policy: default-src 'none';
  style-src 'unsafe-inline'; sandbox` and `X-Content-Type-Options: nosniff`, so an SVG opened on its own never runs a
  script.

## 3. `GET /api/projects`

```json
{
  "generated_at": "2026-10-25T21:51:38Z",
  "projects": [
    {
      "id": "1f3a9c2e",
      "name": "Agentic Task Manager",
      "path": "/Users/me/workplace/agentic-task-manager",
      "missing": false,
      "summary": {
        "total": 183,
        "done": 152,
        "skipped": 3,
        "percent": 84,
        "current_phase": { "id": 15, "name": "One dashboard for all projects", "done": 0, "total": 17 },
        "recent_phases": [
          { "id": 12, "name": "Themes", "done": 10, "total": 10, "percent": 100 },
          { "id": 13, "name": "Agents", "done": 9, "total": 9, "percent": 100 },
          { "id": 14, "name": "Archive", "done": 12, "total": 12, "percent": 100 },
          { "id": 15, "name": "One dashboard for all projects", "done": 0, "total": 17, "percent": 0 }
        ],
        "agents_working": 1,
        "needs_you": { "review": 1, "blocked_on_user": 0 },
        "needs_you_tasks": [{ "id": "T-186", "name": "Update notice: shown when the page is already the new build", "reason": "review" }],
        "last_activity": "2026-10-25T21:51:38Z",
        "completions_14d": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 30, 41, 28]
      },
      "worktrees": [{ "path": "/Users/me/workplace/agentic-task-manager", "branch": "main", "main": true }],
      "logo": "p/1f3a9c2e/logo"
    }
  ]
}
```

The ETag changes when the registry, any listed project's `tasks.json`, claims or logo, or its worktrees change (the
server combines their size/mtime stamps and the worktree lists). Projects are listed in registry order. The dashboard sorts them.

### 3.1 Project fields

| Field | Meaning |
|---|---|
| `id` | the project's `meta.id` (8 hex characters, which `atm init` adds). A registered project without one gets `p` plus the first 7 hex characters of the SHA-1 of its `path`, stable as long as the path is, until `meta.id` is set |
| `name` | `meta.project`, or the folder's name when it has none |
| `path` | the project root (the main worktree's folder) |
| `missing` | `true` when the folder or its `.agentic-task-manager/tasks.json` is gone (or unreadable); the project then has `"summary": null` |
| `summary` | §3.2, or `null` when `missing` |
| `worktrees` | its git worktrees, main first, as in §2.2 without `tasks`; empty when `missing` or outside git |
| `logo` | `p/<id>/logo` (relative to the dashboard) when it has a usable logo (§2.3), else `null`; `null` when `missing` |

### 3.2 Summary fields

Counted from `tasks.json` only (not the archive), by status **kind** (the project's vocabulary), with atm-cli's own
logic (`query.py`):

| Field | Meaning |
|---|---|
| `total` | all tasks |
| `done` | done-kind tasks |
| `skipped` | skipped-kind tasks |
| `percent` | `round(100 × done / (total − skipped))`, an integer. When `total − skipped` is 0 (no tasks, or only skipped ones): `100` if there are skipped tasks, `0` if there are no tasks |
| `current_phase` | the lowest phase with a task that is neither done- nor skipped-kind: `{ id, name, done, total }` within that phase, with `done` and `total` counted as above (skipped tasks left out of `total`). `name` is `null` without a phase name. `null` when every phase is finished |
| `recent_phases` | up to 4 phases for the overview's rings, in phase order: the lowest phases with open work (a task of todo, active, review or blocked kind), then the most recently finished phases (by their latest `completed_at`; phases without one rank last, higher phase first) to fill up to 4. More than 4 open phases: the lowest 4. Each is `{ id, name, done, total, percent }`, counted as for `current_phase`, with `percent` = `round(100 × done / total)`. A phase of only skipped tasks (`total` 0) is never listed. `[]` without tasks |
| `agents_working` | live claims (lease not expired) in the claims store |
| `needs_you.review` | review-kind tasks |
| `needs_you.blocked_on_user` | blocked-kind tasks with `waiting_on: "user"` |
| `needs_you_tasks` | those same tasks, in file order: `{ id, name, reason }`, `reason` being `"review"` or `"blocked"` (on a question for the user). The card's "needs you" chip opens them |
| `last_activity` | the newest of all tasks' `updated_at`, `started_at`, `completed_at`, `review_requested_at`, `blocked_at` and `skipped_at`, and of note times; `null` without any |
| `completions_14d` | 14 integers, oldest first, ending with today: done-kind tasks by the UTC day of `completed_at` (tasks without `completed_at` aren't counted) |

## 4. `GET /__atm/whoami`

```json
{ "atm": true, "pid": 41235, "port": 8765, "version": "0.15.0", "build": "3f9a1c0d" }
```

`version` and `build` are the `atm-dashboard-version` and `atm-dashboard-build` meta tags of the dashboard the server
holds, read from the very bytes it serves at `/`, so a page loaded from it always has the same `build`. atm compares
them with its own plugin's dashboard to decide whether to restart the server (`serve --refresh`): it restarts a server
with an older version, or with the same version but another build of the **same** plugin folder (`plugin_root` in the
record; the dashboard was rebuilt). Another install of the same version (the plugin cache, a development checkout, a
worktree) is left alone, or two installs would restart the server in turn and every open page would offer a reload.
The open dashboard compares `build` with its own to offer a reload.

The old per-project servers (0.10.0–0.14.0) answer `{atm, folder, pid}`. The `folder` key identifies one, which is how
`atm migrate` recognises and stops it.

## 5. Files in `ATM_HOME`

`ATM_HOME` is `~/.agentic-task-manager` unless the environment sets it. Both files are written atomically (temporary
file, then rename) under `ATM_HOME/.lock`, atm's usual lock directory.

### 5.1 `projects.json`, the registry

```json
{
  "version": 1,
  "projects": [
    {
      "id": "1f3a9c2e",
      "name": "Agentic Task Manager",
      "path": "/Users/me/workplace/agentic-task-manager",
      "added_at": "2026-10-25T21:51:38Z",
      "seen_at": "2026-10-25T21:51:38Z"
    }
  ]
}
```

- Keyed by `path`, absolute, the main worktree's folder: one entry per path.
- `id` and `name` are copied from `meta.id` and `meta.project` when atm registers the project, and updated when they
  change. `id` follows §3.1 when `meta.id` is missing.
- `seen_at` is the last time atm ran there, updated at most once a day.
- An unreadable file is renamed to `projects.json.damaged-<UTC time, e.g. 20261025T215138Z>` and replaced by an empty
  registry.

### 5.2 `server.json`, the running server

```json
{
  "pid": 41235,
  "port": 8765,
  "version": "0.15.0",
  "build": "3f9a1c0d",
  "plugin_root": "/Users/me/.claude/plugins/cache/hakanserce-plugins/atm/0.15.0",
  "started_at": "2026-10-25T21:51:38Z"
}
```

Written by the server once it listens, and removed when it stops. A record is trusted only if `whoami` on its port
answers with the same `pid`. Otherwise it is stale and is removed, as today.
