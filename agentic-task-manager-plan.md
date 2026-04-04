# Agentic Task Manager — Claude Code Plugin Development Plan

**Repository:** https://github.com/hakanserce/agentic-task-manager
**Author:** Hakan Serce
**Date:** April 2026

---

## Table of Contents

1. [Overview & Goals](#1-overview--goals)
2. [Repository Setup for Claude Code Plugin](#2-repository-setup-for-claude-code-plugin)
3. [Core Assets: tasks.json Schema & Dashboard](#3-core-assets-tasksjson-schema--dashboard)
4. [Skill Development](#4-skill-development)
5. [Hook Development](#5-hook-development)
6. [Git Push Strategy Options](#6-git-push-strategy-options)
7. [Local HTTP Server Strategy](#7-local-http-server-strategy)
8. [Testing & QA](#8-testing--qa)
9. [Publishing & Marketplace](#9-publishing--marketplace)
10. [Announcement & Marketing](#10-announcement--marketing)
11. [Future Integrations & Vision](#11-future-integrations--vision)

---

## 1. Overview & Goals

The Agentic Task Manager is a Claude Code plugin that gives any project a lightweight, file-based task management system. An agent (or human) can decompose requirements into granular tasks, execute them one-by-one in a loop, and a human can watch progress live on an HTML dashboard served locally.

**Core value proposition:** One command to install, zero external dependencies beyond a local HTTP server, works with any programming language.

**What ships in the plugin:**

- A `tasks.json` schema and example file
- A single-file HTML dashboard (`tasks-dashboard.html`) with auto-reload
- Three skills: `/atm:create-tasks`, `/atm:do-task`, `/atm:loop-tasks`
- A hook (optional) that auto-updates task status on commit
- A README explaining setup and usage

---

## 2. Repository Setup for Claude Code Plugin

### Step 2.1 — Initialize the repo structure

Clone the repo and set up the standard Claude Code plugin directory layout:

```
agentic-task-manager/
├── .claude-plugin/
│   └── plugin.json            # Plugin manifest (required)
├── skills/
│   ├── create-tasks/
│   │   └── SKILL.md           # /atm:create-tasks
│   ├── do-task/
│   │   └── SKILL.md           # /atm:do-task
│   └── loop-tasks/
│       └── SKILL.md           # /atm:loop-tasks
├── hooks/
│   └── hooks.json             # Optional: auto-status-update hook
├── scripts/
│   ├── serve-dashboard.sh     # Detects available HTTP server and starts it
│   └── update-task-status.sh  # Used by hooks to update tasks.json
├── templates/
│   ├── tasks.json             # Example/template tasks.json
│   └── tasks-dashboard.html   # The dashboard HTML file
├── CLAUDE.md                  # Plugin-level context for Claude Code
├── README.md                  # User-facing documentation
├── LICENSE                    # MIT recommended for community adoption
└── .gitignore
```

**Key rule:** Components (skills/, hooks/, scripts/) must be at the plugin root, NOT inside `.claude-plugin/`. Only `plugin.json` goes inside `.claude-plugin/`.

### Step 2.2 — Create `plugin.json`

```json
{
  "name": "agentic-task-manager",
  "description": "File-based task management for agentic development. Decompose requirements into tasks, execute them in loops, and watch progress on a live HTML dashboard. Language-agnostic, zero external dependencies.",
  "version": "0.1.0",
  "author": {
    "name": "Hakan Serce",
    "email": "hakan@hakanserce.com"
  },
  "homepage": "https://github.com/hakanserce/agentic-task-manager",
  "repository": "https://github.com/hakanserce/agentic-task-manager",
  "license": "MIT",
  "keywords": [
    "task-management",
    "agentic",
    "dashboard",
    "project-management",
    "loop",
    "automation"
  ]
}
```

### Step 2.3 — Create `CLAUDE.md`

This file provides context to Claude Code when the plugin is active:

```markdown
# Agentic Task Manager Plugin

This plugin provides file-based task management for agentic development workflows.

## Key Files
- `tasks.json` in the project's `docs/` directory (or project root) holds all task definitions
- `tasks-dashboard.html` is a self-contained HTML dashboard served via local HTTP

## Task Schema
Each task has: id, name, phase, type (feature/bugfix/test/infra/docs/refactor), 
description, dependencies (array of task IDs), status (todo/in_progress/done), 
requirements (array), use_cases (array), files (array of file paths).

## Conventions
- Task IDs follow the pattern: T-001, T-002, etc. (or T-P0-01 for phased projects)
- Status transitions: todo → in_progress → done
- Dependencies must be completed (status: done) before a task can start
- The dashboard auto-reloads from tasks.json via HTTP fetch
```

### Step 2.4 — Set up git basics

```bash
git clone https://github.com/hakanserce/agentic-task-manager.git
cd agentic-task-manager
# Create the directory structure
mkdir -p .claude-plugin skills/create-tasks skills/do-task skills/loop-tasks
mkdir -p hooks scripts templates
# Create initial files (plugin.json, CLAUDE.md, README.md, LICENSE)
# First commit
git add -A
git commit -m "feat: initialize plugin structure"
git push origin main
```

---

## 3. Core Assets: tasks.json Schema & Dashboard

### Step 3.1 — Define the canonical tasks.json schema

Place in `templates/tasks.json`. The schema should be generic (not SerPDF-specific):

```json
{
  "meta": {
    "project": "My Project",
    "created": "2026-04-03",
    "description": "Task definitions for the project."
  },
  "tasks": [
    {
      "id": "T-001",
      "name": "Example task",
      "phase": 1,
      "type": "feature",
      "description": "A detailed description of what this task involves.",
      "requirements": ["FR-1.1"],
      "use_cases": ["UC-001"],
      "status": "todo",
      "dependencies": [],
      "files": ["src/example.ts"]
    }
  ]
}
```

**Accepted values:**
- `type`: `feature`, `bugfix`, `test`, `infra`, `docs`, `refactor`, `polish`
- `status`: `todo`, `in_progress`, `done`, `blocked`, `skipped`
- `phase`: integer (0, 1, 2, ...) — user-defined phases
- `dependencies`: array of task ID strings
- `requirements`, `use_cases`, `files`: arrays of strings (all optional)

### Step 3.2 — Generalize the dashboard

Take the existing `docs/tasks-dashboard.html` from SerPDF and make it project-agnostic:

1. Replace hardcoded "SerPDF Task Dashboard" with a title read from `tasks.json` → `meta.project`
2. Replace hardcoded phase names (`PHASE_NAMES` map) with auto-generated labels from the data
3. Make the type badge colors dynamically determined (support arbitrary types beyond the original 4)
4. Remove SerPDF-specific references
5. Keep all existing features: filters, dependency graph, detail panel, auto-refresh, stats bar
6. Add a "Setup instructions" fallback message when `tasks.json` fails to load, explaining how to start the HTTP server

Place the generalized dashboard in `templates/tasks-dashboard.html`.

### Step 3.3 — Commit

```bash
git add templates/
git commit -m "feat: add generic tasks.json schema and dashboard template"
git push origin main
```

---

## 4. Skill Development

Skills are the heart of the plugin. Each is a markdown file with YAML frontmatter that instructs Claude Code how to behave when invoked.

### Step 4.1 — `/atm:create-tasks` Skill

**File:** `skills/create-tasks/SKILL.md`

This skill decomposes project requirements into granular tasks. It must be generic about where requirements live.

```markdown
---
name: create-tasks
description: >
  Analyze project requirements and decompose them into granular tasks in tasks.json.
  Use when starting a new project, adding a feature set, or when the user says
  "create tasks", "break down requirements", "plan tasks", or "decompose into tasks".
---

# Create Tasks from Project Requirements

You are a task decomposition agent. Your job is to analyze project requirements
and create a granular task list in `tasks.json` format.

## Step 1: Find Requirements

Search the project for requirement sources in this priority order:

1. **PRD / Product Requirements Document** — look for files matching:
   `**/PRD.md`, `**/prd.md`, `**/product-requirements*`, `**/requirements.md`
2. **Use Cases** — look for: `**/use-cases*`, `**/usecases*`, `**/UC-*`
3. **ADRs (Architecture Decision Records)** — look for: `**/adrs/**`, `**/ADR-*`
4. **ROADMAP** — look for: `**/ROADMAP.md`, `**/roadmap*`
5. **GitHub Issues / TODO files** — look for: `**/TODO.md`, `**/BACKLOG.md`
6. **README with feature descriptions** — `README.md`
7. **Existing tasks.json** — if one exists, load it and extend/update rather than overwrite

If no requirement documents are found, **ask the user**:
> "I couldn't find requirement documents (PRD, use cases, ADRs, roadmap) in this
> project. Could you tell me:
> 1. Where are your requirements documented? (file path or URL)
> 2. Or would you like to describe the requirements now and I'll create tasks from them?"

## Step 2: Analyze and Decompose

For each requirement or feature:
- Break it into tasks that a single agent can complete in **under 10 minutes**
- Each task should be independently testable/verifiable
- Include implementation tasks, unit test tasks, and integration test tasks
- Identify dependencies between tasks (a task cannot start until its deps are done)
- Assign phases: group related tasks into sequential phases (0, 1, 2, ...)
- Assign types: `feature`, `bugfix`, `test`, `infra`, `docs`, `refactor`

## Step 3: Generate tasks.json

Create or update `tasks.json` in the project root (or `docs/` directory if that
convention is already established). Use this structure:

```json
{
  "meta": {
    "project": "<project name>",
    "created": "<today's date>",
    "description": "<brief project description>"
  },
  "tasks": [
    {
      "id": "T-001",
      "name": "<short descriptive name>",
      "phase": <integer>,
      "type": "<feature|bugfix|test|infra|docs|refactor>",
      "description": "<detailed description of what to do>",
      "requirements": ["<FR-x.x or similar>"],
      "use_cases": ["<UC-xxx>"],
      "status": "todo",
      "dependencies": ["<T-xxx>"],
      "files": ["<expected file paths>"]
    }
  ]
}
```

## Step 4: Set up the dashboard

If `tasks-dashboard.html` doesn't exist in the same directory as `tasks.json`:
1. Copy it from the plugin's templates directory
2. Tell the user how to start the dashboard:

> **Dashboard ready!** Start a local server to view it:
> ```
> cd <tasks-dir> && python3 -m http.server 8000
> ```
> Then open http://localhost:8000/tasks-dashboard.html
>
> Enable auto-refresh in the dashboard to watch progress live.

## Step 5: Summary

After creating tasks, output a summary:
- Total tasks created
- Breakdown by phase, type, and status
- Dependency chain depth (longest path)
- Suggested starting tasks (those with no unmet dependencies)

If `$ARGUMENTS` is provided, use it as the requirements source or description.
```

### Step 4.2 — `/atm:do-task` Skill

**File:** `skills/do-task/SKILL.md`

```markdown
---
name: do-task
description: >
  Execute a single task from tasks.json. Updates status to in_progress, does
  the work, runs verification, then marks it done. Use when the user says
  "do task T-xxx", "work on task", "implement task", or "pick a task".
---

# Do a Single Task

You are a task execution agent. You pick up one task from `tasks.json`,
implement it, verify it, and mark it done.

## Step 1: Load tasks.json

Read `tasks.json` from the project root or `docs/` directory.

## Step 2: Select a task

If `$ARGUMENTS` specifies a task ID (e.g., "T-005"), use that task.

If no specific task is given, select the **next available task** using this logic:
1. Filter tasks with `status: "todo"`
2. From those, find tasks whose ALL dependencies have `status: "done"`
3. Prefer the lowest phase number first, then lowest task ID
4. If no task is available, report: "All tasks are either done, in progress,
   or blocked by unfinished dependencies."

## Step 3: Validate dependencies

Before starting, verify ALL dependency tasks have `status: "done"`.
If any dependency is not done, report which dependencies are blocking and stop.

## Step 4: Mark as in_progress

Update `tasks.json`: set the selected task's `status` to `"in_progress"`.
Write the file immediately so the dashboard reflects the change.

## Step 5: Execute the task

Read the task's `description` carefully. Implement what it says:
- For `feature` tasks: write the code described
- For `test` tasks: write the tests described
- For `bugfix` tasks: find and fix the bug described
- For `infra` tasks: set up the infrastructure described
- For `docs` tasks: write the documentation described
- For `refactor` tasks: refactor the code as described

Use the `files` array as hints for which files to create or modify.

## Step 6: Verify

After implementation:
- If the project has a test runner, run relevant tests
- If the project has a linter, run it on changed files
- If the project has a build step, verify it still builds
- Review your own changes for obvious issues

## Step 7: Mark as done

If verification passes, update `tasks.json`: set `status` to `"done"`.
Write the file immediately.

## Step 8: Report

Output a summary:
- Task ID and name
- What was done (brief)
- Files created or modified
- Test results (if applicable)
- Next available tasks (tasks now unblocked by this completion)
```

### Step 4.3 — `/atm:loop-tasks` Skill

**File:** `skills/loop-tasks/SKILL.md`

This is the "Ralph Wiggum style" loop — the agent picks up tasks one after another
until there are none left (or it hits a stopping condition).

```markdown
---
name: loop-tasks
description: >
  Loop through available tasks in tasks.json, executing them one by one
  until all are done or no more can be started. Use when the user says
  "loop tasks", "do all tasks", "run the task loop", or "Ralph Wiggum it".
---

# Loop Tasks (Ralph Wiggum Mode)

You are a task loop agent. You continuously pick up the next available task,
execute it, and move on — like Ralph Wiggum: "I'm helping!"

## Configuration

Parse `$ARGUMENTS` for optional flags:
- `--phase <N>`: Only work on tasks in phase N
- `--type <type>`: Only work on tasks of a specific type
- `--max <N>`: Stop after completing N tasks (default: unlimited)
- `--dry-run`: Show which tasks would be executed without doing them
- `--pause`: Pause and ask for user confirmation between each task
- `--commit`: Git commit after each completed task
- `--push`: Git push after each completed task (implies --commit)
- `--batch-push`: Git commit after each task, push after all tasks complete
- `--push-every <N>`: Git commit after each task, push every N tasks

If no arguments, run all available tasks with no pausing and no auto-push.

## The Loop

```
while true:
    1. Read tasks.json (fresh read each iteration — it may have been
       edited externally by the human watching the dashboard)
    2. Find the next available task:
       - status == "todo"
       - all dependencies have status == "done"
       - matches --phase and --type filters if specified
       - prefer lowest phase, then lowest ID
    3. If no task available → EXIT the loop
    4. If --max reached → EXIT the loop
    5. Mark task as "in_progress" in tasks.json (write immediately)
    6. Execute the task (same as /atm:do-task Step 5)
    7. Verify the task (same as /atm:do-task Step 6)
    8. Mark task as "done" in tasks.json (write immediately)
    9. If --commit or --push or --batch-push:
       - git add -A
       - git commit -m "feat(T-xxx): <task name>"
    10. If --push:
        - git push
    11. If --push-every <N> and completed_count % N == 0:
        - git push
    12. If --pause:
        - Ask user: "Completed T-xxx. Continue to next task? (y/n)"
    13. Loop back to step 1
```

## On Exit

When the loop ends, output a summary:
- Tasks completed this session (list of IDs and names)
- Tasks remaining (todo count)
- Tasks blocked (and what's blocking them)
- If --batch-push was set: `git push` now
- Total time estimate or token usage if available

## Error Handling

If a task fails verification:
- Set its status back to `"todo"` (not "done")
- Log the failure reason
- Continue to the next available task (skip the failed one this iteration)
- Report failed tasks in the exit summary
```

### Step 4.4 — Commit skills

```bash
git add skills/
git commit -m "feat: add create-tasks, do-task, and loop-tasks skills"
git push origin main
```

---

## 5. Hook Development

### Step 5.1 — Optional: Post-commit status update hook

Create `hooks/hooks.json` to auto-update task status when a commit message references a task ID:

```json
{
  "hooks": [
    {
      "event": "PostToolUse",
      "matcher": "Bash",
      "type": "command",
      "command": "${CLAUDE_PLUGIN_ROOT}/scripts/update-task-status.sh"
    }
  ]
}
```

Create `scripts/update-task-status.sh`:

```bash
#!/usr/bin/env bash
# Reads stdin JSON from Claude Code hook system
# If the Bash command was a git commit with a task ID reference,
# this script updates tasks.json accordingly.
# This is optional and can be disabled by the user.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Only process git commit commands
if [[ "$COMMAND" == git\ commit* ]]; then
  # Extract task ID from commit message (pattern: T-xxx or T-Px-xx)
  TASK_ID=$(echo "$COMMAND" | grep -oP 'T-[A-Z0-9]+-[0-9]+|T-[0-9]+' | head -1)
  if [ -n "$TASK_ID" ]; then
    # Find tasks.json
    TASKS_FILE=""
    for f in tasks.json docs/tasks.json; do
      if [ -f "$f" ]; then
        TASKS_FILE="$f"
        break
      fi
    done
    if [ -n "$TASKS_FILE" ]; then
      # Update status to done using jq
      if command -v jq &> /dev/null; then
        jq --arg id "$TASK_ID" \
          '(.tasks[] | select(.id == $id) | .status) = "done"' \
          "$TASKS_FILE" > "${TASKS_FILE}.tmp" && mv "${TASKS_FILE}.tmp" "$TASKS_FILE"
      fi
    fi
  fi
fi
```

Make it executable: `chmod +x scripts/update-task-status.sh`

---

## 6. Git Push Strategy Options

The loop-tasks skill supports multiple push strategies. Document these clearly in the README:

| Flag | Behavior | Best For |
|---|---|---|
| *(no flag)* | No git operations | Manual control, reviewing before commit |
| `--commit` | `git commit` after each task | Local history, push manually later |
| `--push` | `git commit` + `git push` after each task | Real-time remote backup, CI triggers |
| `--batch-push` | `git commit` after each task, single `git push` at end | Clean remote history, fewer CI runs |
| `--push-every 5` | `git commit` after each, `git push` every 5 tasks | Balance between real-time and batching |
| `--pause` | Ask user between tasks | Human-in-the-loop approval |
| `--pause --push` | Ask user, then commit+push if approved | Maximum control |

**Commit message convention:** `feat(T-001): Short task name` — the task ID in the commit message allows traceability.

---

## 7. Local HTTP Server Strategy

The dashboard requires HTTP (not `file://`) because it fetches `tasks.json` via XHR. The plugin should detect what's available and suggest the right command.

### Step 7.1 — Create `scripts/serve-dashboard.sh`

```bash
#!/usr/bin/env bash
# Detect available HTTP server and serve the dashboard directory.
# Usage: serve-dashboard.sh [port] [directory]

PORT=${1:-8000}
DIR=${2:-.}

cd "$DIR" || exit 1

if command -v python3 &> /dev/null; then
  echo "Starting Python HTTP server on port $PORT..."
  echo "Dashboard: http://localhost:$PORT/tasks-dashboard.html"
  python3 -m http.server "$PORT"
elif command -v python &> /dev/null; then
  echo "Starting Python 2 HTTP server on port $PORT..."
  python -m SimpleHTTPServer "$PORT"
elif command -v npx &> /dev/null; then
  echo "Starting npx serve on port $PORT..."
  npx serve -p "$PORT"
elif command -v php &> /dev/null; then
  echo "Starting PHP built-in server on port $PORT..."
  php -S "localhost:$PORT"
elif command -v ruby &> /dev/null; then
  echo "Starting Ruby HTTP server on port $PORT..."
  ruby -run -e httpd "$DIR" -p "$PORT"
else
  echo "ERROR: No HTTP server found. Install one of: python3, node/npx, php, ruby"
  exit 1
fi
```

### Step 7.2 — Reference in skills

Each skill that mentions the dashboard should use the serve script or at minimum tell the user how to start it. The `create-tasks` skill already includes instructions.

---

## 8. Testing & QA

### Step 8.1 — Manual testing during development

Use the `--plugin-dir` flag to test without installing:

```bash
cd /path/to/your-test-project
claude --plugin-dir /path/to/agentic-task-manager
```

Then test each skill:
1. `/atm:create-tasks` — does it find requirements or ask for them?
2. `/atm:do-task T-001` — does it execute a specific task and update tasks.json?
3. `/atm:loop-tasks --max 3 --pause` — does it loop through 3 tasks with pauses?

### Step 8.2 — Hot-reload during development

While Claude Code is running with `--plugin-dir`, use `/reload-plugins` after making changes to skill files. No need to restart the session.

### Step 8.3 — Test the dashboard

1. Create a sample `tasks.json` with diverse statuses
2. Run `scripts/serve-dashboard.sh 8000 .`
3. Verify: filters work, dependency graph renders, detail panel opens, auto-refresh works
4. Modify `tasks.json` manually → verify dashboard updates on refresh

### Step 8.4 — Test on a real project

Test the plugin on a fresh project (not SerPDF) to verify it's truly language-agnostic. Try it on a Python project, a Node.js project, or a Rust project.

---

## 9. Publishing & Marketplace

### Step 9.1 — Self-hosted marketplace (your own repo)

The simplest route: make your GitHub repo itself a marketplace. Create `.claude-plugin/marketplace.json` at the repo root:

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "hakanserce-plugins",
  "version": "1.0.0",
  "description": "Agentic development plugins by Hakan Serce",
  "owner": {
    "name": "Hakan Serce",
    "email": "hakan@hakanserce.com"
  },
  "plugins": [
    {
      "name": "agentic-task-manager",
      "description": "File-based task management for agentic development. Decompose requirements into tasks, execute them in loops, and watch progress on a live HTML dashboard.",
      "version": "0.1.0",
      "source": ".",
      "category": "project-management",
      "homepage": "https://github.com/hakanserce/agentic-task-manager"
    }
  ]
}
```

Users install with:
```bash
# Add marketplace
/plugin marketplace add hakanserce/agentic-task-manager

# Install plugin
/plugin install agentic-task-manager@hakanserce-plugins
```

Or directly from the repo without a marketplace:
```bash
/plugin install https://github.com/hakanserce/agentic-task-manager.git
```

### Step 9.2 — Submit to Anthropic's official marketplace

Anthropic maintains `anthropics/claude-plugins-official`. To get listed:

1. Ensure your plugin meets quality standards: has README, LICENSE, clear descriptions, and tested skills
2. Go to the plugin directory submission form (linked from the `claude-plugins-official` repo)
3. Fill out the submission with your repo URL, description, and category
4. Wait for review — Anthropic reviews for quality and security
5. Once approved, your plugin appears in every Claude Code user's `/plugin` → Discover tab

### Step 9.3 — Submit to community marketplaces

Several community-curated marketplaces accept submissions:

- **awesome-claude-code-plugins** (`ccplugins/awesome-claude-code-plugins`) — open a PR to add your plugin to their list
- **awesome-claude-code** (`hesreallyhim/awesome-claude-code`) — open a PR under the "Project Management" section
- **wshobson/commands** — if they accept external plugin references

### Step 9.4 — Versioning strategy

Use semantic versioning in `plugin.json`:
- `0.1.0` — initial release, skills work but may have rough edges
- `0.2.0` — dashboard generalization, hook support
- `1.0.0` — stable release after community feedback
- Bump versions by updating `plugin.json` and pushing to main. Users run `/plugin marketplace update` to get the latest.

---

## 10. Announcement & Marketing

### Step 10.1 — Blog post on blog.hakanserce.com (learnforeverblog)

Write a detailed blog post covering:

- **Title idea:** "I Built a Task Manager for AI Agents — Here's How It Works"
- The problem: agents lose track of what to do in large projects
- The solution: tasks.json + dashboard + loop skills
- Demo: walkthrough with screenshots of the dashboard + terminal showing the loop
- Architecture: how the plugin is structured, how skills work
- How to install: one-command setup
- The "Ralph Wiggum" loop: the fun angle of an agent saying "I'm helping!" while cranking through tasks
- Link to the repo

### Step 10.2 — Reddit

Post to these subreddits:

- **r/ClaudeAI** — primary audience, mention it's a Claude Code plugin
- **r/ChatGPTCoding** — broader agentic coding audience
- **r/programming** — if the blog post is substantial enough
- **r/devtools** — tool-focused community

**Post format:** Link post to your blog, with a short text description. Keep it conversational, not salesy. Focus on the problem you solved and the "Ralph Wiggum loop" as a hook.

### Step 10.3 — Hacker News

Submit your blog post to HN as a "Show HN":

> **Show HN: Agentic Task Manager — A Claude Code plugin for AI-driven task loops with a live dashboard**

HN tips:
- Post the blog link, not the GitHub link (more substance)
- Be active in comments for the first few hours
- Focus on the technical design decisions (file-based vs database, language-agnostic, etc.)
- The "Ralph Wiggum" angle is memorable but don't overdo it on HN — lead with the technical value

### Step 10.4 — X/Twitter

Thread format:
1. "I built a task manager that lets AI agents loop through your project's tasks while you watch progress on a live dashboard 🔄"
2. Screenshot of the dashboard with tasks moving from todo → in_progress → done
3. "It's a Claude Code plugin. One command to install, works with any language."
4. Short demo GIF or video clip
5. Link to blog post and repo

### Step 10.5 — Claude Code community channels

- Share in the Claude Code Discord / community forums (if they exist)
- Comment on relevant GitHub discussions in `anthropics/claude-code`

---

## 11. Future Integrations & Vision

### 11.1 — OpenAI Codex CLI Integration

OpenAI's Codex CLI is an emerging competitor to Claude Code. The task management concepts (tasks.json, dashboard, loop execution) are tool-agnostic. Future work:

- **Codex CLI custom commands:** Codex supports custom instructions via markdown files. Port the skill prompts to Codex's format.
- **Shared tasks.json:** The file format is universal JSON — any agent tool can read/write it.
- **Dashboard stays the same:** The HTML dashboard is pure client-side JavaScript. It works regardless of which agent is modifying tasks.json.
- **Adapter layer:** Create a thin wrapper that detects whether the user is running Claude Code or Codex CLI, and loads the appropriate skill format.

### 11.2 — Cursor / Windsurf / Aider Integration

These tools use different extension mechanisms but the same pattern applies:
- Cursor: `.cursorrules` file can reference task management conventions
- Aider: convention files and architect mode can incorporate task-based workflows
- Windsurf: Cascade rules can reference tasks.json

The key insight: **tasks.json is the universal interface.** Any agent that can read JSON and write files can participate in the task loop.

### 11.3 — Multi-agent Coordination

Future vision for parallel task execution:

- Multiple Claude Code instances (or subagents) each claim different tasks
- A locking mechanism in tasks.json (e.g., `"assigned_to": "agent-1"`) prevents conflicts
- The dashboard shows which agent is working on which task
- A coordination protocol for task handoff

### 11.4 — GitHub Issues / Linear / Jira Sync

Bidirectional sync between tasks.json and external project management tools:
- MCP server that syncs tasks.json ↔ GitHub Issues
- MCP server for Linear or Jira integration
- Dashboard could link to external issue URLs

### 11.5 — AI-Powered Task Estimation

Use the agent itself to estimate task complexity and time. Add optional fields:
- `estimated_minutes`: AI estimate of how long the task takes
- `actual_minutes`: tracked automatically by the loop
- `complexity`: low/medium/high based on description analysis
- Dashboard could show burndown charts with these estimates

### 11.6 — Plugin Ecosystem

The agentic-task-manager could become a platform:
- Other plugins could depend on it for task management
- Custom task types (e.g., `deploy`, `review`, `security-scan`) with specialized execution logic
- Task templates for common project types (React app, API server, CLI tool)

---

## Implementation Checklist

Use this as your own tasks.json for building the plugin:

| # | Task | Status |
|---|---|---|
| 1 | Initialize repo with plugin directory structure | ☐ |
| 2 | Create plugin.json manifest | ☐ |
| 3 | Create CLAUDE.md with plugin context | ☐ |
| 4 | Generalize tasks.json schema (remove SerPDF specifics) | ☐ |
| 5 | Generalize dashboard HTML (dynamic project name, types, phases) | ☐ |
| 6 | Write /atm:create-tasks SKILL.md | ☐ |
| 7 | Write /atm:do-task SKILL.md | ☐ |
| 8 | Write /atm:loop-tasks SKILL.md | ☐ |
| 9 | Create serve-dashboard.sh script | ☐ |
| 10 | Create optional hooks.json + update-task-status.sh | ☐ |
| 11 | Write comprehensive README.md | ☐ |
| 12 | Add MIT LICENSE | ☐ |
| 13 | Test with --plugin-dir on a fresh project | ☐ |
| 14 | Test on a project with existing PRD/requirements | ☐ |
| 15 | Test on a project with NO requirements (should prompt user) | ☐ |
| 16 | Test dashboard with various tasks.json sizes | ☐ |
| 17 | Create .claude-plugin/marketplace.json for self-hosting | ☐ |
| 18 | Push v0.1.0 tag | ☐ |
| 19 | Submit to awesome-claude-code-plugins | ☐ |
| 20 | Submit to Anthropic official marketplace | ☐ |
| 21 | Write blog post for blog.hakanserce.com | ☐ |
| 22 | Post to Reddit (r/ClaudeAI, r/programming) | ☐ |
| 23 | Submit Show HN | ☐ |
| 24 | Post X/Twitter thread | ☐ |
