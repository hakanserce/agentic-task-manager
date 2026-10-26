# All Projects Kanban (T-215)

Status: **proposal for review**. A Kanban board on the *All projects* page with cards from every project.

## 1. What it's for

The All projects page answers *how is each project doing?* (one card per project). A cross-project board answers a
different question: **what's happening right now, everywhere, and what needs me?** That's a short list of tasks, not
a full board: nobody wants 15 projects × 200 tasks in five columns.

## 2. Options

| Option | How | For | Against |
|---|---|---|---|
| 1. Cross-project phases and filters | phase 3 of every project in one column set | familiar filters | phases mean different things in each project; "phase 3" across projects is noise; needs every project's `tasks.json` |
| **2. Live board, no phase filter** | every task *in progress*, *in review* and *blocked*; the tasks **ready to start** in *To Do*; the tasks **finished in the last 24 hours** in *Done* (rules in §3.1) | answers the question directly; small; fits the existing summaries | no deep browsing (that's what each project's own Kanban is for) |
| 3. Per-project swimlanes | one row per project, the five columns in each | groups clearly | tall with many projects; most lanes would be mostly empty |

**Recommendation: 2**, with swimlanes from option 3 as a toggle (*Group by project*), like *Group by phase* on a
project's Kanban. Grouped, a project with no card on the board gets **no lane**.

## 3. Mock-up

```
All projects   [ Projects | Board ]   [ Search… ]                  [ Group by project ] [ Active only ]

┌ TO DO · ready ────┐ ┌ IN PROGRESS ──────┐ ┌ IN REVIEW ────────┐ ┌ BLOCKED ──────────┐ ┌ DONE · last 24 h ─┐
│ ◧ atm  T-238      │ │ ◧ atm  T-250      │ │ ◩ shop  T-041     │ │ ◩ shop  T-044     │ │ ◧ atm  T-216      │
│ Progress: header… │ │ Filters: show…    │ │ Checkout flow     │ │ Payment provider? │ │ Project info…     │
│ P1 · ready        │ │ claude:e5ea · 12m │ │ waiting 2 h       │ │ on you · 1 q      │ │ 3 min ago         │
│                   │ │                   │ │                   │ │                   │ │                   │
│ ◩ shop  T-045     │ │ ◨ blog  T-007     │ │                   │ │                   │ │ ◨ blog  T-006     │
│ …                 │ │ …                 │ │                   │ │                   │ │ …                 │
│ + 2 more in atm   │ │                   │ │                   │ │                   │ │                   │
└───────────────────┘ └───────────────────┘ └───────────────────┘ └───────────────────┘ └───────────────────┘
```

- The All projects page gets **two tabs**, styled like a project's tabs: **Projects** (today's cards, the default)
  and **Board**. The choice is remembered, and `#view=board` links to it.
- Each card has a **project chip** (logo or monogram and short name, in the project's colour), like the branch chip
  on worktree cards. Clicking a card opens that task in its project; clicking the chip opens the project.
- **Active only** (shared with the cards view) hides projects with nothing open and nothing done lately.
- A **search box** that works like a project's search, over the text of the tasks on the board: ID, name,
  description, type, labels and notes (plus the project's name). No other filters. The board's cards don't carry
  descriptions or notes (that would send every project's full text every 5 s), so the search asks the server:
  `GET api/search?q=…` searches the registered projects' `tasks.json` files and returns the matching task IDs per
  project; the board shows the cards among them. Debounced as you type, read-only, behind the same loopback and
  Host checks as every route.

### 3.1 Which tasks, one rule per column

Every column answers *now* or *next*, never "a few":

| Column | Shows | Why |
|---|---|---|
| **To Do** | the tasks **ready to start**: to do, every dependency done, not claimed, in the project's **first unfinished phase** (exactly what `/atm:loop-tasks` would take next) | "ready" is a definite set, small by nature; tasks waiting on others are the project Kanban's business |
| **In progress** | **all** tasks in progress | now |
| **In review** | **all** tasks waiting for a review | now, and it needs you |
| **Blocked** | **all** blocked tasks, on you or on an agent | now |
| **Done** | tasks **finished in the last 24 hours** | recent work, with one fixed window; an *Older* link opens the project's Kanban |

**One cap for every column: 30 cards**, with *+ N more* at the bottom (opening the projects' Kanbans). Real boards
rarely reach it; it keeps a runaway project from swamping the page. In *To Do*, one project shows at most 10 ready
tasks (*+ N more ready in atm*), so a project that just got 50 new tasks doesn't fill the column.

An empty column says why: *Nothing ready to start*, *Nothing finished in the last 24 hours*.
- The **Needs you** menu and badge stay as they are; the review and blocked columns are the same tasks, so the
  board doesn't add another count.

## 4. Sorting

| Column | Order |
|---|---|
| To Do | by project (most recently active first), then the loop's order |
| In progress | longest running first |
| In review | longest waiting first |
| Blocked | on you first, then longest waiting |
| Done | most recent first |

## 5. Data and load

The board needs **no project's full `tasks.json`**. `api/projects` already sends, per project, summaries the cards
use: `working` (claims), `next` (the next ready tasks), `last_done` (one), `needs_you_tasks` (review and blocked on
the user). It's missing:

- blocked **on an agent** (only blocked on the user is there);
- the tasks **finished in the last 24 hours** (only the last one is there);
- **all ready tasks** of the current phase (only the next few are there);
- the **card fields** a project's Kanban card shows.

**Proposal:** add a `board` object to each project's summary, built in `query.py` with the rules of §3.1: `todo`
(ready, at most 10), `active`, `review`, `blocked` (each at most 30) and `done` (last 24 hours, at most 30). Each
card carries **exactly what a project's Kanban card shows, nothing more**: `id`, `name` (capped like today's
summaries), `type`, `phase`, `priority`, `labels`, and by column: `by` (who works on it) for in progress; `since`
(when the wait started) for review and blocked; `waiting_on` and the number of questions for blocked; `completed_at`
for done. That's a few KB per project, polled with the summaries every 5 s (the server already caches summaries per
file change). The Vite dev server builds the same.

## 6. Also considered

- **Drag and drop** between columns: no; statuses change through atm, never from the dashboard.
- **Filters** (type, priority, label): labels and types differ per project. A search box over the board's cards
  (by name, ID or project) is cheap and useful; filters can come later if asked for.

## 7. Decisions

1. **Option 2** (a live board) with *Group by project* as a toggle; grouped, projects with nothing on the board get
   no lane. *(agreed)*
2. **Which tasks**: the rules of §3.1 (ready to start; all in progress, review, blocked; done in the last 24 hours;
   30 per column, 10 ready per project). *(approved)*
3. **Where**: two tabs on the All projects page, *Projects* (default) and *Board*. *(approved)*
4. A **search box** over the tasks' text (ID, name, description, type, labels, notes) through a server search
   route; no other filters. *(approved)*

Implementation: T-257 to T-261 in phase 21.
