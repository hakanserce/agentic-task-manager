# Project cards: what they should show — proposal

Status: **draft, for review** (T-191). Nothing here is decided until the user has reviewed it; the follow-up tasks
in §6 are added with `/atm:create-tasks` only after that.

## 1. The problem

The overview (`#overview`, `ProjectsOverview.svelte` / `ProjectCard.svelte`) is where someone looks to answer
*"which of my projects needs me, and what is going on in each?"*. Today a card shows:

| What | From `api/projects` summary |
|---|---|
| name (opens the project), "N need you" chip | `name`, `needs_you.review + needs_you.blocked_on_user` |
| one overall progress bar, `done / total`, `%` | `done`, `total`, `skipped`, `percent` |
| the current phase: `Phase 3 · Polish — 1 / 4` | `current_phase` |
| "2 agents working" | `agents_working` |
| "12 m ago" and a 14-day completions sparkline | `last_activity`, `completions_14d` |

What is wrong with it:

- **The overall bar barely moves.** Projects worked on incrementally sit at 80–90 % forever (T-192 says the same).
- **Counts without names.** "2 agents working" and "2 need you" don't say *on what*; you have to open the project.
- **Nothing about what comes next**, and nothing about the git side (branch, open PR, CI), which is where work waits
  most often in the `pull-request` workflow.
- **No identity.** Every card looks the same; projects are told apart only by their name.

The card is small: the grid is `minmax(280px, 1fr)`, so the narrowest content box is about **246 px** wide. Whatever
we add must fit there, and a card should stay **scannable in about two seconds**.

## 2. Principles

1. **Attention first.** What needs the user goes at the top and is clickable (T-200 makes the chip open the task).
2. **Names over counts**, but capped: at most 2–3 names per list, then "+N more".
3. **Recent over total.** Show where the project is *now* (recent phases, last finished task), not its lifetime.
4. **Same size for every card**, so the grid stays aligned: sections that have nothing to show collapse to one muted
   line, not to nothing.
5. **The server does the work.** The summary stays small and precomputed (`api/projects` is polled for every project);
   the dashboard never fetches each project's `tasks.json` for the overview.

## 3. Options

Each option has a sketch at the narrowest width, what the summary must add, and its cost.

### A. Recent phases as rings (already planned: T-192, T-193)

```
 ◔ 25%   ◑ 50%   ● 100%  ● 100%
  P17     P16     P15     P14
```

- **Summary:** `recent_phases: [{id, name, done, total, percent}]`, up to 4 (T-192).
- **Pros:** answers "where is it now" at a glance; replaces the bar that doesn't move.
- **Cons:** phase numbers mean little without names (the `title` and `aria-label` carry them).
- **Verdict:** keep, as the card's progress row.

### B. What agents are doing now

```
 🤖 T-188 One title bar for every page
 🤖 T-191 Brainstorm: what project cards…
    +1 more
```

- **Summary:** `working: [{task, name, agent, branch}]`, live claims only, capped at 3, newest claim first. The claims
  store already has `task`, `agent`, `branch` and `worktree`; the name comes from `tasks.json` (or the worktree's copy,
  as `api/p/<id>/worktrees` does).
- **Pros:** the most useful line while loops are running; shows parallel agents on different branches.
- **Cons:** goes stale between polls (fine: the overview already polls); long names need one-line ellipsis.
- **Verdict:** yes — replace "N agents working" with the names.

### C. Tasks that need you, with their names

```
 ● Needs you
   T-194 Check the phase rings live…   blocked
   T-191 Brainstorm: what project…      review
```

- **Summary:** `needs_you.tasks: [{id, name, reason}]` — T-200 already adds this for the chip's list.
- **Pros:** the reason to open the overview at all.
- **Cons:** takes the most room; with T-200 the chip already lists them in a popup.
- **Verdict:** show **the first one inline** under the head (one line, ellipsis) and keep the chip for the full list.
  If nothing needs the user, the line is not there (the one exception to principle 4: its absence *is* the signal).

### D. The next ready tasks

```
 Next: T-190 Project card: a long phase name…
```

- **Summary:** `next: [{id, name}]`, up to 2, by the loop's rule (`atm next` without claiming: lowest phase, priority,
  id; dependencies done; not claimed).
- **Pros:** tells you whether starting a loop there would do anything; empty means blocked or finished.
- **Cons:** less urgent than B and C; partly redundant when agents are already working.
- **Verdict:** one line, shown only when no agent is working (otherwise B takes the slot).

### E. Git: branch, open PR, CI

```
 ⎇ dev/phase-17 · PR #12 open · CI ✓
```

- **Summary:** `git: {branch, ahead, pr: {number, url, state}}` from the main worktree's branch and the newest PR
  recorded on tasks (`atm pr` writes `pr` on tasks; `meta.repository` builds the URL). **CI state is not known to
  atm** today: getting it means calling `gh` or the forge's API from the server, which is slow, needs auth and
  network, and doesn't fit a summary polled every few seconds.
- **Pros:** shows work waiting on review/merge, which nothing else on the card does.
- **Cons:** the CI part is expensive and forge-specific (T-161 handled GitHub/GitLab/Bitbucket only for links).
- **Verdict:** branch + latest open PR (from tasks) now; **CI later**, if at all, behind an opt-in and a cache.

