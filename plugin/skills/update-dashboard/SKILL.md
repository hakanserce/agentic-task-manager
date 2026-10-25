---
name: update-dashboard
description: >
  Update the project's tasks-dashboard.html to the latest version shipped with
  the plugin. Use when the user says "update dashboard", "refresh dashboard",
  "get latest dashboard", or "upgrade dashboard".
allowed-tools: Bash(atm *)
---

# Update Dashboard

You update the project's `tasks-dashboard.html` to the latest version from the plugin.

## Step 1: Update the dashboard

From the project root, run atm-cli, the plugin's `atm` command:

```bash
atm migrate --json
```

(The plugin's `bin/` is on your PATH while the plugin is enabled. If the shell says `atm: command not found`, write
`"${CLAUDE_SKILL_DIR}/../../bin/atm"` instead of `atm`.)

It moves an old `docs/tasks.json` (or `tasks.json` in the project root) into `.agentic-task-manager/` if needed (the
move is staged in git, not committed), and installs or updates `.agentic-task-manager/tasks-dashboard.html` to the
plugin's version. If it exits with code 127, Python 3.9 or newer is not installed: atm
needs it, so ask the user to install it and stop.

In its JSON output:
- `moved` (not null): tell the user which file moved and that the move is staged, to be committed.
- `warning` (not null): show it.
- `dashboard` is null: there is no task file. Tell the user:
  > No tasks.json found. Run `/atm:create-tasks` first — it will set up both tasks.json and the dashboard.
- `dashboard.action` is `"current"`: report
  > **Dashboard is up to date** (v$VERSION). No update needed.

  with `dashboard.from` as $VERSION, and stop.
- `dashboard.action` is `"installed"` (there was no dashboard before): report
  > **Dashboard installed** (v$VERSION). Start it with `/atm:serve`.

  with `dashboard.to` as $VERSION, and stop.
- `dashboard.action` is `"rebuilt"` (the same version, but the plugin ships a newer build of it): report
  > **Dashboard updated** (v$VERSION, a newer build of the same version). Refresh your browser to see it.

  with `dashboard.to` as $VERSION, and stop: there are no new release notes for it.
- `dashboard.action` is `"updated"`: $OLD_VERSION is `dashboard.from` (empty means the old dashboard had no version
  tag) and $NEW_VERSION is `dashboard.to`. Continue with Step 2.

The dashboard is not committed (`.agentic-task-manager/.gitignore` lists it), so updating it changes nothing in git.

## Step 2: Read the release notes

The plugin's release notes are `${CLAUDE_SKILL_DIR}/../../CHANGELOG.md`.

## Step 3: Report

Read the plugin's `CHANGELOG.md` (Step 2). It has one `## [x.y.z] - YYYY-MM-DD` section per version, newest
first, each with `### Added` / `### Changed` / `### Fixed` bullet lists. Select every version that is **newer than
$OLD_VERSION and not newer than $NEW_VERSION** (compare numerically: 0.10.0 is newer than 0.9.0). If the old
dashboard had no version tag, treat $OLD_VERSION as 0.0.0. Ignore an `[Unreleased]` section.

> **Dashboard updated!** $OLD_VERSION → $NEW_VERSION
>
> Refresh your browser to see the new dashboard. Its version label (next to the title) opens the same release notes.
>
> **What's new:**
>
> **v$VERSION** ($DATE)
> - (each bullet from that version's Added / Changed / Fixed lists, prefixed with "Added:", "Changed:" or "Fixed:")
>
> (repeat for each selected version, newest first)

Copy the changelog bullets as written; don't summarize, merge or invent entries. If `CHANGELOG.md` is missing,
say "Release notes are not available for this version" instead of describing changes.
