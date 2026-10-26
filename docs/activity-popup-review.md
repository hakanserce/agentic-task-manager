# Activity popup review (T-213)

Status: **proposal for review**. The same pass as the Progress tab review (`docs/progress-tab-review.md`), for the
header's Activity widget and its popup (`ActivityWidget.svelte`, `ActivityDeepDive.svelte`, `insights.ts`). For each
item: what it shows, how it's computed, when it misleads, the question it answers, a recommendation (*keep*,
*change*, *drop*) and its help. Help uses the same three kinds as the Progress review: tooltip, ⓘ popover
(`InfoTip`, from T-240), empty state.

**Scope note.** Unlike the Progress tab, the Activity widget and popup **ignore the page's filters**: they always
show the whole project, archived tasks included (`dashboard.history`). That's right for a header widget; the ⓘ
should say so.

## 1. The compact widget (sparkline)

- **Shows:** bars of tasks completed per bucket over **all time**, and a line.
- **Computed:** the bucket is the smallest of 1 h, 3 h, … 30 days that keeps it under 36 bars. The line is a
  rolling average of the last three bars.
- **Misleads:**
  - The line is unlabelled; it reads like "cumulative" or "scope".
  - On a long project the bars are weeks; the last bar is the current, unfinished week, so the sparkline always seems
    to end in a drop.
