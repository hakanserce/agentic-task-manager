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

Read the dashboard template from the plugin's templates directory.
The latest template is located at: `${CLAUDE_SKILL_DIR}/../../../templates/tasks-dashboard.html`

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

> **Dashboard updated!** $OLD_VERSION → $NEW_VERSION
>
> Refresh your browser to see the new dashboard.
>
> **What's new:** (briefly describe what changed based on the version difference)
