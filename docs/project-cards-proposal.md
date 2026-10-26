# Project cards: what they should show (T-191)

Status: **proposal, for review**. Nothing here is decided until the user has gone through it; the follow-up tasks
at the end are added with `/atm:create-tasks` after that review.

## 1. The problem

The overview (`#overview`, `ProjectsOverview.svelte`) is where someone with several projects looks first: *which
project needs me, which one is moving, which one is stuck?* Today a card (`ProjectCard.svelte`) answers only part
of that:

```
┌──────────────────────────────────────────────┐
│ agentic-task-manager          [2 need you]   │
│ ████████████████████████░░░░  184 / 201  92% │
│ Phase 17 · Polish — 6 / 17                   │
│ 🤖 2 agents working    3 min ago   ▁▃▁▅▂▇▃   │
└──────────────────────────────────────────────┘
```

What it can't tell you:

- **What** needs you: "2 need you" is a count; you open the project to find out whether it's a quick review or a
  question that blocks everything.
- **What** the agents are doing: "2 agents working" doesn't say on what, or whether they're nearly done.
- **Where the project is going**: the overall bar sits at 80–95 % for long-lived projects (T-192 says the same),
  and the one current-phase line hides that two or three phases are often open at once.
- **What's next**: whether anything is ready for an agent to pick up, or the project has run dry.
- **Delivery state**: is there an open PR, is CI red? (`meta.repository`, task `pr` / stage fields.)
- **Which project it is** at a glance: names only; no logo, no description.

