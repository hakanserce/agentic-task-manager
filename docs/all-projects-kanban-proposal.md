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
| **2. Live board, no phase filter** | every task *in progress*, *in review* and *blocked*, plus the next few *to do* and the last few *done* per project | answers the question directly; small; fits the existing summaries | no deep browsing (that's what each project's own Kanban is for) |
| 3. Per-project swimlanes | one row per project, the five columns in each | groups clearly | tall with many projects; most lanes would be mostly empty |

**Recommendation: 2**, with swimlanes from option 3 as a toggle (*Group by project*), like *Group by phase* on a
project's Kanban.

## 3. Mock-up

```
All projects   [ Cards | Board ]                                   [ Group by project ] [ Active only ]

┌ TO DO · next ─────┐ ┌ IN PROGRESS ──────┐ ┌ IN REVIEW ────────┐ ┌ BLOCKED ──────────┐ ┌ DONE · latest ────┐
│ ◧ atm  T-238      │ │ ◧ atm  T-250      │ │ ◩ shop  T-041     │ │ ◩ shop  T-044     │ │ ◧ atm  T-216      │
│ Progress: header… │ │ Filters: show…    │ │ Checkout flow     │ │ Payment provider? │ │ Project info…     │
│ P1 · ready        │ │ claude:e5ea · 12m │ │ waiting 2 h       │ │ on you · 1 q      │ │ 3 min ago         │
│                   │ │                   │ │                   │ │                   │ │                   │
│ ◩ shop  T-045     │ │ ◨ blog  T-007     │ │                   │ │                   │ │ ◨ blog  T-006     │
│ …                 │ │ …                 │ │                   │ │                   │ │ …                 │
│ + 2 more in atm   │ │                   │ │                   │ │                   │ │                   │
└───────────────────┘ └───────────────────┘ └───────────────────┘ └───────────────────┘ └───────────────────┘
```

- A **Cards | Board** switch on the All projects page (remembered); the cards stay the default.
- Each card has a **project chip** (logo or monogram and short name, in the project's colour), like the branch chip
  on worktree cards. Clicking a card opens that task in its project; clicking the chip opens the project.
- **To Do** shows each project's **next 3 ready** tasks, in the loop's order (*+ N more in atm* links to that
  project's Kanban). **Done** shows the **10 most recent** across projects.
- **In progress**, **in review** and **blocked** show **all** (capped at 30 per column, with *+ N more*), oldest
  wait first in review and blocked; blocked on you before blocked on an agent.
- **Active only** (shared with the cards view) hides projects with nothing open and nothing done lately.
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
- **more than one** recent done task;
- a few **card fields**: type, priority, phase, and the wait start (`since`) for review and blocked.

**Proposal:** add a `board` object to each project's summary, built in `query.py`: `todo` (next 3), `active`, `review`,
`blocked` (each capped at 30), `done` (latest 10), each card `{id, name, type, priority, phase, since, by,
waiting_on}`. With the existing names capped, that's a few KB per project, polled with the summaries every 5 s
(the server already caches summaries per file change). The Vite dev server builds the same.

## 6. Also considered

- **Drag and drop** between columns: no; statuses change through atm, never from the dashboard.
- **Filters** (type, priority, label): labels and types differ per project. A search box over the board's cards
  (by name, ID or project) is cheap and useful; filters can come later if asked for.

## 7. Questions for you

1. **Option 2** (a live board) with *Group by project* as a toggle?
2. **To Do**: next 3 per project, and **Done**: latest 10 overall, the right amounts?
3. **Where**: a *Cards | Board* switch on the All projects page, cards the default?
4. A **search box** over the board's cards now, filters later?
