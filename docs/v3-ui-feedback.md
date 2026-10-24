# v3 UI: feedback round 2

**Status:** done · **Date:** 2026-10-24 · **Branch:** `dev/v3-ui`

Feedback on the 0.12.0 dashboard redesign (top bar, search, List and Agents tabs), made live on the dev server.

| # | Feedback | Change |
|---|---|---|
| 1 | The tab titles look detached from the content; tabs could have icons. | Tabs sit on the content panel as a connected tab strip (the selected tab merges into the panel), each with an icon. |
| 2 | Better tab names. | "Kanban" → "Kanban Board", "List" → "Task List". |
| 3 | The dependency graph doesn't use the page; it is squished vertically. | The views fill the rest of the window below the sticky top bar; the graph uses all of that height. |
| 4 | The Agents view hides filtered-out tasks. | It shows them greyed out instead, like the graph's "Dim" option. Lane stats count only the matching tasks. |
| 5 | The Agents view needs a **Live** mode. | A "Live" checkbox keeps the window pinned to now and moving with time; zooming keeps it live, panning into the past turns it off. Saved with the view. |
| 6 | Progress should show agent utilisation. | Agent work time (sum of task durations from start to completion, overlapping work of parallel agents counted per agent) against calendar time since the first task started: per 24-hour day including weekends, and per 8-hour working day excluding weekends. |
| 7 | The Activity panel's period ("per 1 hour") should be selectable. | A range selector: last hour, today, this week, this month, all time, custom (from/to). The bucket size follows the range. |
| 8 | The Activity panel is hard to understand; show completions per type and agent utilisation over time. Charts don't look like separate items. | The panel answers three questions, each in its own card with a title and legend: *Tasks completed, by type* (stacked bars); *Agents working* (each agent's busy share per period, stacked; 1 = one agent busy the whole period; agents in shades of the accent colour so they never look like a task type); *Time per task* (a dot per task in its type colour, with the typical time). Plain-language numbers on top: tasks completed, completion rate, typical time per task, agents busy on average and now. One hover reads a period across all three, with the tooltip beside it. "Done vs scope" and "Work in progress" are dropped (the burndown and the Agents tab cover them). |
| 9 | Show idle stretches. | Gaps of 10 minutes or more when no agent worked on any task (from the first start to now) are dashed yellow bands across all three charts, labelled "idle 30 m" in the agents chart, and the total is a headline number ("idle"). |
| 10 | The period picker needs yesterday, last week, last month: at midnight "Today" is empty, likewise on Mondays and the 1st. In a compact UI. | The picker is a unit selector (Hour, Day, Week, Month, All, Custom) plus a stepper: ‹ Today ›, ‹ Yesterday ›, ‹ Thu, Oct 22 ›; This week, Last week, Week of Oct 5; This month, Last month, August 2026. Earlier periods are whole; › stops at the current one. Saved with the view. |
