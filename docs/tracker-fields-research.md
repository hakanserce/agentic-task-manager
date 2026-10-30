# Tracker fields research: what atm could learn from Jira, GitHub, Linear and others

Preliminary work for moving atm from **phases** to **sprints and releases**. This document surveys how established
issue trackers model work, lists the fields atm doesn't have, and proposes which ones to add, with sprints and
releases in the most detail. Sections 1 to 7 propose; section 8 has the questions that had to be settled before a
design, now answered (*Decided*), with the sprint workflow the answers call for in 8.1. Where an answer overrides a
proposal (phases are migrated to sprints, not kept beside them), section 8 wins.

Tools surveyed: Jira, GitHub Issues and Projects, Linear, GitLab, Azure Boards, Shortcut and YouTrack (sources in
section 9).

## 1. Summary

- **A phase does four jobs today**, and the strain shows: it is the loop's **order** ("lowest phase first"), a
  **sprint** (a batch of work on one branch, `dev/phase-24`), a **release** (one PR per branch, one plugin version)
  and sometimes a **theme** ("Themes", "Security fixes"). Phase 24 shipped as 0.22.0 with 2 of its 6 tasks done,
  and the other 4 now ride along on `dev/phase-25`: the release ended, the phase didn't.
- **Every surveyed tool separates *when* from *what ships***: a timebox (Jira sprint, GitHub iteration, Linear
  cycle, GitLab iteration, Azure iteration path) and a delivery target (Jira fix version, GitHub milestone, GitLab
  milestone, YouTrack fix version). atm should do the same: **sprint** and **release** as two fields, each a list
  in `meta` with its own dates and state.
- **The other fields every tool has and atm lacks**: a **component** (area of the product), a **parent** (epic),
  an **estimate**, **dates** (start, due), an **assignee** distinct from the agent holding the claim, a
  **resolution** for finished work (done, won't do, duplicate), and **relations** beyond "depends on" (relates to,
  duplicates).
- **Recommended now** (with the sprint and release model): `sprint`, `release`, `components`. **Planned with them**:
  a `review` mode per task (`blocker`, `async`, `batch`, `none`; what the `interactive` label half-does today),
  review states (waiting for review, changes requested, approved), a `resolution` for finished work, and relations
  (`related`, `duplicate_of`). **A follow-up document**: `parent` (epics), which raises its own questions.
  **Not recommended yet**: story points (atm measures real working time already), time tracking, watchers, custom
  fields.
- atm has things the trackers don't, and the new fields should build on them: **measured agent working time**
  (`started_at` to `completed_at`), **commits and PRs on tasks**, and **files on tasks**. Components can match
  `files` by path, a release can know its PR and version, and a sprint's forecast can come from measured time
  instead of guessed points.

## 2. What atm has today

From [v4/data-model.md](v4/data-model.md) section 4, with the closest tracker concept for each:

| atm field | Closest tracker concept | Notes |
|---|---|---|
| `id`, `name`, `description` | key, summary, description | Markdown description |
| `type` (`meta.types`) | issue type | GitHub: org-level issue types; Jira: per scheme |
| `status` (`meta.statuses`, six kinds) | status and status category | the same idea as Jira's status categories |
| `priority` (`meta.priorities`) | priority | |
| `labels` | labels, tags | free-form; `meta.labels` only describes them |
| `phase` (`meta.phases` names) | sprint, milestone, release and epic at once | the subject of this document |
| `dependencies` | "is blocked by" link | the only kind of relation |
| `requirements`, `use_cases` | links to requirements | traceability; unusual in trackers |
| `files` | none | atm-specific: where the work happens |
| `created_by`, `started_by`, `completed_by` | reporter, assignee (loosely) | `started_by` is who *took* it, not who *should* |
| `created_at` … `completed_at`, `blocks`, `reviews` | created, resolved, history | atm measures working time from these |
| `notes` | comments | typed: outcome, handoff, review, rejection, failure, answer |
| `commit`, `pr`, `merged_at` | development panel (Jira), linked PRs (GitHub) | atm records them itself |
| `skipped` kind | resolution "Won't do" | but no reason field or duplicate link |

### What a phase does today