### F. Last finished task and when

```
 ✓ T-189 Status bar pinned to the bottom · 12 m ago
```

- **Summary:** `last_done: {id, name, completed_at}`.
- **Pros:** cheap; "12 m ago" today says *something* happened, this says *what*. Good for idle projects.
- **Cons:** overlaps with the sparkline as an "is it alive" signal.
- **Verdict:** yes — it replaces the bare "12 m ago" in the footer.

### G. Project logo and description

```
 [▣] Agentic Task Manager
     Task manager for agentic coding
```

- **Summary:** `has_logo` / `logo` (T-196), and `description` from `meta.description` (new, optional; set by
  `atm init --meta-file`).
- **Pros:** identity — cards become recognisable without reading.
- **Cons:** a description takes a whole line on every card for little daily value.
- **Verdict:** logo yes (T-196/T-197, monogram fallback); description only in the name's `title`, not on the card.

### Rejected / later

- **Burndown or forecast per project** — needs history the summary doesn't carry; the project page has it.
- **Per-label or per-type counts** — noise at this size.
- **Free-text notes from the latest task** — unpredictable length.

## 4. Recommended layout

Fixed order, top to bottom, at 246 px:

```
┌──────────────────────────────────────────┐
│ [▣] Agentic Task Manager    ( 2 need you )│  head: logo, name, chip (T-197, T-200); the chip's
│                                          │    popup lists the tasks (no inline line, decided)
│  ◔ 25%   ◑ 50%   ● 100%  ● 100%          │  recent phases (A: T-192/T-193)
│   P17     P16     P15     P14            │
│                                          │
│ 🤖 T-188 One title bar for every page     │  working now (B), or "Next: …" (D)
│ 🤖 T-191 Brainstorm: what project…        │    when no agent works
│ ⎇ dev/phase-17 · PR #12 open             │  git: branch + latest PR (E, no CI, decided)
│ ✓ T-189 Status bar pinned… · 12 m ago  ▁▃▅│  last done (F) + 14-day sparkline
└──────────────────────────────────────────┘
```

- Every text line is one line with ellipsis and the full text in `title`.
- The working/next section has a fixed height of 2 lines (third agent becomes "+N more"), so cards align.
- The overall `done / total` moves into the rings row's `title` (or a tiny muted label), as T-193 leaves open.
- The current-phase line goes: the rings replace it.

### Summary additions, all together

```json
"summary": {
  "...": "existing fields stay",
  "recent_phases": [{ "id": 17, "name": "Polish", "done": 2, "total": 16, "percent": 13 }],
  "needs_you": { "review": 1, "blocked_on_user": 1,
                 "tasks": [{ "id": "T-194", "name": "Check the phase rings live", "reason": "blocked" }] },
  "working": [{ "task": "T-188", "name": "One title bar for every page", "agent": "claude:e5ea9db0", "branch": "dev/phase-17" }],
  "next": [{ "id": "T-190", "name": "Project card: a long phase name stays on one line" }],
  "last_done": { "id": "T-189", "name": "Status bar pinned to the bottom", "completed_at": "2026-10-26T05:53:00Z" },
  "git": { "branch": "dev/phase-17", "pr": { "number": 12, "url": "https://github.com/…/pull/12", "state": "open" } }
}
```

All of it comes from `tasks.json`, the claims store and `.git/HEAD`, which the server already reads for the summary
and the worktrees, so the ETag rules don't change. Names are capped (e.g. 80 characters) to keep the response small
for many projects.

## 5. Questions for the user

*Reviewed and approved on 2026-10-26. Questions 1, 4 and 5 went unanswered, so they follow the recommendation:
the order as in §4, the project-wide count in the rings' tooltip, and `meta.description` only as the name's
tooltip.*

1. Is the order right — needs-you, phases, working/next, git, last done? Or should "working now" come before the
   rings?
2. ~~Show the first task needing you inline (C), or rely on the chip's popup only (T-200)?~~ **Decided: the chip's
   popup only.** No inline line on the card.
3. ~~Git line: branch + latest PR, or CI state too?~~ **Decided: branch and latest PR**, from tasks; no `gh` call.
4. The **whole project's** count, the small line under the rings today ("9 / 18 done · 2 skipped" and "50%"): once
   the rings show the recent phases, keep that project-wide line, move it into the rings' tooltip only, or drop it?
   (The per-phase counts stay under each ring either way.)
5. `meta.description`: worth adding at all, if it only shows in a tooltip?

## 6. Follow-up tasks (to add after review)

1. **Server summary: working, next, last done** — `working`, `next`, `last_done` in `api/projects`; scenarios; docs.
2. **Server summary: git branch and latest PR** — `git.branch`, `git.pr` from tasks; scenarios; docs.
3. **Project card: working now / next** — names instead of the agent count; one-line rows; "+N more".
4. **Project card: git line and last finished task** — branch and latest PR (no CI); replaces "12 m ago".
5. **Project card layout pass** — fixed section order and heights, screenshots at 280 px and wide.

Dropped after review: the first task needing you inline (the chip's popup, T-200, covers it) and CI state on cards.

Already planned and part of this layout: T-192/T-193 (recent phases as rings), T-196/T-197 (logos), T-199/T-200
("needs you" opens the task), T-190 (long phase name on one line, superseded by the rings once T-193 lands).