- **Answers:** "are agents getting things done lately?"
- **Recommend: keep all time** (a fixed window like 14 days fails small or fast projects that do a lot in a few
  days), and fix what misleads: draw the **last bar lighter** (its period isn't over), and say what the line is in
  the tooltip: *Tasks completed per week, all time: 236 · the line is the average of the last 3 weeks · this week
  so far: 12*.

## 2. The popup header: period and presets

*Hour · Day · Week · Month · All · Custom*, with ‹ › for the stepped ones.

- **Recommend: keep.** Add an ⓘ on the heading for the whole popup: what *agent*, *idle* and *time per task* mean
  (shared definitions, §5), and that filters don't apply.

## 3. Key numbers (KPI row)

| Number | Computed | Misleads | Recommend |
|---|---|---|---|
| **Tasks completed** | completions in the period | — | **keep** |
| **Completion rate** (`/ hour` or `/ day`) | completions ÷ the period's calendar time, nights and idle time included | it mostly measures how much of the period agents ran, not how fast they work; overlaps with *tasks completed* | **drop** (the chart shows the rhythm; *time per task* shows speed) |
| **Typical time per task** | median of start → review request (or completion) for tasks completed in the period | mixes two different things: tasks agents do alone, and `interactive` tasks that include working with you; a lease-expired task measures only from its restart | **change** into **two medians in one card**: *agents alone* (tasks without the `interactive` label) and *with you* (`interactive` tasks). The first says what agents achieve alone, the second how you and the agents work together. (The forecast pace, T-240, still uses only the first.) |
| **Agents busy on average · N now** | average over buckets of the agents at work (an agent on two tasks counts once) | "1.3" is hard to read; "N now" counts distinct `started_by` of active tasks, not live claims, and says *now* even when looking at last month | **change** to **Agent time** (*14 h 20 m*, parallel agents add up); show *2 working now* only for a period that includes now, from the claims |
| **Idle (no agent working)** | gaps ≥ 10 min with no agent at work, from the first work in the period to its end | **nights, weekends and waiting on you all count as idle**: the 75 h the T-210 bug showed was mostly nights. It doesn't say whether agents had nothing to do or were waiting on a decision | **change** into two numbers: **Waiting on you** (time with no agent working while a task was in review or blocked on the user) and **Idle** (the rest: no agent working, nothing waiting on you) |

### 3.1 Layout: three cards instead of five boxes

Five or six equal boxes become a wall of numbers. Group them by question instead: **what got done**, **how long
tasks take**, and **where the time went**, the last one as a bar rather than three more numbers:

```
┌───────────────┐ ┌────────────────────────────┐ ┌──────────────────────────────────────────────────┐
│ 23            │ │ 18 m        │ 1 h 40 m     │ │ Where the time went                       ⓘ     │
│ tasks done    │ │ agents alone│ with you     │ │ ███████████████▒▒▒▒▒▒░░░░░░░░░░░░░░░░░░░░░░░░░ │
│               │ │ (19 tasks)  │ (4 tasks)    │ │ ■ Agents working 14 h   ▒ Waiting on you 6 h   │
│               │ │             │              │ │ ░ Idle 31 h · up to 3 agents in parallel         │
└───────────────┘ └────────────────────────────┘ └──────────────────────────────────────────────────┘
```

- **Tasks done**: one big number.
- **Time per task**: one card, two values side by side with their task counts; a side shows *–* when it has no
  tasks.
- **Where the time went**: one 100% bar over the period (from the first work on): *agents working* (at least one
  agent at work), *waiting on you* and *idle*, in the same colours and hatching as the charts below. Under it, the
  three durations, and the agent time with parallelism (*14 h of agent time, up to 3 agents at once*) as one line.
  The same component goes on the Progress tab (T-242).
- On narrow screens the cards stack; the bar keeps its full width.

The colours: *agents working* in the accent, *waiting on you* in the review/blocked colour, *idle* as the hatching
(T-210), so the bar is the key to the charts.

## 4. Charts

All three share one time axis and one hover; idle stretches are hatched behind them. **Each chart's title gets an
ⓘ** (`InfoTip`) with *what it shows*, *how it's counted* and *when to be careful*, as listed per chart below; the
KPI cards get one each too.

### 4.1 Tasks completed, by type

- **Shows:** stacked bars per bucket, coloured by type, with a type legend and counts.
- **Misleads:** little. Type colours are the dashboard's usual ones.
- **Answers:** "what got done, and when?"
- **Recommend: keep.** Clicking a bar could open the List tab filtered to those tasks (*later, optional*).

### 4.2 Agents working (stacked per agent)

- **Shows:** per bucket, how many agents were at work (1 = one agent the whole bucket), stacked per agent.
- **Misleads:**
  - **An agent is a session** (`claude:e5ea9db0`); a long project has dozens, coloured from five shades of the accent,
    so colours repeat and the legend gets long.
  - **Unattributed** work (tasks without `started_by`) isn't capped, so it can show "3 agents" for old data.
- **Answers:** "how much were agents working, and in parallel?"
- **Recommend: change.** Stack **by kind** instead of by session: *agents* vs *people* (the Agents tab already
  tells them apart), and draw **waiting on you** as its own band (the same colour as the Kanban's review/blocked),
  so the chart shows *working / waiting on you / idle* across time. Per-session detail stays in the hover tooltip
  and on the Agents tab. Empty state as today.

### 4.3 Time per task (dots)

- **Shows:** one dot per completed task at its completion time, height = its work time; a *typical* line (median).
- **Misleads:**
  - **One outlier flattens everything**: the scale goes to the slowest task, so a 20-hour interactive task pushes all
    others to the floor.
  - Same definition caveats as the KPI.
- **Answers:** "are tasks taking longer than usual? which ones stuck?"
- **Recommend: change.** Cap the scale at the 90th percentile and draw slower tasks as triangles on the top edge
  (their tooltip has the real time). `interactive` tasks are hollow dots with their own dashed median line (*with
  you*), next to the solid one (*agents alone*), matching the KPI card. Clicking a dot opens the task.

### 4.4 Hover tooltip

- **Recommend: keep**, with the new numbers per bucket (completed by type; working, waiting on you, idle; the first
  five tasks).

## 5. Shared definitions (one module, used by both views)

The Progress tab (T-242) and this popup show the same three time numbers. Define them once, in a module the two use:

- **Agent time**: the sum of work spans (start → review request or completion; to now while active), each agent's
  overlapping spans merged; parallel agents add up.
- **Waiting on you**: time with no agent working while at least one task was in review or blocked on the user. Needs
  each task's review and block intervals: `review_requested_at` → completion is known; block intervals need the
  block and unblock times (`atm` records them as notes; check they're enough, else add timestamps in atm).
- **Idle**: the rest of the period from the first work on, with no agent working and nothing waiting on you, in
  stretches of 10 min or more.

## 6. Clean-up

- `activitySeries` computes `cumulativeDone`, `scope` and `wip` for every bucket, but nothing shows them (left
  from an earlier design). **Drop them** (they cost a scan of all tasks per bucket).

## 7. Summary

| # | Item | Recommendation | Help |
|---|---|---|---|
| 1 | Sparkline | keep all time; last bar lighter; the line explained | tooltip |
| 2 | Period header | keep | ⓘ for the popup |
| 3 | KPIs | three cards: tasks done; time per task (alone / with you); where the time went (bar); drop the rate | ⓘ per card |
| 4.1 | Completed by type | keep | ⓘ |
| 4.2 | Agents working | change: agents / people / waiting on you, not per session | ⓘ, empty state |
| 4.3 | Time per task | change: p90 scale, outliers on the edge, interactive hollow with its own median | ⓘ, tooltip |
| 5 | Shared definitions | one module for Progress and Activity | — |
| 6 | Unused fields | drop | — |

## 8. Decisions

1. **Sparkline**: keep all time (with the fixes in §1).
2. **Waiting on you vs idle**: split them; atm records block and unblock times if the notes aren't enough.
3. **Agents chart**: by kind (agents / people), plus waiting on you.
4. **Time per task**: two medians, agents alone and with you.
5. **Implementation**: follow-up tasks in phase 21, together with the Progress ones (shared definitions and the
   *where the time went* bar serve both): T-244 (atm keeps block intervals), T-245 (shared time use and the bar;
   T-242 builds on it), T-246 (KPI cards), T-247 (agents chart), T-248 (time per task chart), T-249 (sparkline,
   ⓘs, clean-up).
