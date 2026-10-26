# Project stats and information (T-214, T-216)

Status: **proposal for review**. Where and how the dashboard shows a project's overall stats (T-214) and its
information (T-216): what each item means, where its data comes from, and what's missing.

## 1. Where

| Option | For | Against |
|---|---|---|
| **A. A new *Project* tab** | room for both stats and info; linkable (`#view=project`); fits next to Progress | a sixth tab |
| B. A section on the Progress tab | no new tab | the Progress tab is about *what's left*; stats are about *what happened*; it gets long |
| C. The About dialog | already has a project section (T-217) | a dialog is for a glance, not for charts; hidden behind the footer |
| D. The All projects card | seen across projects | room for 2–3 numbers only |

**Recommendation: A, plus a little of C and D.**

- A **Project** tab, last in the tab bar: *Information* on the left, *Stats* on the right (stacked on narrow
  screens).
- The **About** dialog's project section (name and logo, T-217) gets a link *Project details* to the tab, and
  keeps only the vocabulary it shows today.
- The **All projects** cards get one line: *started 12 Aug · 236 tasks · 74 h agent time*.

Like the Progress tab, the Project tab uses the history (archived tasks too); it **ignores filters** (it describes
the project), and says so in its ⓘ.

## 2. Mock-up

```
┌ Project ───────────────────────────────────────────────────────────────────────────────────────────┐
│ [logo] Agentic Task Manager                                                                        │
│ A Claude Code plugin for agent task loops                                                          │
│                                                                                                    │
│ ┌ Information ───────────────────────────┐  ┌ Stats ⓘ ──────────────────────────────────────────┐  │
│ │ Repository  github.com/hakanserce/…  ↗ │  │  12 Aug 2026      75 days        236     21       │  │
│ │ Workflow    pull-request → main        │  │  started          duration       tasks   phases   │  │
│ │             verify before push         │  │                                                    │  │
│ │             feat({id}): {name}         │  │  212 commits      15 PRs         74 h    3         │  │
│ │                                        │  │                                  agent   most      │  │
│ │ People      Hakan Serce  created 236 · │  │                                  time    at once   │  │
│ │             completed 12               │  │                                                    │  │
│ │ Agents      Claude · 84 sessions ·     │  │  1.4 agents working on average while any works     │  │
│ │             started 220 tasks          │  │                                                    │  │
│ │                                        │  │  Time per task ⓘ  (agents alone ●  with you ○)     │  │
│ │ Vocabulary                             │  │  feature  |──[■■■|■■]────|   ·  ·       ▲          │  │
│ │  Phases   0 Foundations (12) …  ▸      │  │  bugfix   |─[■|■]──|  ·                            │  │
│ │  Labels   dashboard (90) security (17)…│  │  docs     |[■|■]─|                                 │  │
│ │  Types    feature 110 · bugfix 40 · …  │  │           0     30 m    1 h        2 h      4 h+   │  │
│ │  Statuses To Do (todo) · In Progress … │  │  Slowest: T-211 5 h 10 m · T-178 3 h 2 m · …       │  │
│ │  Priorities P0 … P3 (default P2)       │  │                                                    │  │
│ └────────────────────────────────────────┘  └────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## 3. Information (T-216)

| Item | Shows | From | Missing / caveats |
|---|---|---|---|
| **Name, logo, description** | as in the header | `meta.project`, `meta.description`, logo route | description is often empty: show nothing then |
| **Repository** | a link | `meta.repository` | without it: *Not set: `atm repository set <url>`* (as the commit links do) |
| **Workflow** | *direct* or *pull-request → base*, verify on/off, commit template, required trailers | `meta.workflow` | without one: *Not set: `/atm:push` asks the first time* |
| **People** | each person with tasks created, started, completed | `created_by`, `started_by`, `completed_by`, note authors | a person is a git user name; the same person under two spellings counts twice |
| **Agents** | grouped by agent kind (`claude:…` → *Claude*), with the number of sessions, tasks started and completed, and agent time; sessions listed when expanded | the same fields | old tasks have `agent` instead of `started_by` (read both, as `work.ts` does); tasks without either are *Unattributed* |
| **Phases** | number, name, task count, state (done / in progress / not started), collapsed to the unfinished ones plus *▸ 17 finished* | `meta.phases`, the tasks | — |
| **Labels** | each label with its text and count | `meta.labels`, the tasks | labels used but not in `meta.labels` are shown too, without text |
| **Types, statuses, priorities** | each with its count; statuses with their kind; the default priority | the vocabularies (`vocab.ts`) and the tasks | — |

The vocabulary is what the About dialog shows today; it moves here in full and the About dialog keeps a short form.

## 4. Stats (T-214)

| Stat | Definition | From | Missing / caveats |
|---|---|---|---|
| **Started** | the earliest `created_at` (or `meta.created`) | tasks, meta | — |
| **Duration** | earliest task start to the latest completion; *ongoing* (to now) while tasks are open | `started_at`, `completed_at` | tasks without `started_at` are left out of the start |
| **Tasks** | total, with done / open / skipped in the tooltip | tasks + `meta.archived` | — |
| **Phases** | count, with *N finished* | tasks | — |
| **Commits** | **commits in the repository's history since the project started**, from git; the task commits (one per task) as a fallback | *new*: the server runs `git rev-list --count --since=<start> HEAD` in the project folder | tasks record only their **last** atm commit, so counting `commit` fields undercounts. The server-side count is new (one cached git call; no network). Without git: *≥ 212 task commits* |
| **Pull requests** | distinct PR numbers on tasks | `pr.number` | only PRs recorded with `atm pr`; direct-workflow projects show *–* |
| **Agent time** | the sum of work spans, parallel agents adding up | `timeuse.ts` (T-245) | interactive tasks include working with you; the tooltip splits *alone* / *with you* |
| **Most at once** | the most agents working at the same moment | work spans | from `started_by`; parallel sessions of one person count apart |
| **Average parallelism** | agent time ÷ time with at least one agent working (*1.4 agents working on average while any works*) | `timeuse.ts` | — |
| **Time per task** | see 4.1 | | |

### 4.1 Time per task: a box plot per type

*Average / min / max* hides the shape: one 5-hour task and twenty 10-minute ones average to 25 minutes.

- **A horizontal box plot per type**: the box is the middle half (25th–75th percentile) with the median, whiskers to
  the 10th and 90th percentile, slower tasks as dots, beyond the axis as a triangle (as in the Activity chart,
  T-248). Types with fewer than 5 timed tasks show only their dots.
- **Two marks per type**: agents alone (filled) and with you (hollow, `interactive` tasks), as in T-246.
- A log-like axis (0, 30 m, 1 h, 2 h, 4 h+) so short and long tasks are both readable.
- Under it, **the 5 slowest tasks**, each a link to the task.
- The tooltip on a box gives *n*, min, median, max and the average.

Caveats in its ⓘ: tasks without a start, tasks restarted after an expired lease (measured from the restart),
reopened tasks (the latest attempt).

## 5. Data and code

- **One stats module**, `src/lib/projectstats.ts`, on the history (archive included), reusing `timeuse.ts`
  (T-245) and `work.ts`.
- **Commits from git**: the server adds `commits` (and `first_commit_at`) to the project's entry in
  `/api/projects` or a `p/<id>/stats` route, computed with one `git rev-list` call and cached until `HEAD` changes.
  The Vite dev server does the same. This is the only new data source.
- The All projects card line uses fields the summary already has, plus agent time (added to the summary in
  `query.py`).

## 6. Questions for you

1. **Where:** a *Project* tab (last), with the About link and a line on the All projects cards?
2. **Commits:** count them from git through the server, or only from task commits (an undercount)?
3. **Agents:** group sessions by agent kind (*Claude · 84 sessions*), sessions listed on expand?
4. **Time per task:** a box plot per type with the 5 slowest tasks, or something simpler (a histogram for all
   tasks)?
5. **About dialog:** keep a short vocabulary there, or move it entirely to the Project tab?