| Job | Where | What breaks without it |
|---|---|---|
| Order of work | `atm next`: lowest phase, then priority, then ID; `/atm:loop-tasks --phase N` | the loop has no "do this first" |
| Scope of a batch | `atm list --phase`, `atm archive --phase`, the dashboard's Phase filter, phase table, per-phase progress | the dashboard loses its main grouping |
| Time box | branch `dev/phase-N`, the burndown's "phase" range, the per-phase forecast | burndown and forecast lose their range |
| Release | one combined PR per release branch, which this repo names after the phase | nothing in the data: the link is a habit |
| Theme | names like "Themes", "Security fixes" | a grouping that labels or a parent could carry |

This repository has 26 phases (0 to 25), 2 to 46 tasks each. The early ones were numbered batches; from phase 15 on
they are named, and the names read like sprint goals ("Dashboard polish and worktrees") or themes ("Themes").

## 3. How the trackers model work

### 3.1 At a glance

| | Hierarchy | Timebox | Delivery target | Product area | Estimate |
|---|---|---|---|---|---|
| **Jira** | epic → story / task → sub-task (`parent`) | sprint (one open sprint per issue) | fix version(s), affects version(s) | components | story points; original / remaining estimate, time spent |
| **GitHub** | sub-issues (parent / child) | iteration field in Projects, with breaks | milestone (one per issue); releases are git tags | none built in (labels or a custom field) | issue field "Effort" (default since 2026) |
| **Linear** | initiative → project → issue → sub-issue | cycle (team-wide, automatic, 1–8 weeks) | project with milestones | team, labels, label groups | estimate with a chosen scale |
| **GitLab** | epic → issue → task | iteration, in cadences | milestone; a release links milestones | labels, scoped labels (`area::ui`) | weight; time tracking |
| **Azure Boards** | epic → feature → story → task | iteration path (a tree, e.g. `Release 1\Sprint 3`) | the iteration tree's upper levels | area path (a tree) | story points or effort; remaining work |
| **Shortcut** | objective → epic → story | iteration | epics or objectives with dates | team, product area (custom field) | estimate (points scale) |
| **YouTrack** | parent / subtask links | sprint on an agile board | fix versions, affected versions, fixed in build | subsystem | estimation, spent time |

### 3.2 Fields by tool

| Field | Jira | GitHub | Linear | GitLab | Azure | Shortcut | YouTrack | atm |
|---|---|---|---|---|---|---|---|---|
| Sprint / iteration / cycle | ✓ | ✓ (Projects) | ✓ | ✓ | ✓ | ✓ | ✓ | phase |
| Release / fix version / milestone | ✓ | milestone | project or milestone | milestone | iteration tree | — | ✓ | phase |
| Affects version | ✓ | — | — | — | — (field on bugs varies) | — | ✓ | — |
| Component / area | ✓ | — | team, labels | scoped labels | area path | product area | subsystem | labels |
| Parent / epic | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Estimate | ✓ | ✓ | ✓ | weight | ✓ | ✓ | ✓ | measured time only |
| Start / due date | ✓ | ✓ | due date | due date | target date | deadline | ✓ | — |
| Assignee | ✓ | ✓ (several) | ✓ | ✓ (several) | ✓ | owners | ✓ | `started_by` (the claim) |
| Reporter | ✓ | author | creator | author | created by | requester | reporter | `created_by` |
| Resolution / close reason | ✓ | completed, not planned, duplicate | canceled, duplicate | — | reason field | — | ✓ | `skipped` kind |
| Relations | blocks, duplicates, relates, clones | blocked by, sub-issues | blocks, related, duplicate | blocks, relates | many link types | blocks, relates, duplicates | many link types | `dependencies` |
| Severity (separate from priority) | custom | custom | — | ✓ (incidents) | ✓ (bugs) | custom | custom | — |
| Health / status update | — | — | project updates (on track, at risk, off track) | health status | — | — | — | — |
| Custom fields | ✓ | issue fields (25 per org) and project fields | — (labels) | — | ✓ | ✓ | ✓ | — |

## 4. Sprints and releases in the trackers

### 4.1 Sprints (timeboxes)

