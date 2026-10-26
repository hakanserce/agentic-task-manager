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
- The **About** dialog's project section (name and logo, T-217) keeps a short vocabulary (phases, types, statuses
  in one line each) and gets a link *Project details* to the tab.
- The **All projects** cards get one line: *started 12 Aug · 236 tasks · 74 h agent time*.

### 1.1 Tab order

With a sixth tab, the order matters. Today: *Dependency Graph · Kanban Board · Task List · Agents · Progress*, and
the graph is the default for a new project. Proposal: **the views you work in first, then the ones you read**:

*Kanban Board · Task List · Dependency Graph* | *Progress · Agents · Project*

- **Kanban first and the default** for projects without a saved view: it's what most people open the dashboard for
  (what's in progress, what needs me). The graph is a planning view and gets slow on big projects.
- A thin divider between the two groups.
- Saved views and `#view=` links keep working (they name the tab, not its position).

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
│ │             feat({id}): {name}         │  │  212 task         15 PRs         74 h    3         │  │
│ │                                        │  │  commits                         agent   most      │  │
│ │ People      Hakan Serce  created 236 · │  │                                  time    at once   │  │
│ │             completed 12               │  │                                                    │  │
│ │ Agents      84 sessions ·              │  │  1.4 agents working on average while any works     │  │
│ │             started 220 tasks          │  │                                                    │  │
│ │                                        │  │  Time per task ⓘ   ■ agents alone  ▨ with you      │  │
│ │ Vocabulary                             │  │  40┤  ▆                                            │  │
│ │  Phases   0 Foundations (12) …  ▸      │  │    │ ▆█▅                                           │  │
│ │  Labels   dashboard (90) security (17)…│  │    │▃███▆▃▂ ▂▨ ▨▨ ▁▨      ▁                        │  │
│ │  Types    feature 110 · bugfix 40 · …  │  │    └┬───┬────┬────┬─────┬────┬──                   │  │
│ │  Statuses To Do (todo) · In Progress … │  │     0  10 m 30 m  1 h   2 h  4 h+   ▲ median       │  │
│ │  Priorities P0 … P3 (default P2)       │  │  Slowest: T-211 5 h 10 m · T-178 3 h 2 m · …       │  │
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
| **Agents** | one line: the number of agent sessions, tasks they started and completed, and agent time (no grouping or per-session list; the Agents tab has those) | the same fields | old tasks have `agent` instead of `started_by` (read both, as `work.ts` does); tasks without either are *Unattributed* |
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
| **Task commits** | tasks with a recorded commit, labelled *task commits* | `commit` | each task records only its **last** atm commit, so fix-up and chore commits aren't counted; the label and its tooltip say so (*one per task: the commit atm made when finishing it*). No git calls |
| **Pull requests** | distinct PR numbers on tasks | `pr.number` | only PRs recorded with `atm pr`; direct-workflow projects show *–* |
| **Agent time** | the sum of work spans, parallel agents adding up | `timeuse.ts` (T-245) | interactive tasks include working with you; the tooltip splits *alone* / *with you* |
| **Most at once** | the most agents working at the same moment | work spans | from `started_by`; parallel sessions of one person count apart |
| **Average parallelism** | agent time ÷ time with at least one agent working (*1.4 agents working on average while any works*) | `timeuse.ts` | — |
| **Time per task** | see 4.1 | | |

### 4.1 Time per task: a histogram

*Average / min / max* hides the shape: one 5-hour task and twenty 10-minute ones average to 25 minutes. A
histogram of all timed tasks shows it at a glance:

- **Bins that widen with time**, so short and long tasks are both readable: 0–5 m, 5–10 m, 10–20 m, 20–30 m,
  30–45 m, 45 m–1 h, 1–1.5 h, 1.5–2 h, 2–3 h, 3–4 h, 4 h+.
- **Each bar stacked**: agents alone (solid) and with you (hatched, `interactive` tasks), as in T-246.
- A **median** marker per kind on the axis (▲ alone, △ with you); min, max and the average in the ⓘ and the tooltip.
- The tooltip on a bar: its range, how many tasks of each kind, and the first five of them.
- Under it, **the 5 slowest tasks**, each a link to the task.
- *Later, if wanted*: a Type selector above it (All · feature · bugfix · …) to see one type's shape.

Caveats in its ⓘ: tasks without a start, tasks restarted after an expired lease (measured from the restart),
reopened tasks (the latest attempt).

## 5. Data and code

- **One stats module**, `src/lib/projectstats.ts`, on the history (archive included), reusing `timeuse.ts`
  (T-245) and `work.ts`.
- No new data source: everything comes from `tasks.json` and the archive.
- The All projects card line uses fields the summary already has, plus agent time (added to the summary in
  `query.py`).

## 6. Decisions

1. **Where:** a *Project* tab, with the About link and a line on the All projects cards. *(agreed)*
2. **Commits:** task commits only, labelled and explained as such. *(agreed)*
3. **Agents:** no grouping by kind; one line with the number of sessions. *(agreed)*
4. **Time per task:** a histogram of all tasks, alone and with you stacked, with the 5 slowest listed. *(agreed)*
5. **About dialog:** keeps a short vocabulary, with a *Project details* link to the tab. *(agreed)*
6. **Tab order** (§1.1): *Kanban · List · Graph | Progress · Agents · Project*, Kanban the default. *(approved)*

Implementation: T-251 to T-255 in phase 21.
