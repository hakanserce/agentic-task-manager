# atm v4: footer, help and about, priorities, project vocabularies, In Review

**Status:** proposal, for review · **Date:** 2026-10-24 · **Starts from:** atm 0.12.0

## 1. Decisions

1. **Help and About live in the dashboard**, as dialogs opened from a new footer, so they work offline and match the
   dashboard's version. Help's text has one source, `docs/help.md`, inlined at build time the way the changelog is.
2. **Priority orders tasks within a phase.** Agents pick by phase, then priority (most urgent first), then task ID.
   Phases still set the sequence. A task without a priority ranks as the project's default priority (P2).
3. **Statuses, phases, types and priorities are project vocabularies** stored in `tasks.json` `meta`. When a list is
   absent, the defaults apply, so existing files keep working.
4. **Each status has a kind**: `todo`, `active`, `review`, `blocked`, `done` or `skipped`. The helper, the skills and
   the dashboard act on the kind, never on a status's name. Only a `done`-kind status satisfies a dependency.
5. **In Review is a default status** (`in_review`, kind `review`). Its dependents wait until it is done. The agent
   releases its claim when it asks for a review and may go on with other ready tasks. The reviewer (the user, or an
   agent) passes the review with `atm done`, or rejects it with `atm reject --reason`, which puts the task back to
   `todo` with the reason recorded, so the next agent picks it up.

## 2. Context

Four requests from this round:

1. A **footer** with the copyright, a link to the GitHub repository, a link to a Help page and an About page.
2. A **priority** field on tasks. Unless the user says otherwise, the skills use P0 Critical/Required, P1 High,
   P2 Medium, P3 Low/Nice-to-have.
3. When creating tasks, the skills **confirm the statuses, phases, task types and priorities** with the user, who
   may define their own.
4. **In Review** as a default status, used by agents while they wait for a review by the user or another agent.

### Non-goals
- Editing tasks or vocabularies from the dashboard (it stays read-only).
- A hosted website for Help and About.
- Custom kinds: the six kinds are fixed, because the helper's rules are written against them.

## 3. Requirements

Priorities: **P1** must ship in this round; **P2** if cheap, otherwise later.

### FR-1 Footer