| | Jira sprint | GitHub iteration | Linear cycle | GitLab iteration | Azure iteration |
|---|---|---|---|---|---|
| Has | name, goal, start, end | name, start, length; breaks between | number, start, end; cooldown | title, start, due; cadence | path, start, end |
| States | future, active, closed | past, current, upcoming (by date) | upcoming, current, completed | upcoming, current, closed | past, current, future |
| Created | by hand | by the field's schedule | automatically, up to 15 ahead | by the cadence, or by hand | by hand |
| Unfinished work at the end | moved to the backlog or the next sprint when the sprint is completed | moved by hand (bulk move per group) | rolls over to the next cycle | can roll over | moved by hand |
| An issue in | one open sprint (history keeps the past ones) | one iteration | one cycle | one iteration | one iteration |
| Reports | burndown, velocity, sprint report (completed, not completed, added) | charts in Projects | scope and progress graph, capacity from the last 3 cycles | burndown and burnup, by count or weight | burndown, velocity |

**What they share:** a sprint has a start and an end, one is current, and work belongs to at most one. Finishing a
sprint is an event: the unfinished work goes somewhere (the next sprint, or back to the backlog), and the report
of what got done and what didn't is kept. Linear says outright that cycles "are not tied to releases".

### 4.2 Releases (delivery targets)

| | Jira version | GitHub milestone | GitLab milestone / release | YouTrack version |
|---|---|---|---|---|
| Has | name, description, start date, release date | title, description, due date | title, start and due date; a release (tag) links milestones | name, release date, released, archived |
| States | unreleased, released, archived (overdue when past its date) | open, closed | active, closed | released, archived |
| An issue in | several fix versions, several affects versions | one milestone | one milestone | several fix versions |
| Gives | release notes from its issues, release hub (progress, warnings) | progress (% closed) | release notes, evidence | the version-based board: sprint = fix version |

**What they share:** a release has a name (usually the version), a target date, and a released state. Its scope is
the issues that name it, so progress is "done / all" and release notes can be drawn from its issues.

### 4.3 How sprints and releases relate

Three patterns:

1. **Independent** (Jira, Linear, GitHub): a task has a sprint and, separately, a fix version. A release can take
   several sprints, a sprint can deliver to several releases.
