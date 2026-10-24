# v4 dashboard

Part of the v4 design ([overview](README.md)). It shows the [data model](data-model.md) and stays read-only.

**Non-goals:** editing tasks or vocabularies from the dashboard; a hosted website for Help and About; calling GitHub.

## 1. Footer, Help and About

Help and About live in the dashboard, as dialogs opened from a footer, so they work offline and match the dashboard's
version.

| ID | P | Requirement |
|---|---|---|
| D-1.1 | P1 | Every view ends with a footer: `© <year> Hakan Serce · MIT License`, the version (opens What's new), and links to **GitHub** (new tab), **Help** and **About**. Author, licence and repository URL come from `plugin.json` at build time; the year is that of the newest release in the changelog, so rebuilding the same sources gives the same file. The footer stays pinned at the bottom of the window. *(done, T-104)* |
| D-1.2 | P1 | The footer uses theme tokens and works in every theme and mode, at narrow widths too. The GitHub link is the dashboard's only link off `localhost` and is never fetched. *(done, T-104)* |
| D-1.3 | P1 | **Help** shows `docs/help.md`, rendered from Markdown at build time: what the dashboard shows, each tab, filters and saved views, statuses and kinds, priorities, workflows and stages, the archive, the skills with one line each, and running agents in parallel. |
| D-1.4 | P1 | **About** shows the name as **Agentic Task Manager (atm)** (today it shows only `atm`, `plugin.json`'s `name`; the full name becomes a build-time constant next to it), the description, version, author, licence, repository link, and the project's vocabularies and workflow as `tasks.json` defines them. *(done except the vocabularies and workflow, T-106)* |
| D-1.5 | P1 | Both dialogs close with Escape, a close button or a click outside, return focus, are reachable by keyboard, and open from `#help` and `#about`. |

## 2. Vocabularies, kinds and priority

| ID | P | Requirement |
|---|---|---|
| D-2.1 | P1 | Labels, filter values and Kanban columns come from the vocabularies, in their order. Colours and icons come from the kind, so a custom status looks like the built-in status of its kind. |
| D-2.2 | P1 | Forecast, burndown, agents and utilisation use kinds: `review` and `blocked` count as unfinished and not as agent activity. |
| D-2.3 | P1 | Priority shows as a badge on task cards, Kanban cards, the List tab and the detail panel; a Priority filter group (with counts, saved per project); the List tab sorts by it. |
| D-2.4 | P1 | Labels (DM-4.6) show as small neutral chips on task cards, Kanban cards, the List tab and the detail panel; a Labels filter group (with counts, saved per project), shown when some task has a label; search matches labels. With `meta.labels`, chips use its text and order (P2). |

## 3. Waiting: In Review and Blocked

| ID | P | Requirement |
|---|---|---|
| D-3.1 | P1 | In Review is its own Kanban column and filter value. Cards and the detail panel show how long the task has waited, from `review_requested_at`. |
| D-3.2 | P1 | The Blocked column appears only when a task is blocked, as today. Blocked cards show "Waiting on you" or "Waiting on an agent", the time waited and the number of questions; the detail panel lists the questions. |
| D-3.3 | P1 | The header's attention count includes tasks in review and tasks waiting on the user. |
| D-3.4 | P1 | Time in review or blocked is shown separately and never counted as agent work (DM-4.1). |

## 4. Notes, stages and actors

| ID | P | Requirement |
|---|---|---|
| D-4.1 | P1 | The detail panel lists the task's notes, newest first, with kind, who wrote it and when, and links the commit when `commit` is set. |
| D-4.2 | P1 | **Stages** (DM-4.3), whenever a task has `pr` or `merged_at`, whatever the current workflow: a stage chip on cards (`PR #12` linking to the PR, `Merged`); in a `pull-request` project the Done column is split into sections, In PR (per PR), Done (not pushed yet), Merged, with counts, Merged collapsed to the latest 20 like Done today. |
| D-4.3 | P1 | A **Stage** filter group (Done, In PR, Merged), shown only when some task has a stage. |
| D-4.4 | P1 | The Kanban has the same columns in both workflows: To Do, In Progress, In Review, Done; Blocked when used; Skipped behind its toggle. |
| D-4.5 | P1 | **Actors** (DM-4.4): the Agents tab and utilisation use `started_by` (falling back to `agent`), so their numbers don't change; people get lanes with a person icon. A marker ends a bar when `completed_by` differs ("approved by …"). The detail panel shows "Created by · started by · completed by" and earlier attempts from notes. An Agent filter group appears when more than one actor started tasks. |

## 5. Loading and the archive

| ID | P | Requirement |
|---|---|---|
| D-5.1 | P1 | **Conditional fetch:** no `?ts` cache-buster; fetches use `cache: 'no-cache'`, so the browser revalidates and the server answers `304 Not Modified` when nothing changed. Most 5-second polls transfer and parse nothing. |
| D-5.2 | P1 | `tasks-archive.json` is loaded only when a view needs history: the Progress tab, the Activity widget and Agents tab for periods before the oldest task in `tasks.json`, search with "Include archived", and the graph's "Show archived". A 404 means no archive. |
| D-5.3 | P1 | A dependency on an archived task shows as a stub ("T-042 · archived, done") in the detail panel; the graph shows archived tasks only with "Show archived". |
| D-5.4 | P1 | The header shows the archive count ("110 tasks · 600 archived"); the footer shows a small notice when the archive threshold is reached (DM-5.3). |
| D-5.5 | P1 | The build injects `atm-dashboard-build`, a hash of the built file's contents, next to the version; `atm migrate` compares it (atm-cli §4.6). |

## 6. Non-functional

| ID | Requirement |
|---|---|
| D-6.1 | One self-contained file within its size budget (256 KB). |
| D-6.2 | Strict screenshots cover the footer, both dialogs, priority badges, label chips, the In Review and Blocked columns, stages, the notes list and actors, in both modes. |
| D-6.3 | Tab switches and reloads stay within the existing budgets with 500 tasks in `tasks.json`, however large the archive. |