| ID | P | Requirement |
|---|---|---|
| FR-1.1 | P1 | Every view of the dashboard ends with a footer: `© <year> Hakan Serce · MIT License`, the version (opens What's new, like the version chip), and links to **GitHub** (`https://github.com/hakanserce/agentic-task-manager`, new tab), **Help** and **About**. The author, licence and repository URL come from `plugin/.claude-plugin/plugin.json` at build time; the year is the build year. |
| FR-1.2 | P1 | The footer uses theme tokens and works in every theme and mode, at narrow widths too (links wrap; no horizontal scroll). |
| FR-1.3 | P1 | The GitHub link is the dashboard's only link off `localhost`, and it is never fetched: e2e tests keep failing on any non-localhost request. |

### FR-2 Help and About

| ID | P | Requirement |
|---|---|---|
| FR-2.1 | P1 | **Help** opens a dialog with `docs/help.md`, rendered from Markdown at build time (no Markdown library in the build, as for the changelog). It covers: what the dashboard shows, each tab, filters and saved views, statuses and their kinds, priorities, the skills (`/atm:*`) with one line each, and running agents in parallel (a short summary linking to the README section). |
| FR-2.2 | P1 | **About** opens a dialog with: the name and a one-line description (from `plugin.json`), the version, the author, the licence, the repository link, and the project's vocabularies as this `tasks.json` defines them (statuses with kinds, phases, types, priorities), so a user can see what the agents will use. |
| FR-2.3 | P1 | Both dialogs close with Escape, a close button or a click outside, return focus to the link that opened them, and are reachable by keyboard. `#help` and `#about` in the URL open them, so they can be linked. |

### FR-3 Priority

| ID | P | Requirement |
|---|---|---|
| FR-3.1 | P1 | Tasks have an optional `priority` field holding a priority ID (`"P0"` … `"P3"` by default). |
| FR-3.2 | P1 | Default priorities, most urgent first: `P0` Critical/Required, `P1` High, `P2` Medium, `P3` Low/Nice-to-have. The default for tasks without one is `P2`. |
| FR-3.3 | P1 | `atm next` (with and without `--claim`) orders ready tasks by phase, then priority rank, then task ID (natural sort). A missing or unknown priority ranks as the default priority. |
| FR-3.4 | P1 | The dashboard shows the priority as a badge on task cards, Kanban cards, the List tab and the detail panel; adds a Priority filter group (with counts, saved per project like the other filters); and sorts by priority where the List tab sorts. |

### FR-4 Project vocabularies

| ID | P | Requirement |
|---|---|---|
| FR-4.1 | P1 | `meta` may hold `statuses` (`[{id, label, kind}]`), `phases` (`[{id: number, name}]`), `types` (`[{id, label}]`), `priorities` (`[{id, label}]`, most urgent first) and `default_priority`. Each list that is absent falls back to the defaults below. |
| FR-4.2 | P1 | Default statuses: `todo` (todo), `in_progress` (active), `in_review` (review), `blocked` (blocked), `done` (done), `skipped` (skipped). Default types: `feature`, `bugfix`, `test`, `infra`, `docs`, `refactor`, `polish`. Default phases: numbers only, without names. |
| FR-4.3 | P1 | The helper validates `meta` when it reads the file: every status has one of the six kinds, there is at least one `todo`-kind, one `active`-kind and one `done`-kind status; when a kind has several statuses, the commands that move a task to that kind (`start`, `review`, `done`, `fail`, `release`, `reject`) take `--status <id>` to choose one of them, and otherwise use the first one listed. Agents pass `--status` when a status's name or label fits the situation better (e.g. `awaiting_user` vs `awaiting_agent` for reviews); a `--status` of the wrong kind is an error; IDs are unique. An invalid vocabulary is an error with a message naming the problem; nothing is written. |
| FR-4.4 | P1 | The helper's rules use kinds: dependencies are met by `done`-kind statuses; the merge driver ranks statuses by kind (todo < active, blocked, review < done, skipped). |
| FR-4.5 | P1 | The dashboard takes labels, filter values and Kanban columns from the vocabularies, in their order. Colours and icons come from the kind, so a custom status looks like the built-in status of its kind. Forecast, burndown, agents and utilisation use kinds: `review` counts as unfinished and not as agent activity. |
| FR-4.6 | P1 | `/atm:create-tasks` shows the vocabularies it will use (defaults, or the ones already in `meta` when adding tasks to an existing file), proposes phase names from the decomposition, and asks the user to confirm or change each list before writing tasks. It writes the confirmed lists to `meta` (only lists that differ from the defaults, plus phase names) and gives every task a priority. |
| FR-4.7 | P2 | `atm vocab` prints the effective vocabularies as JSON, for the skills and for users. |

### FR-5 In Review

| ID | P | Requirement |
|---|---|---|
| FR-5.1 | P1 | `atm review <id> [--note <text>]` moves an `active`-kind task to the `review`-kind status, records `review_requested_at` and the note, and releases the claim. |
| FR-5.2 | P1 | `atm done <id>` accepts `active`- and `review`-kind tasks. `atm reject <id> --reason <text>` moves a `review`-kind task to `todo`, records the reason (as `fail` does) and clears `review_requested_at`. |
| FR-5.3 | P1 | `/atm:do-task` and `/atm:loop-tasks` end a task with `atm review` (with `--status` when the project has several review-kind statuses and one's name fits) instead of `atm done` when the task, the project's instructions or the user ask for a review by the user or another agent; they report it as waiting for review. `/atm:loop-tasks` then continues with other ready tasks. |
| FR-5.4 | P1 | The dashboard shows In Review as its own Kanban column and status filter value, with how long the task has waited (from `review_requested_at`) on cards and in the detail panel. |
| FR-5.5 | P1 | Durations and estimates keep using `started_at`→`completed_at`; the time in review is shown separately and is not counted as agent work. |

### Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | The dashboard stays one self-contained file within its size budget (256 KB). |
| NFR-2 | The helper stays Python 3.9+ standard library only, tested with 3.9 and a current version. |
| NFR-3 | Backward compatible: files without `meta` vocabularies or `priority` fields behave as in 0.12.0, with `in_review` added. |
| NFR-4 | Strict screenshots cover the footer, both dialogs, priority badges and the In Review column, in both modes. |

## 4. Release plan

One release, **0.13.0**, phase 13 of this repository's tasks: helper first (vocabularies, priority, review), then the
dashboard, then the skills, then docs and the release.

## 5. Open questions
None.
