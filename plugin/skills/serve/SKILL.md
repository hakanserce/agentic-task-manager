---
name: serve
description: >
  Start, stop or check the local server for the project's task dashboard. Use when the user says "serve the
  dashboard", "start the dashboard", "open the dashboard", "stop the dashboard server", or "is the dashboard running".
allowed-tools: Bash(atm *)
---

# Serve the Dashboard

You start, stop or report the background HTTP server that shows this project's `tasks-dashboard.html`.
The plugin's `atm` command does the work; you run it and relay what it prints. Never read or edit `tasks.json` or
`tasks-archive.json` directly: `atm status`, `atm show` and `atm list` answer questions about the tasks.

## Step 1: Parse arguments

`$ARGUMENTS` may contain:

| Argument | Meaning |
|---|---|
| `start` (default) | Start the server, or report the one already running |
| `stop` | Stop this project's server |
| `status` | Say whether it runs, and where |
| `--open` | With `start`: also open the dashboard in the default browser |
| `--port N` | With `start`: try port N first (default 8000; the next free port is used if it's busy) |
| `--dir PATH` | Act on the project at PATH instead of the current one (e.g. stop another project's server) |

## Step 2: Run the helper

From the project root, run:

```bash
atm serve <action> [--open] [--port N] [--dir PATH]
```

(`atm` is atm-cli, the plugin's command; its `bin/` is on your PATH while the plugin is enabled. If the shell says
`atm: command not found`, write `"${CLAUDE_SKILL_DIR}/../../bin/atm"` instead.)

The helper:
- moves an old `docs/tasks.json` (or `tasks.json` in the root) into `.agentic-task-manager/` first, and makes sure
  the dashboard there is the plugin's current version;
- serves `.agentic-task-manager/` on `localhost` in a background process that keeps running after this session ends;
- only ever stops the server it started for this project.

If it exits with code 127, Python 3.9 or newer is not installed: atm needs it, so tell the user to install it.
For any other error, show its message.

## Step 3: Report

Relay the helper's output. After a successful `start`, add:

> **Dashboard:** <the URL it printed>
>
> It refreshes itself every 5 seconds, so you can watch an agent work through tasks with `/atm:loop-tasks`.
> The server keeps running in the background; stop it with `/atm:serve stop`.

If the output included a line about moving `tasks.json`, also say the move is staged (not committed) and that it
should be committed.
