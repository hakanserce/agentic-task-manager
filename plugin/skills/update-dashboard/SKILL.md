---
name: update-dashboard
description: >
  Update the project's tasks-dashboard.html to the latest version shipped with
  the plugin. Use when the user says "update dashboard", "refresh dashboard",
  "get latest dashboard", or "upgrade dashboard".
---

# Update Dashboard

You update the project's `tasks-dashboard.html` to the latest version from the plugin.

## Step 1: Find the project's dashboard

Search for `tasks-dashboard.html` in this order:
1. Same directory as `tasks.json` (check `docs/` first, then project root)
2. `docs/tasks-dashboard.html`
3. `tasks-dashboard.html` (project root)

If not found, tell the user:
> No tasks-dashboard.html found. Run `/atm:create-tasks` first — it will set up both tasks.json and the dashboard.

## Step 2: Read the plugin's latest template

The plugin root is two levels above this skill's directory (`<plugin root>/skills/update-dashboard/`):
- Latest dashboard: `${CLAUDE_SKILL_DIR}/../../templates/tasks-dashboard.html`
- Release notes: `${CLAUDE_SKILL_DIR}/../../CHANGELOG.md`

## Step 3: Compare versions

Check for a `<meta name="atm-dashboard-version" content="...">` tag in both files.

- If the project's dashboard has no version tag, it is outdated (pre-versioning).
- If both have version tags and they match, the dashboard is already up to date.
- If the plugin's version is newer, proceed with the update.

If already up to date, report:
> **Dashboard is up to date** (v$VERSION). No update needed.

## Step 4: Update the dashboard

Copy the plugin's template over the project's `tasks-dashboard.html`.
**Preserve the file location** — write it to the same path where the old one was found.

## Step 5: Report

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
