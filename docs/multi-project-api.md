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
- Every response has `Cache-Control: no-store`. No CORS headers are sent.
- Error responses are JSON, `{"error": "<what went wrong>"}`, with `Content-Type: application/json`.
- **Conditional requests.** Responses marked *ETag* below carry a strong `ETag`. A request with a matching
  `If-None-Match` gets `304` with no body. The dashboard always sends the last ETag it got.

## 2. Routes

| Route | Answer | ETag |
|---|---|---|
| `GET /` | the dashboard (`text/html`), from the plugin, held in memory since the server started | no |
| `GET /api/projects` | the registered projects with their summaries (§3) | yes |
| `GET /p/<id>/tasks.json` | that project's `.agentic-task-manager/tasks.json`, as stored | yes |
| `GET /p/<id>/claims.json` | that project's claims snapshot, as stored | yes |
| `GET /p/<id>/tasks-archive.json` | that project's archive, as stored | yes |
| `GET /__atm/whoami` | who this server is (§4) | no |
| anything else | `404` | |

- `<id>` is a project id from `/api/projects` (§3.1). An unknown id gets `404` with `{"error": "unknown project"}`.
- Only those three file names are served from a project, and only from its `.agentic-task-manager/` folder: no other
  file, no directory listing, no path segments after the file name. A file that doesn't exist (no archive yet, no
  claims snapshot yet) gets `404` with `{"error": "not found"}`. The dashboard treats a missing archive or snapshot as
  empty, as today.
- A missing project (§3.1 `missing: true`) answers `404` for its files.
- The ETag of a project file is its size and nanosecond mtime, as today's `json_etag` (`"<size hex>-<mtime_ns hex>"`).
- Query strings are ignored.

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
        "agents_working": 1,
        "needs_you": { "review": 0, "blocked_on_user": 0 },
        "last_activity": "2026-10-25T21:51:38Z",
        "completions_14d": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 30, 41, 28]
      }
    }
  ]
}
```

The ETag changes when the registry or any listed project's `tasks.json` or claims change (the server combines their
size/mtime stamps). Projects are listed in registry order. The dashboard sorts them.

### 3.1 Project fields

| Field | Meaning |
|---|---|
| `id` | the project's `meta.id` (8 hex characters, which `atm init` adds). A registered project without one gets `p` plus the first 7 hex characters of the SHA-1 of its `path`, stable as long as the path is, until `meta.id` is set |
| `name` | `meta.project`, or the folder's name when it has none |
| `path` | the project root (the main worktree's folder) |
| `missing` | `true` when the folder or its `.agentic-task-manager/tasks.json` is gone (or unreadable); the project then has `"summary": null` |
| `summary` | §3.2, or `null` when `missing` |

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
| `agents_working` | live claims (lease not expired) in the claims store |
| `needs_you.review` | review-kind tasks |
| `needs_you.blocked_on_user` | blocked-kind tasks with `waiting_on: "user"` |
| `last_activity` | the newest of all tasks' `updated_at`, `started_at`, `completed_at`, `review_requested_at`, `blocked_at` and `skipped_at`, and of note times; `null` without any |
| `completions_14d` | 14 integers, oldest first, ending with today: done-kind tasks by the UTC day of `completed_at` (tasks without `completed_at` aren't counted) |

## 4. `GET /__atm/whoami`

```json
{ "atm": true, "pid": 41235, "port": 8765, "version": "0.15.0", "build": "3f9a1c0d" }
```

`version` and `build` are the `atm-dashboard-version` and `atm-dashboard-build` meta tags of the dashboard the server
holds. atm compares them with its own plugin's dashboard to decide whether to restart the server (`serve --refresh`),
and the open dashboard compares `build` with its own to offer a reload.

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
