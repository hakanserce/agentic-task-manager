# atm v4: overview

**Status:** proposal, for review · **Date:** 2026-10-24 · **Starts from:** atm 0.12.0

v4 makes atm hold up for bigger projects and longer-running agents: agents never touch the task file by hand, tasks
can wait on a review or a decision without losing the context, pushing follows the project's workflow through CI,
and the task file stays small as the project grows. It also adds priorities, labels, who did what, project
vocabularies, and a footer with Help and About.

## Documents

Each concept is defined once, in the area it belongs to:

| Document | Covers | IDs |
|---|---|---|
| [Data model](data-model.md) | the files, `meta`, statuses and kinds, task fields (actors, labels, notes), stages, size and the archive, compatibility | DM- |
| [atm-cli](atm-cli.md) | atm-cli's structure (modules, argparse), every command, hints, plumbing, the benchmark | CLI- |
| [Skills and workflows](skills-and-workflows.md) | `direct` and `pull-request` workflows, `/atm:push`, what each skill does, this repo's CI notes | S- |
| [Dashboard](dashboard.md) | footer, Help, About, vocabularies, priority, labels, In Review and Blocked, notes, stages, actors, loading and the archive | D- |

They replace `docs/v4-requirements.md` and the four proposals written alongside it (ship, helper structure, agent
commands, archive).

## Decisions

1. **Agents never read or write the task files directly;** every read and change goes through `atm`, and the skills
   say so (DM-1.1, S-3.1).
2. **Statuses, phases, types and priorities are project vocabularies** in `meta`, with defaults. Each status has one
   of six fixed **kinds**, and everything acts on kinds (DM-2, DM-3).
3. **Priority orders tasks within a phase:** phase, then priority, then ID (atm-cli §4.1).
4. **Two kinds of waiting:** In Review (finished, waiting on approval) and Blocked (waiting on a decision, with the
   questions recorded, on the user or on another agent). Both release the claim and let the agent go on with other
   tasks (DM-3).
5. **Notes on tasks** for handoffs, outcomes, answers and rejections, instead of state that lives only in chat
   (DM-4).
6. **Who did what:** `created_by`, `updated_by`, `started_by` and `completed_by` replace the single `agent` field;
   the dashboard's agent numbers stay on `started_by` (data model §4.1, D-4.5).
7. **Labels:** free-form tags on tasks, filterable on the dashboard, instead of markers in the text (data model §4.2,
   D-2.4).
8. **Two workflows,** `direct` and `pull-request`, in `meta.workflow`; the project's `CLAUDE.md` comes first (S-1).
   **In PR and Merged are stages of Done,** derived from `pr` and `merged_at`, not statuses (DM-4.3).
9. **`/atm:push`** pushes, opens the PR when the workflow uses one, and sees CI through, with a fixed "never" list
   (skills §2).
10. **`atm commit`** commits only the files the agent names; `--file` is required (atm-cli §4.5).
11. **`atm archive`** moves finished tasks to `tasks-archive.json`, suggested by atm-cli when the working file gets
    big; agents may run it themselves (DM-5, CLI-5, S-3.5).
12. **atm-cli is developed as modules in `atm-cli/`** and built into the one readable `atm.py` the plugin ships;
    argparse, not click, so Python stays the only requirement (atm-cli §2).
13. **Help and About live in the dashboard** as dialogs from a footer (D-1).
14. **One release, 0.13.0,** for all of it.

## Release plan

One release, **0.13.0**, phase 13 of this repository's tasks. Inside it, the order follows dependencies and the
pain:

1. **atm-cli first:** the module split and argparse (T-096), so the new commands are cheap to add; the benchmark.
2. **Data model and reading:** vocabularies and kinds, priority, labels, actors, `next_id`; the read commands; the
   skills stop reading `tasks.json`.
3. **Writing and waiting:** `add`, `edit`, `check`; `review`/`reject`, `block`/`unblock`, notes; `create-tasks`
   through `atm add`.
4. **Growth:** the archive with its hints; conditional fetch; build ID; `atm serve --dir`.
5. **Workflows:** `meta.workflow`, `commit`/`pr`/`merged`, `/atm:push`, loop-tasks pushing through it, the CI notes;
   the stable command name and automatic heartbeats.