2. **Nested** (Azure): one tree, `Release 1\Sprint 3`; a sprint belongs to exactly one release.
3. **The same thing** (YouTrack's version-based board): each sprint *is* a fix version.

atm today is pattern 3 with a single field. Phase 24 shows why that doesn't last: a release was cut while some of
its tasks weren't ready.

## 5. Fields atm is missing

For each: what it is, why it would matter for atm, and a recommendation (**Adopt**, **Consider**, **Skip**).

### 5.1 Sprint — Adopt

A timebox for a batch of work, with a goal. In atm, a sprint is also where agents work, so it matters more than a
date range. It scopes the loop: `/atm:loop-tasks` takes the active sprint's tasks and stops when they are done,
instead of going on into the next batch nobody has reviewed. Its start and end give the burndown and the forecast
their range, which the "phase" range does today. Closing it records what got done and what was carried over, the
report every tool keeps.

Agents make one difference. A team's sprint is two weeks because people plan every two weeks; agents finish a task
in minutes. What sets an atm sprint's pace is the human: reviews, interactive tasks and the PR. So an atm sprint is
better described by **its goal and what it holds** than by its dates, and dates should be optional.

### 5.2 Release — Adopt

What ships together: in this repository, a plugin version (0.22.0) and a PR to `main`. atm already records `pr` and
`merged_at` on tasks; a release ties them together:
- **progress and readiness**: how many of its tasks are done, in a PR, merged;
- **release notes**: `plugin/CHANGELOG.md` and `plugin/WHATS-NEW.md` are written by hand from the tasks today; a
  release's task list is the draft (`atm release notes 0.23.0`);
- **"released"** as a state set when its PR merges, which `/atm:push` already sees (`atm merged`).

Single or several per task? Jira allows several fix versions (a fix shipped in 2.3 and backported to 2.2). That is
rare in a project like this; one release per task is simpler and enough. An **affects version** (where a bug was
found) is a bug-report field for products with users on old versions: Skip for now.

### 5.3 Component — Adopt

The area of the product a task touches: `dashboard`, `atm-cli`, `skills`, `ci`, `docs`. Jira components, GitLab
scoped labels, Azure area paths and YouTrack subsystems all do this; atm uses labels (`ux`, `theme`) for it today.

Why a field and not a label: a component can carry **data**, which a label can't:
- **paths**: `{id: "dashboard", paths: ["dashboard/**", "plugin/templates/**"]}`. atm knows each task's `files`, so it
  can suggest or check the component, and `/atm:create-tasks` can set it;
- **an owner** (Jira's component lead): who reviews tasks there, a person or an agent;
- **context for agents**: the doc or `CLAUDE.md` to read before working there, and the verify command for that part
  (only the dashboard needs Playwright).

Several components per task (Jira allows it), since a task can touch both `atm-cli` and `dashboard`.

### 5.4 Parent (epic) — a follow-up document

Every tool has a hierarchy; atm has none. Today phases named like themes ("Themes") and labels (`spike-2`) stand in
for it, and once phases become sprints, a theme that spans several sprints needs a home. But a parent changes more
than a field, and needs its own document. What it has to answer:
- **Display**: in a sprint, are the children shown under their parent, or the parent as one card with a progress
  bar? What if the children are in different sprints, or the parent is in none?
- **Dependencies**: does depending on a parent mean depending on all its children? Can a child depend on a task
  outside its parent? Do a parent's dependencies apply to its children?
- **Completion**: is a parent done when all its children are (automatically), or when someone says so? What about a
  skipped child, or a child added after the parent was done?
- **The loop**: a parent is never claimed itself; or is it, as the place to plan its children?
- **Sprints and releases**: does a parent have a sprint, or do its children? A release is "all children shipped".

Until then, labels with descriptions (`meta.labels`) group themes.

### 5.5 Interactive work and review modes — Adopt

**What `interactive` means today.** 14 tasks in this repository have the label (T-211 to T-283). atm doesn't know
it: no command, skill or loop reads it. It works because the agent reads the description, and because Hakan starts
these tasks himself. Two different things share the label:
- **the work is done together**: a live session where the user steers. T-280, T-282 and T-283 are built live on the
  dev server; T-277 is testing the archive together.
- **the result needs the user's decision**: the agent drafts, the user decides, the agent carries on. T-212 to T-216
  ("review every chart … with the user, then add the agreed helpers"), T-211, T-231 to T-233.

Both are about the user's time: during the work, or after it. The second is a **review**, and how and when it
happens is what a `review` field says:

| Mode | When the agent's work is committed | The agent or loop | Dependents | The review ends |
|---|---|---|---|---|
| `blocker` | `atm review`: in review | waits for the review: takes no other task (in a session, it asks the user now; an unattended loop stops) | wait | approved: done; changes requested: the agent goes on (5.6) |
| `async` | `atm review`: in review | goes on with other ready tasks; the review happens in parallel | wait | as above |
| `batch` | `atm done`, with a `review` note; the task joins the sprint's review | goes on | go on | at the end of the sprint, in the sprint's review task (below) |
| `none` | `atm done` | goes on | go on | there is none |

Today atm has only `async` (when "a review is asked for" by the description, the project's instructions or the user)
and `none` (otherwise), and the agent decides which by reading text. A field makes it explicit, shown on the card
and checked by atm (`atm done` on a `blocker` or `async` task refuses, as `atm done` on a todo task does).

**Where the mode comes from**: the task's `review`, else its component's (5.3), else the project's default
(`meta.review`; `none` when absent, which is today's behaviour). `/atm:create-tasks` proposes a mode for each task,
as it proposes a priority.

**`batch` in detail.** The first `batch` task in a sprint makes atm add a task to it, *End of S-25 review*. Each
`batch` task, when done, becomes one of its dependencies and gets its `review` note, so the review task is ready
only when all of them are done, and comes last in the sprint. The review task is itself `blocker`: a session with
the user going through the notes. What the user wants changed goes to follow-up tasks (or reopens the task, see 8),
and the review's outcome is its note. A sprint can't close while its review task is open.

**The "together" half** of `interactive` (the work itself needs the user) is not a review. It could stay a label
the loop learns to skip, or become a field (`with: user`) that keeps `atm next --claim` from taking the task in an
unattended loop, so only `/atm:do-task <id>` or a loop the user watches does. See 8.

### 5.6 Review states — Adopt

The review kind has one status (`in_review`), and a review ends in `done` or `reject` (back to `todo`, with a
`rejection` note). Three situations look the same, or don't show:

| State | Waits on | Today |
|---|---|---|
| **Waiting for review** | the reviewer | `in_review` |
| **Changes requested** | the agent | `reject` sends the task back to `todo`: it leaves review, its claim is gone, and any agent may take it with only the note to go on |
| **Approved** | the agent, to finish what the task still asks after approval (implement what was agreed, add follow-up tasks) | worked around: /atm:do-task Step 7b runs `atm reject --reason 'Approved; continuing with …'` then `atm start`, so an approval is recorded as a rejection |

GitHub's pull request reviews have the same three: review required, changes requested, approved.

Two ways to model them: several statuses of the `review` kind (`meta.statuses` allows that already, as with
`awaiting_user` and `awaiting_agent`), or a `review_state` field inside the one review status, like the Stages of Done
(DM-4.3). The field is better: every project gets the states without changing its vocabulary, and atm's rules stay
per kind. Commands: `atm review` (waiting), `atm request-changes` (or `atm reject`, staying in review), `atm approve`.
A task with changes requested or approved is work for an agent: `atm next` takes it before new tasks, and the
`reviews` history (`[{from, to}]`) records each round with its outcome.

### 5.7 Resolution — Adopt

A task ends `done` or `skipped`. Trackers say *why* it was closed (Jira: Done, Won't Do, Duplicate, Cannot
Reproduce; GitHub: completed, not planned, duplicate). atm has the reason of `atm skip` as text. A `resolution`
(`done`, `wont_do`, `duplicate`, `obsolete`; a project could name its own, like statuses) lets the dashboard count
"won't do" apart from work that was dropped as no longer needed, and link a duplicate to its original. It matters
once sprints close and carried-over work is triaged: some of it gets dropped, and why should be recorded.

### 5.8 Relations — Adopt

Only `dependencies` exists. Two more are in every tool:
- **`related`**: a link that doesn't block, both ways ("see T-123 for the same problem in the CLI"). Agents would use
  it when they find a connected task; the detail panel shows it with the dependencies.
- **`duplicate_of`**: one task ID, with the `duplicate` resolution. The original shows "duplicated by".

Both cheap to add, and the merge driver handles lists of IDs already.

### 5.9 Dates: start, due, target — Skip for tasks, Adopt for sprints and releases

Trackers put due dates on issues for people with calendars. atm's tasks are done by agents in minutes; a due date
belongs on the sprint (end) and the release (target date), where the dashboard can show "due in 3 days" and the
forecast can say whether it will make it.

### 5.10 Estimate (story points, effort) — Skip for now

Every tool has one, because people need it to plan a sprint's capacity and to forecast. atm measures real working
time (DM-4.1) and the forecast already uses it. Points would be a guess beside a measurement. One case for them: a
**relative size** (S / M / L) set by `/atm:create-tasks`, to forecast tasks unlike the past ones. Revisit if the
forecast is often off.

### 5.11 Severity — Skip

Separate from priority in Azure and in GitLab's incidents; elsewhere a custom field. For a project's own tasks,
priority covers it.

### 5.12 Custom fields — Skip for now

GitHub made issue fields generally available in July 2026 (single select, text, number, date; up to 25 per
organization), and Jira, Azure, Shortcut and YouTrack have them. For atm they would mean a field that agents, the
CLI and the dashboard don't understand. Better to add the few fields with meaning, and keep labels for the rest.
GitLab's **scoped labels** (`area::ui`, one value per scope) are a cheaper middle ground worth remembering.

### 5.13 Watchers, time tracking, attachments, environment — Skip

Watchers and notifications assume a hosted tool with many people; time tracking is what atm measures already;
attachments and environment belong to bug reports from users.

## 6. A preliminary model for atm

A sketch to discuss, not a design. Every field optional, files without them working as today (DM-6.1).

### 6.1 `meta`

```json
{
  "sprints": [
    { "id": "S-25", "name": "Themes", "goal": "A sticky-note theme, tried live", "release": "0.23.0",
      "state": "active", "start": "2026-10-28", "end": null },
    { "id": "S-26", "name": "Branding", "state": "planned" }
  ],
  "releases": [
    { "id": "0.22.0", "state": "released", "target": "2026-10-27", "released_at": "2026-10-27T23:14:20Z",
      "pr": { "number": 27, "url": "…" } },
    { "id": "0.23.0", "state": "planned", "target": null }
  ],
  "review": "none",
  "components": [
    { "id": "dashboard", "label": "Dashboard", "paths": ["dashboard/**", "plugin/templates/**"],
      "verify": "npm run verify", "review": "batch" },
    { "id": "atm-cli", "label": "atm-cli", "paths": ["atm-cli/**", "plugin/scripts/**", "tests/scripts/**"] }
  ]
}
```

- **Sprint states**: `planned`, `active`, `closed`; one active sprint at a time (Jira and GitLab allow one current
  per board or group). Dates optional; `start` is set when it becomes active, `end` when it closes.
- **Release states**: `planned`, `released` (set by `atm merged` when its PR merges, or by hand), `archived`.
- **Sprint → release**: a sprint may name the release it delivers to (pattern 2, nested, but optional). A task's
  release defaults to its sprint's.

### 6.2 Task fields

| Field | Meaning |
|---|---|
| `sprint` | a sprint ID, or none (the backlog) |
| `release` | a release ID; defaults to the sprint's release |
| `components` | component IDs; suggested from `files` |
| `review` | `blocker`, `async`, `batch` or `none`; defaults to the component's, then the project's (5.5) |
| `review_state` | in review only: `waiting`, `changes_requested`, `approved` (5.6) |
| `resolution` | done and skipped only: `done`, `wont_do`, `duplicate`, `obsolete` (5.7) |
| `related`, `duplicate_of` | task IDs (5.8) |

Later, after its own document: `parent`.

### 6.3 What changes

| Where | Today | With sprints and releases |
|---|---|---|
| `atm next`, the loop | lowest phase, then priority, then ID | active sprint first, then priority, then ID; `--sprint`; the loop stops at the end of the sprint (or goes on to the next planned one, see 8) |
| CLI | `atm phases`, `--phase` | `atm sprints` (list, add, start, close), `atm releases` (list, add, release, notes), `--sprint`, `--release`, `--component` |
| Closing a sprint | — | `atm sprints close S-25 --carry-to S-26`: unfinished tasks move on; the sprint keeps its report; refused while its review task is open |
| Finishing a task | the agent reads whether a review is asked for | the `review` mode decides: `atm done` or `atm review`, the loop waits or goes on, a `batch` task joins the sprint's review task |
| Reviews | `atm review`, `done`, `reject` (to `todo`) | `atm review`, `approve`, `request-changes`; changes requested and approved tasks go back to an agent through `atm next` |
| `/atm:push` | records `pr`, `merged_at` | also marks the release released when its PR merges |
| `/atm:create-tasks` | proposes phases | proposes a sprint (or the backlog) and components |
| Dashboard | Phase filter, phase table, burndown and forecast per phase | Sprint, Release and Component filters; a sprint header (goal, dates, progress); burndown per sprint; a release view (tasks, PR, notes) |
| Branches | `dev/phase-N` by habit | `dev/<release>` or `dev/<sprint>`, by habit still |

### 6.4 From phases

Phases keep working (read, filtered, shown) so no project has to move. A project moves when it chooses:
`atm migrate --phases-to-sprints` (or a command of its own) turns each phase into a sprint with the same name,
finished phases into closed sprints, and leaves `phase` on the tasks for history. Releases can't be recovered from
phases in general; for this repository, the PR on each task gives its release.

## 7. Features beyond fields

From the same tools, ranked by how much they would help atm:

| Feature | In | For atm |
|---|---|---|
| **Sprint report** (done, carried over, added mid-sprint) | Jira, Linear, GitLab | the record a closed sprint keeps; shown on the dashboard |
| **Release notes from tasks** | Jira, GitLab, GitHub (from PRs) | a draft of `CHANGELOG.md` and `WHATS-NEW.md` from the release's tasks |
| **Rollover of unfinished work** | Linear (automatic), Jira (on completing), GitHub (bulk move) | `atm sprints close --carry-to` |
| **Capacity and velocity** | Linear (last 3 cycles), Jira, GitLab | the forecast per sprint, from measured time |
| **Health / status update** | Linear projects, GitLab | a one-line "on track / at risk" for a release, written by the agent at the end of a loop |
| **Saved views and queries** | Jira (JQL), GitHub, Linear | the dashboard saves one view per project today; named views would be next |
| **Roadmap / timeline** | Jira, GitHub Projects, Linear | releases and sprints on a time axis, once they have dates |
| **Triage inbox** | Linear | tasks added by agents mid-sprint, waiting for a sprint |

## 8. Questions to settle

Each with a recommendation, to agree with or override. Settled with Hakan on 2026-10-30: each question's *Decided*
line is the answer, and 8.1 gathers the sprint workflow those answers call for.

1. **Sprint and release: nested or independent?** Section 6 sketches an optional link (a sprint names its release).
   Fully independent is more flexible; nested is simpler to show and to branch by.
   *Recommendation*: the optional link. A sprint delivers to at most one release, and a release takes one or more
   sprints, which fits one PR per release branch. A task's release defaults to its sprint's, and can be set without a
   sprint for backlog work aimed at a release.
   *Decided*: the optional link, as recommended.
2. **What the loop does at the end of a sprint**: stop (a human closes the sprint and starts the next), or go on to
   the next planned sprint? Stopping makes the sprint the review point; going on keeps agents busy.
   *Recommendation*: stop, and say what the sprint got done and what is left. A sprint with `batch` tasks ends in a
   `blocker` review anyway. `--continue` lets a loop go on to the next planned sprint.
   *Decided*: stop and report, as recommended.
3. **Backlog tasks** (no sprint): may the loop take them when the sprint is done, or never?
   *Recommendation*: never by default: the backlog is what nobody has planned yet. `--backlog` opts in.
   *Decided*: the loop gains a sprint option without losing what it does today. It still takes one task by ID, a
   list of tasks, or all tasks; its phase option becomes the sprint option, which is what it always meant: do a batch
   of tasks, the batch a sprint now defines. Taking backlog tasks is one of these explicit choices, never a default.
4. **Do sprints need dates at all?** A sprint with a goal and no end date is a milestone; dates matter for the
   burndown and for "due in N days".
   *Recommendation*: optional. `start` is set when the sprint becomes active and `end` when it closes, so the burndown
   always has a range. A planned end date (`due`) is optional, for "due in N days" and the forecast.
   *Decided*: an optional due date, as recommended, and with it the sprint workflow in 8.1: the backlog, sprint
   planning, closing a sprint, and moving tasks between sprints and the backlog.
5. **Release IDs**: the plugin version (`0.23.0`), or a name with a version field? Projects that don't version
   would want names.
   *Recommendation*: the ID is any string. This repository uses its versions; other projects use names ("Beta").
   No separate version field until something needs it.
   *Decided*: any string, as recommended.
6. **Components**: start with paths only, or with owners and per-component verify commands too?
   *Recommendation*: paths and the `review` default (5.5) first. Owners and verify commands come later, once routing
   reviews or partial verifies are actually wanted.
   *Decided*: paths and the review default, as recommended.
7. **The "together" half of `interactive`**: a field (`with: user`) the loop respects, or a label it learns to skip?
   *Recommendation*: a field. atm doesn't read labels, and shouldn't start to give one meaning. With `with: user`,
   `atm next --claim` skips the task unless the loop is started with the user present (`--with-user`), and
   `/atm:do-task <id>` always takes it. The dashboard shows it as "needs you".
   *Decided*: a field, `with: user`, as recommended.
8. **Phases**: keep them indefinitely beside sprints, or deprecate them once projects move?
   *Recommendation*: keep reading them indefinitely (DM-6.1), but stop proposing them: `/atm:create-tasks` proposes
   sprints, and the dashboard shows phases only for tasks that have one. Mark them deprecated in the docs.
   *Decided* (overrides the recommendation): migrate. A command turns each phase into a sprint (and, where a phase
   shipped as a version, its release), then phases are removed. The migration's details (which phases become which
   sprints and releases, archived tasks, what older atm versions do with the file) are for the design.
9. **`async` and dependents**: do dependents of a task in `async` review wait, as today, or may they start on the
   unreviewed work (and be revisited if the review asks for changes)?
   *Recommendation*: they wait, as today. Starting on unreviewed work risks rework; work cheap enough to risk it is
   what `batch` is for.
   *Decided*: they wait, as recommended.
10. **A change requested in the end-of-sprint review**: reopen the `batch` task (it stays in the sprint, which can't
    close yet), or add a follow-up task to the next sprint (the sprint closes; the work may already be in the PR)?
    *Recommendation*: a follow-up task in the next sprint, `related` to the original, which stays done. History stays
    true, and the sprint can close. Small fixes can still be made during the review session itself, since that task
    is `blocker` and live.
    *Decided*: a follow-up task, as recommended.
11. **Changes requested**: should `atm next` give the task back to the agent that did it when it is still running,
    or to any agent?
    *Recommendation*: prefer the agent that did it (`started_by`), since it has the context. If that agent doesn't
    claim the task within its lease time, any agent may.
    *Decided*: prefer the same agent, as recommended.

### 8.1 The sprint workflow

What the answers to questions 3 and 4 add to the model: a sprint is planned, worked and closed, and tasks move
between sprints and the backlog at any time.

- **The backlog**: tasks with no sprint. It is where new work lands until it is planned.
- **Sprint planning**: a discussion with the user. Review the backlog and what the previous sprint left unfinished,
  decide which tasks go into the sprint, and set its optional due date (and its release, question 1).
- **Working the sprint**: the loop with its sprint option (question 3) takes the active sprint's tasks and stops when
  they are done (question 2).
- **Closing a sprint**: a review of what it got done (the end-of-sprint review of its `batch` tasks, question 10).
  Its unfinished tasks move to the next sprint: chosen, if more than one is planned; created, if none is.
- **Moving tasks**, at any time:
  - from a sprint to the backlog (dropped);
  - from a sprint to the next one (pushed back);
  - from the backlog into the active sprint (pulled in).

## 9. Sources

- Jira: [Issue fields and statuses](https://confluence.atlassian.com/adminjiraserver/issue-fields-and-statuses-938847116.html),
  [Manage versions](https://confluence.atlassian.com/adminjiracloud/managing-versions-776636296.html),
  [Managing versions (older docs, version statuses and start date)](https://confluence.atlassian.com/display/JIRA064/Managing+Versions)
- GitHub: [About iteration fields](https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields/about-iteration-fields),
  [Evolving GitHub Issues and Projects (sub-issues, issue types)](https://github.blog/changelog/2025-04-09-evolving-github-issues-and-projects/),
  [Issue fields are now generally available](https://github.blog/changelog/2026-07-02-issue-fields-are-now-generally-available),
  [About issue fields](https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields/about-issue-fields),
  [Labels and milestones](https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work),
  [Hierarchy view and bulk iteration moves](https://github.blog/changelog/2026-03-05-hierarchy-view-improvements-and-file-uploads-in-issue-forms/)
- Linear: [Conceptual model](https://linear.app/docs/conceptual-model), [Cycles](https://linear.app/docs/use-cycles),
  [Planning features](https://Linear.app/features/plan)
- GitLab: [Iterations and cadences](https://docs.gitlab.com/ee/user/group/iterations/)
- Azure Boards: [About area and iteration paths](https://learn.microsoft.com/en-us/azure/devops/organizations/settings/about-areas-iterations),
  [Work item fields](https://learn.microsoft.com/azure/devops/boards/work-items/guidance/work-item-field)
- Shortcut: [Details of a Story](https://help.shortcut.com/hc/en-us/articles/360043978792-Details-of-a-Story),
  [Transition from Jira](https://help.shortcut.com/hc/en-us/articles/25894971621652)
- YouTrack: [Link sprints with fix versions](https://www.jetbrains.com/help/youtrack/server/link-sprints-fix-versions.html)

Where a detail isn't in these sources (Jira's resolution values and link types, GitLab's scoped labels and health
status, Linear's relations and estimate scales, GitHub's close reasons), it comes from the tools' documentation as I
know it and should be checked before a design depends on it.
