# Progress tab review (T-212)

Status: **proposal for review**. For each chart and number on the Progress tab and in the header's Progress widget:
what it shows, how it's computed, when it misleads, the question it answers, a recommendation (*keep*, *change*,
*drop*) and the help it gets.

**Help, three kinds** (one new component, `InfoTip`, for the second):
- **Tooltip** (`title`): one line on hover, for a single number or bar.
- **Info popover**: an ⓘ next to a section title; click opens a small popover with *What it shows*, *How it's
  counted* and *When to be careful*. Closes on Escape or a click outside, like the header widgets.
- **Empty state**: a sentence in place of the chart when there's nothing meaningful to draw, saying why and what
  makes it appear.

## 0. Filters: whole project, or the filtered tasks?

Today every part of the Progress tab uses the page's filters and search (`historyFiltered`), except the **pace**
(always measured on all tasks). The header widget ignores them. So with a filter on, "Phase 19: 3/5 done" means
*3 of the 5 matching tasks in phase 19*, and nothing on the tab says so. Every explanation below ("how much is left
in this phase", "finished by") silently changes meaning.

The filters are: search, phase, type, status, label, priority, stage and agent (*started by*).

### Option 1: the Progress tab ignores filters

- **Gains:** every number means the whole project or the whole phase; estimates match what `/atm:loop-tasks` will
  actually do (it works through whole phases); the tab and the header widget agree; simpler explanations.
- **Loses:**
  - a burndown or phase progress **for a slice**: a label (`security` across phases), a type (bugfixes), a
    priority (how are the P0s going?), one agent's tasks;
  - the phase filter as a way to focus (row click on the phase table still does that);
  - consistency with the other tabs: switching to Progress would "drop" the filter the user just set, which needs
    a visible note (*Filters don't apply here*) to not look like a bug.

### Option 2: keep filters, and say so everywhere

- **Gains:** slices keep working; the same filter means the same tasks on every tab.
- **Loses / costs:**
  - **Estimates for a slice are wrong in kind**: "phase 19 finished by" for matching tasks only, while the loop
    works the whole phase in order; the cumulative estimate ignores unmatched tasks before them.
  - **Some filters make the tab meaningless**: a *status* filter (only done tasks → remaining is always 0; only
    to-do tasks → nothing is ever done) and a *stage* filter.
  - Every label needs a "matching" qualifier (*Phase 19 · 3 of 5 matching tasks*), and a banner on the tab: *Showing
    12 of 236 tasks: label security · Clear filters*.

### Recommendation: option 2, with two limits

- A **banner** at the top of the tab whenever a filter or search is on, naming them, with *Clear filters*; titles and
  tooltips say *matching tasks*.
- The **status and stage filters don't apply** on this tab (progress *is* the status split); the banner says
  *Status filter not applied here*.
- **Estimates stay whole-phase**: the *Finished by* column is computed on all tasks, like the pace, and its tooltip
  says so; the slice gets only its own counts, bar and burndown lines.

This keeps "how are the security tasks going?" while every forecast keeps meaning what the loop will do.

## 1. The tab, top to bottom

### 1.1 Scope row: "All phases" / "Phase N" and *Show all phases*

- **Shows:** which tasks the burndown covers; a phase row click focuses it.
- **Misleads:** nothing tells you that clicking a phase row does this; "All phases" looks like a heading.
- **Answers:** "what am I looking at?"
- **Recommend: change.** Make it the burndown's title: *Burndown · all phases* / *Burndown · phase 19* with the ⓘ
  and the *Show all phases* button, and a hint under the phase table: *Click a phase to see its burndown*.

### 1.2 Burndown chart

- **Shows:** two step lines over time: **Scope** (tasks created so far, skipped ones left out) and **Remaining**
  (scope minus done). From *now*, a dashed **forecast** line to the estimated finish, with a fan for its range.
- **Computed:** scope steps up at each `created_at`, remaining steps down at each completion. Archived tasks count
  (the tab loads the archive). Blocked and in-review tasks stay in *Remaining*, but the forecast ends at their count,
  not at 0 (they wait on someone, not on agent work).
- **Misleads:**
  - **A long project squashes the forecast to a sliver.** The x-axis runs from the first task ever created; on this
    repo (months of history, a forecast of hours) the forecast is a few pixels, rescued only by its *done ≈* label.
  - **Scope arrives in big steps.** Tasks are added a phase at a time, so scope jumps; that's honest, but without
    a word it reads like "work exploded".
  - **The forecast ends above zero** when tasks are blocked or in review, and nothing says why.
  - **Filters** change the lines (they're filtered tasks) but not the pace (measured on all tasks): fine, but
    invisible.
- **Answers:** "are we getting closer to done, and when?"
- **Recommend: change.**
  - A **time range** for the x-axis: *All time* · *Since this phase started* (default when a phase is focused) ·
    *Last 14 days*. "Since the focused or first unfinished phase started" as the default for *All phases* keeps the
    forecast readable.
  - When the forecast ends above zero, label its end *N waiting on review or a decision*.
  - ⓘ: what Scope and Remaining are; that blocked and in-review tasks are left for people; that filters apply.
  - Empty state when no task has timestamps: *No timeline yet: tasks get times when agents start and finish them.*

### 1.3 "Active phases only"

- **Shows:** hides finished phases except the most recent one, in the table and the header widget.
- **Misleads:** with it off, a long project shows a long list of finished phases (or, in the header popover, tens of
  100% rings) that say nothing new.
- **Recommend: replace it.** Show **finished phases compactly instead of hiding them** (see 2.2): in the table, one
  collapsed row *✓ Phases 0–17 · 180 tasks · last finished 24 Oct* that expands to the per-phase rows; in the
  popover, one line of small check chips. Then the checkbox isn't needed and goes away.

### 1.4 Estimate basis line

*"Estimates are based on the last 10 completed tasks: about 12 m each (8 m – 20 m). Phases are worked in order, like
`/atm:loop-tasks`."*

- **Computed:** each task's work time (`started_at` until it asked for a review or was completed; for tasks without a
  start, the gap since the previous completion, capped at 30 m). The pace is the median of the last 10, the range
  the 25th–75th percentile.
- **Misleads:**
  - **One agent, in series.** Remaining tasks × pace assumes one agent doing one task at a time. With parallel
    agents the calendar estimate is too pessimistic.
  - **Interactive tasks distort it.** A task that waits on the user while *in progress* (an interactive review,
    like this one) counts its waiting as work; a task restarted after its lease expired measures only from the
    restart.
  - **Unlike tasks.** A docs task and a big refactor count the same.
- **Answers:** "how trustworthy are the estimates?"
- **Recommend: change.**
  - Leave out tasks labelled `interactive` (and time spent blocked) from the pace, and say so.
  - Keep assuming one agent working in series, and say so: *Assumes one agent, one task at a time; parallel
    agents finish sooner.*
  - Move the paragraph into the burndown's ⓘ and keep one short line: *Pace: ~12 m per task (last 10 tasks)*.

### 1.5 Phase table

Columns: **Phase · Done (n/total, skipped) · Progress bar · Remaining (blocked, in review) · State · Estimate**.

- **Misleads:**
  - **Done, the bar and State say the same thing three times**; State adds only "not started vs in progress".
  - **"≈ 3 h of agent work"** is cumulative: it includes the earlier unfinished phases (phases are worked in order).
    Reasonable, but nobody would guess it.
  - **"If the loop keeps running: tomorrow 14:00"** assumes a loop running non-stop from now.
  - A finished phase shows *Done* in two columns.
- **Answers:** "which phase are we in, and how much is left in each?"
- **Recommend: change.**
  - Drop the **State** column; show *not started* as a muted row and *done* with a check in the Phase cell.
  - Rename Estimate to **Finished by** and show the calendar time first (*≈ tomorrow 14:00*), with *3 h of agent
    work, including earlier phases* as the second line and in its tooltip.
  - ⓘ on the table: cumulative estimates, phase order, why blocked and in-review tasks aren't in them.
  - Phase **names** next to the badge (`atm phases name`); today only the number shows.

### 1.6 Agent utilisation

*"… of agent work over 64.2 days since the first task started"*, two cards (**24/7** and **working time**, 8 h on
weekdays), and a table per agent.

- **Computed:** each task's work span (start → review request or completion; to now while active), summed per agent,
  divided by the project's calendar time and by its working time.
- **Misleads:**
  - **Bug: it ignores archived tasks.** It uses the filtered *current* tasks, while the burndown above uses the
    history (archived tasks too) and the period starts at the first start among current tasks. After an
    `atm archive`, the period and the work both shrink, inconsistently.
  - **A whole-project average is a small, stale number.** "4% of calendar time over 64 days" says little about
    today; the Activity popup (agent time per day or week) already answers "how busy were the agents".
  - **The 8-hour working day** is arbitrary for agents, which run at night and on weekends.
  - **Per-agent rows** are one per session (`claude:e5ea9db0`), so a project quickly has dozens of rows.
- **Answers:** "are agents working most of the time, or waiting on me?"
- **Recommend: change, and move.** Fix the archive bug. Replace the section with three numbers that answer the
  question: **agent time**, **waiting on you** (time tasks spent in review or blocked on the user) and **idle**
  (no agent working), for the selected period (the burndown's range). Drop the working-day basis and the per-session
  table (the Agents tab has them). This overlaps T-213 (Activity popup) and T-214 (project stats): decide where it
  lives together with them.

## 2. Header Progress widget

### 2.1 The compact widget (ring + %)

- **Bug: archived tasks don't count.** It uses `tasks.json`'s tasks only, so after archiving 150 done tasks
  the percentage *drops*. The tab counts the archive.
- **Recommend: change.** Count archived tasks (the archive's count is in `meta.archived`; no need to load it for
  the overall number), or say *of current tasks* in the tooltip. Tooltip: *62 of 120 tasks done (180 archived, done)*.

### 2.2 The popover

**Overall ring, status bar and legend · By phase rings · By type rings.**

- **Misleads:**
  - Same archive bug for every ring.
  - **By type** rings answer a question nobody asks ("are bugfixes 80% done?"); with 7 types it's mostly noise.
  - Many phases make many rings; *Active phases only* helps.
- **Recommend: change.**
  - Keep the overall ring and the status bar.
  - **By phase:** rings only for **unfinished** phases. **Finished phases** go on one line of small chips, ranges
    merged: `✓ 0–12` `✓ 14–17` (a phase with only skipped tasks counts as finished), each chip's tooltip naming
    the phases and when they finished; a click on a chip opens that phase on the Progress tab. Tens of 100% rings
    become one line, and *Active phases only* isn't needed.
  - **By type:** one **stacked bar** (done / remaining per type, in the type colours) with a legend, instead of
    rings.
  - A **Go to** section at the bottom, with the links: *Progress tab* (opens the tab), *In review (2)*,
    *Blocked (1)* and *In progress (3)* (each opens the Kanban with that status filter). The status legend's items
    link there too.

## 3. Summary

| # | Item | Recommendation | Help |
|---|---|---|---|
| 1.1 | Scope row | change: becomes the burndown's title, with a "click a phase" hint | ⓘ |
| 1.2 | Burndown | change: time range, label for what's waiting on people | ⓘ, empty state |
| 0 | Filters | keep, with a banner; status and stage filters off here; estimates whole-phase | banner |
| 1.3 | Active phases only | replace: finished phases collapse into one row | tooltip |
| 1.4 | Estimate basis | change: no interactive tasks in the pace, parallel agents, one short line | in the burndown's ⓘ |
| 1.5 | Phase table | change: no State column, *Finished by* first, phase names | ⓘ, tooltips |
| 1.6 | Agent utilisation | change and move: fix the archive bug; agent / waiting on you / idle | ⓘ |
| 2.1 | Header widget | change: count archived tasks | tooltip |
| 2.2 | Widget popover | change: finished phases as chips, By type as a stacked bar, a Go to section | — |

## 4. Decisions

1. **Burndown range:** default *since the first unfinished phase started*, *All time* one click away. *(agreed)*
2. **Parallel agents:** the estimate keeps assuming one agent, and says so in the ⓘ and the basis line. *(agreed)*
3. **Utilisation:** replaced on this tab by *agent time / waiting on you / idle*. *(agreed)*
4. **By type:** a stacked bar instead of rings. *(agreed)*
5. **Filters:** option 2 with the two limits in §0. *(approved)*
6. **Implementation:** follow-up tasks in phase 21 *Progress and insights*, next to the follow-ups of T-213 to
   T-216. *(approved with the review)*

## 5. Follow-up tasks

1. **Data fixes**: header widget and utilisation count archived tasks; utilisation uses the history.
2. **Filters on the Progress tab** (§0): banner, status and stage filters not applied, whole-phase estimates.
3. **Burndown**: title row with ⓘ, time range (default since the first unfinished phase), label for work waiting on
   people, empty state; pace leaves out `interactive` tasks and says it assumes one agent.
4. **Phase table**: finished phases in one collapsed row, no State column, *Finished by* first, phase names, ⓘ,
   *Active phases only* removed.
5. **Agent time / waiting on you / idle** replace the utilisation section.
6. **Header popover**: rings for unfinished phases, finished ones as chips, By type as a stacked bar, a *Go to*
   section.

An `InfoTip` component (the ⓘ popover) comes with the first task that needs it.