6. **Dashboard** for each of the above as it lands, then screenshots, docs, Help and the release.

### Tasks

Existing phase-13 tasks keep their scope; their `requirements` fields and descriptions refer to the old IDs and to
`docs/v4-requirements.md`, and are updated to the new IDs (table below) and documents when the new tasks are added.

| Existing | Status | Now covers |
|---|---|---|
| T-096 atm-cli modules | todo | CLI-2 (now also argparse) |
| T-097 vocabularies and kinds | todo | DM-2, DM-3 |
| T-098 priority in selection | todo | atm-cli §4.1 (`next`) |
| T-099 `review` and `reject` | todo | atm-cli §4.2 |
| T-100, T-101 dashboard vocabularies and kinds | todo | D-2.1, D-2.2 |
| T-102 priority on the dashboard | todo | D-2.3 |
| T-103 In Review waiting time | todo | D-3.1 |
| T-104 footer, T-106 About | done | D-1.1, D-1.2, D-1.4 |
| T-105 Help | todo | D-1.3 |
| T-107, T-108 skills | todo | S-3.4 (vocabularies part), S-3.2/S-3.3 (priority, review) |
| T-109 screenshots, T-110 release | todo | D-6.2, the release |

New phase-13 tasks, added once this design is approved, in the order above:

- **atm-cli:** the benchmark (CLI-7.1); labels and actors (DM-4.4–4.7, CLI-3.5); read commands (`show`, `list`,
  `status`, `deps`, richer `start`/`done`); `add`/`edit`/`check` with `next_id` (including two agents adding at
  once); `block`/`unblock`/`note` and the `--note` options; `archive`/`unarchive` with the merge driver; the hints;
  build ID in `atm migrate`; `atm serve --dir`; `meta.workflow` with `atm workflow`, `commit`, `pr`, `merged`; the
  `bin/` check and the stable name; the heartbeat hook. Each with atm-cli scenarios.
- **Skills:** do-task and loop-tasks stop reading `tasks.json` and use the new commands (S-3.1–3.3, S-3.5);
  create-tasks through `atm add`, with labels and the workflow (S-3.4); `/atm:push` (skills §2); the CI notes in
  `CLAUDE.md` (skills §4).
- **Dashboard:** About's full name (D-1.4); labels (D-2.4); Blocked, notes and actors (D-3.2, D-3.3, D-4.1, D-4.5);
  stages (D-4.2–4.4); conditional fetch (D-5.1); the archive (D-5.2–5.4); build ID (D-5.5).
- **Docs and release:** Help covering all of it, README, `plugin/CLAUDE.md`, the changelog; T-109 and T-110 extended.

### Old requirement IDs

| `v4-requirements.md` | Now |
|---|---|
| FR-1.1 – FR-1.3 | D-1.1, D-1.2 |
| FR-2.1, FR-2.2, FR-2.3 | D-1.3, D-1.4, D-1.5 |
| FR-3.1, FR-3.2 | DM-2 (`priorities`, `default_priority`), DM-4 (`priority`) |
| FR-3.3 | atm-cli §4.1 (`next`) |
| FR-3.4 | D-2.3 |
| FR-4.1, FR-4.2 | DM-2, DM-3 |
| FR-4.3 | DM-2.2, DM-3.2 |
| FR-4.4 | DM-3.1, DM-3.3 |
| FR-4.5 | D-2.1, D-2.2 |
| FR-4.6 | S-3.4 |
| FR-4.7 | atm-cli §4.1 (`vocab`) |
| FR-5.1, FR-5.2 | atm-cli §4.2 (`review`, `reject`, `done`) |
| FR-5.3 | S-3.2, S-3.3 |
| FR-5.4, FR-5.5 | D-3.1, D-3.4 and DM-4.1 |
| NFR-1, NFR-2, NFR-3, NFR-4 | D-6.1, CLI-2.3, DM-6.1, D-6.2 |

## Open questions

None. Settled in review: `atm commit` requires the files (decision 10), waiting on an agent stays (decision 4), one
release (decision 14).
