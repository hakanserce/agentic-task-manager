This dashboard shows your project's tasks from `.agentic-task-manager/tasks.json`, live: it reloads every 5 seconds
while agents work through the tasks. It only reads the file; agents and the `atm` command change it.

Jump to: [the views](#views), [filters and saved views](#filters-and-saved-views),
[statuses](#statuses-and-kinds), [priorities](#priorities), [the skills](#the-skills),
[agents in parallel](#running-agents-in-parallel).

## The top bar

- **Progress** — the share of tasks done. Click it for the split by status, phase and type.
- **Activity** — tasks completed over time. Click it for the details: completions by type, agents at work, time per
  task and idle stretches, for a period you choose.
- **Refresh** — reload now, or change how often the dashboard reloads by itself.
- **Appearance** — light or dark mode, and the theme.

## Views

- **Dependency Graph** — tasks as boxes, in the order their dependencies allow. Drag to move, use the buttons or
  Ctrl/⌘ + scroll to zoom. Click a task for its details.
- **Kanban Board** — a column per status. To Do shows which tasks are ready and which one the loop takes next.
  Group the board by phase, or show skipped tasks, with the options above it.
- **Task List** — every task as a card, in the file's order or by priority.
- **Agents** — who worked on what, and when: a lane per agent with a bar per task. Zoom and move the time range, or
  tick **Live** to follow the current time.
- **Progress** — each phase's progress and an estimate of the agent work left, a burndown chart, and how busy the
  agents have been.

## Filters and saved views

**Filters** narrows every view by phase, type, status and priority; the search box matches task IDs, names,
descriptions and types. Within a group, any selected value matches; across groups, all must match. Each button says
how many tasks it would show.

The dashboard remembers your filters, search, tab and options **per project**, so they are back the next time you
open it. **Reset view** forgets them.

## Statuses and kinds

Each status has a **kind**, which decides what it means:

- **To Do** (kind `todo`) — not started.
- **In Progress** (`active`) — an agent is working on it.
- **In Review** (`review`) — the work is finished and waits for approval by you or another agent. Cards say how long
  it has waited. It doesn't count as agent work.
- **Blocked** (`blocked`) — it can't go on for now.
- **Done** (`done`) — finished. Only done tasks let the tasks that depend on them start.
- **Skipped** (`skipped`) — won't be done.

A project can name its own statuses in `tasks.json`; they look like the built-in status of their kind. **About**
lists the ones this project uses.

## Priorities

Agents take tasks phase by phase and, within a phase, the most urgent first:

- **P0** Critical / Required
- **P1** High
- **P2** Medium (tasks without a priority count as this)
- **P3** Low / Nice to have

## The skills

Run these in Claude Code:

- `/atm:create-tasks` — turn your requirements into tasks.
- `/atm:do-task` — do one task: the next available one, or the one you name.
- `/atm:loop-tasks` — keep doing tasks until none is left.
- `/atm:serve` — start or stop this dashboard's server.
- `/atm:update-dashboard` — update this dashboard to the plugin's latest version.

## Running agents in parallel

Several agents can work on one project at once, in one checkout or in separate git worktrees: each agent claims the
task it works on, so no two take the same task, and the Kanban board shows who works on what. See
[Running agents in parallel](https://github.com/hakanserce/agentic-task-manager#running-agents-in-parallel) in the
README.