All of this must still fit a card about 320–380 px wide (the grid's minimum), stay calm when nothing happens, and
come from `api/projects` in one request: the overview never loads each project's `tasks.json`.

## 2. Options

Each option says what the card shows, a sketch, and what `summary` (atm-cli `query.project_summary`, documented in
`docs/multi-project-api.md` §3.2) must add. Sizes are estimates for 20 projects of ~500 tasks.

### A. Recent phases as rings (already planned: T-192, T-193)

```
 (75%)  (40%)  (10%)  ( 0%)
  P14    P15    P16    P17
```

- Replaces the overall bar with up to 4 rings: the phases with open work, then the most recently finished.
- Summary: `recent_phases: [{id, name, done, total, percent}]` (T-192).
- Verdict: **yes**: it's the best "where is it going" signal. Keep the overall `done / total` as a muted line.

### B. Who is working on what

```
 🤖 T-198 Kanban: completion ring …        12 m
 🤖 T-195 ATM logo                          3 m
```

- Up to 2 rows: the claimed task's id and name, and how long it has been claimed. "+1 more" when there are more.
- Summary: `working: [{task, name, agent, since}]` from the live claims (the server already reads the claims store
  for `agents_working`). ~100 bytes per claim.
- Verdict: **yes**, replacing the bare "N agents working" count. It's what makes the overview feel live.

### C. What needs you, by name (already planned for the chip: T-200)

```
 [2 need you ▾]  →  T-191 Brainstorm: project cards   blocked on a question
                    T-194 Check the phase rings live  in review
```

- T-200 adds `needs_you_tasks: [{id, name, reason}]` and opens them from the chip's list.
- Option: also show the **first one inline** on the card (one line, yellow), so the most common case (one
  question) needs no click.
- Verdict: **yes** to T-200; the inline first item is a cheap follow-up on top of it.

### D. Next ready tasks

```
 Next: T-188 One title bar for every page  (+5 ready)
```

- The task `atm next` would pick, and how many more are ready. Tells you whether starting a loop there is useful.
- Summary: `next: {id, name} | null` and `ready_count`. The server can reuse `query`'s next-task rule; it's computed
  only when `tasks.json` changes (the summaries are cached by stamp).
- Verdict: **yes**, one line. When nothing is ready but work is open, say why ("4 blocked, 2 in review").

### E. Delivery: branch, PR, CI

```
 ⎇ dev/phase-17  ·  PR #13 open  ·  CI ✓
```

- The branch of the main worktree is already known (`worktrees`). Open PRs come from tasks' `pr` / stage fields
  (`in_pr` with a PR number) and `meta.repository` for the link.
- CI state is **not** in tasks.json: getting it means calling GitHub/GitLab from the server (tokens, rate limits,
  network from a local tool). Out of scope; at most, show what atm records (`/atm:push` could write the last CI
  result into `meta`, a separate decision).
- Summary: `branch`, `open_prs: [{number, url, tasks}]` from task fields only.
- Verdict: **maybe**: the branch + open PR line is cheap and useful for `pull-request` projects; skip CI for now.

### F. Last finished task

```
 ✓ T-187 Update notice: shows only once …   2 h ago
```

- Summary: `last_done: {id, name, at}`. The sparkline already shows *how much*, this shows *what*.
- Verdict: **maybe**: overlaps with B when agents are working; most useful for idle projects. Show it only when
  nobody is working.

### G. Logo and description

- Logo: T-196 / T-197 (server serves `p/<id>/logo`, the card shows it or a monogram).
- Description: `meta.description` (if set) as one muted, ellipsized line under the name; `title` with the full text.
- Summary: `description` (≤ 200 chars, cut by the server).
- Verdict: **yes** for the logo (planned); description **optional**, off when absent so cards don't grow.

## 3. Recommended layout

One card, four bands, every band optional and one line high, so cards in a row stay aligned:

```
┌──────────────────────────────────────────────────┐
│ [logo] agentic-task-manager        [2 need you ▾]│  head: logo, name, chip (G, C)
│        Plan, run and watch agent tasks           │  description, muted (G, optional)
│                                                  │
│  (75%)  (40%)  (10%)  ( 0%)     184 / 201 done   │  rings (A) + overall, muted
│   P14    P15    P16    P17                       │
│                                                  │
│ ? T-191 Brainstorm: project cards  needs answer  │  first item needing you (C, inline)
│ 🤖 T-198 Kanban: completion ring …         12 m  │  working now, max 2 rows (B)
│ → Next: T-188 One title bar … (+5 ready)         │  next ready (D)
│                                                  │
│ ⎇ dev/phase-17 · PR #13      3 min ago ▁▃▁▅▂▇▃   │  foot: branch/PR (E), activity
└──────────────────────────────────────────────────┘
```

Rules that keep it calm:

- At most **4 text rows** between the rings and the foot, in this priority: needs you → working → next → last
  finished (F, only when nobody is working). A card never grows past that; the rest is behind the chip or a click.
- An idle, finished project collapses to head + rings + foot.
- Every task row is a button that opens the project with that task's details (as T-199/T-200 do for the chip).
- Text rows ellipsize; the full name is in `title`.

## 4. Summary additions, in one place

| Field | Option | Source | Notes |
|---|---|---|---|
| `recent_phases` | A | tasks | T-192 |
| `needs_you_tasks` | C | tasks | T-200 |
| `working` | B | claims store | task id, name, agent, since; live claims only |
| `next`, `ready_count`, `waiting` | D | tasks | same rule as `atm next`; `waiting` = blocked/review counts when nothing is ready |
| `last_done` | F | tasks | newest `completed_at` |
| `branch`, `open_prs` | E | git, tasks | branch of the main worktree; PRs from task fields |
| `description` | G | `meta.description` | cut to 200 chars |

All are cheap (one pass over the tasks, already done for the summary) and cached with the summary's stamp
(`tasks.json`, claims store, date). The per-project payload grows by roughly 1 KB.

## 5. Questions for the user

1. Is the layout in §3 the right density, or should cards stay smaller (rings + chip + one "working" row)?
2. Next ready task (D): useful at a glance, or noise?
3. Branch / PR line (E): worth it without CI state? Should `/atm:push` record the last CI result so the card can
   show it?
4. Should the first task needing you be inline on the card (C), or only behind the chip?
5. `meta.description`: add a way to set it (`atm init`/`atm meta`), or skip descriptions?

## 6. Follow-up tasks (to add after the review)

Already planned: T-192 + T-193 (rings), T-196 + T-197 (logos), T-200 (needs-you list).

New, depending on the answers:

1. **Server summary: who works on what** (cli): `working` from live claims; scenarios; docs.
2. **Project card: working-now rows** (dashboard): replaces "N agents working"; max 2 rows + "+N more"; rows open the
   task. Depends on 1.
3. **Server summary: next ready task** (cli): `next`, `ready_count`, `waiting`; shares `atm next`'s rule.
4. **Project card: next line** (dashboard). Depends on 3.
5. **Project card: first item needing you inline** (dashboard). Depends on T-200.
6. **Server summary + card: branch and open PRs** (cli, dashboard), if E is wanted.
7. **Server summary + card: last finished task** (cli, dashboard), shown only when idle, if F is wanted.
8. **`meta.description`** (cli, dashboard), if G's description is wanted: setting it, the summary field, the line.
9. **Card layout pass** (dashboard): the band order and the 4-row cap of §3, screenshots at the narrowest width.
