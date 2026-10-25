# v4 skills and workflows: direct or pull requests, and /atm:push

Part of the v4 design ([overview](README.md)). The skills use the [atm-cli](atm-cli.md)'s commands on the
[data model](data-model.md).

## 1. Workflows

atm's skills stop at a local commit (`/atm:do-task`) or at `git push` (`/atm:loop-tasks --push`). What comes after a
push was left to the user, and shipping 0.12.0 showed what that takes: opening the PR; waiting for CI without
stalling (the first watch started before GitHub had registered the run, and the workaround, a shell loop, needed
approval even in auto mode); reading failures and telling their kinds apart (missing Linux screenshot baselines; a
reload just over a CI performance budget, 407 ms against 400); fixing and pushing again until green; and not
loosening a budget or skipping a test to get there.

Projects also push differently. In some, the user pairs with the agent, reviews locally and pushes straight to
`main`; in others every change goes through a pull request.

| Workflow | What "push" does | Task lifecycle |
|---|---|---|
| **`direct`** | push the current branch (usually `main`), watch CI on it | To Do → In Progress → (In Review) → Done |
| **`pull-request`** | push a feature branch, open or update its PR, watch CI on the PR | To Do → In Progress → (In Review) → Done → In PR → Merged |

In PR and Merged are stages of Done (DM-4.3): dependents can start as soon as a task is committed, the Kanban stays
narrow, and changing the workflow can't leave a task without a status.

| ID | P | Requirement |
|---|---|---|
| S-1.1 | P1 | The workflow is `meta.workflow` (DM-2): `type`, `base` (default: the remote's default branch), `verify` (default `true`), `max_rounds` (default 3), `commit_template`, `trailers` (`forbid`, `require` with the lines, or absent). |
| S-1.2 | P1 | **The project's instructions come first.** If the project's `CLAUDE.md` describes how to push, branch or handle CI, the skills follow it; `meta.workflow` is the default when it doesn't. When they disagree, the agent follows `CLAUDE.md` and offers to update `meta`. |
| S-1.3 | P1 | `/atm:create-tasks` asks for the workflow once, with the vocabularies, suggesting `pull-request` when the repository has a GitHub remote with CI workflows and `direct` otherwise. `atm workflow set` changes it later. |

## 2. `/atm:push`

```
/atm:push [--no-verify] [--no-watch] [--draft] [--max-rounds N]
```

1. **Workflow:** read the project's instructions and `meta.workflow`; if neither says, ask once and save it.
2. **Check:** `direct`: on the base branch, or the user agrees to push this one. `pull-request`: not on the base
   branch (if it is, offer to create a branch and stop). Nothing uncommitted that the agent didn't write. Verify
   passes, unless `--no-verify` or `verify: false`.
3. **Push** the branch, setting the upstream if needed.
4. **PR** (`pull-request` only): if none exists, open one (`gh pr create`, `--draft` if asked) with a body built from
   the task commits since the base, grouped by phase; if one exists, the push updates it. Record it with `atm pr`.
5. **Watch CI** (unless `--no-watch`) with plain, single `gh` calls: `gh pr checks <n>` or
   `gh run list --branch <b> --limit 2`, and `gh run watch <id>` in the background. No shell loops, `cd` chains or
   `$(…)`. Right after a push the run may not be registered yet: check again instead of failing.
6. **On failure,** read `gh run view <id> --log-failed` and act by kind:

   | Kind | Action |
   |---|---|
   | Test, lint or build failure | fix the cause, verify locally, commit, push, back to 5 |
   | Budget or timing | measure locally, fix the cause; never just retry or raise the budget |
   | Generated files CI asks for (snapshots, lockfiles, builds) | follow the project's documented steps (4) |
   | Looks flaky (passes locally, unrelated to the change) | re-run the failed jobs once; a second failure is real |
   | Infrastructure (runner, network, secrets, quota) | stop and report |

   In `direct`, fixes are new commits; history is never rewritten.
7. **Merged PRs:** for tasks with a `pr` and no `merged_at`, check each distinct PR once
   (`gh pr view <n> --json state,mergedAt`) and record merges with `atm merged`. The dashboard never calls GitHub.
8. **Stop** when everything passes, after `max_rounds`, or on anything from the "never" list. Report the PR link (or
   the branch), the rounds with what failed and what was fixed, and the commits added: three lines when it passes,
   detail only on failure.

**Never, without asking the user:** skip, disable or weaken a test; raise a budget or threshold; edit the CI workflow
to make it pass; force-push or rewrite pushed history; merge the PR.

**Without `gh` or a GitHub remote:** push only, and say that CI isn't watched and no PR was opened.

**Options considered:** push-and-watch steps inside `do-task` and `loop-tasks` (the rules would be duplicated and
drift); only project notes (every project rewrites the loop and the "never" list); an atm-cli command that polls CI
(the fixing needs the agent).

## 3. The other skills

| ID | P | Requirement |
|---|---|---|
| S-3.1 | P1 | **Every skill:** never read or edit `tasks.json` or the archive directly; use `atm`. `plugin/CLAUDE.md` says the same and lists the commands. |
| S-3.2 | P1 | **`/atm:do-task`:** reads the task from `atm start` / `atm show`, related tasks with `atm show` / `atm deps`, the overview with `atm status`. Updates later tasks with `atm edit`. Ends with `atm done --note` (one-line outcome), or `atm review` when the task, the project or the user asks for a review, or `atm block --on user --question …` when it can't go on without a decision (`--on agent` when the project or the user hands such decisions to a reviewer agent). Hands off with `atm release --note`. Commits with `atm commit`, naming every file it changed. Suggests `/atm:push` when the branch has unpushed task commits. |
| S-3.3 | P1 | **`/atm:loop-tasks`:** as do-task for each task; after a review or block it continues with other ready tasks. `--push`, `--batch-push` and `--push-every N` push through `/atm:push`; pushes in the middle of the loop use `--no-watch`, the last one watches CI and fixes failures. |
| S-3.4 | P1 | **`/atm:create-tasks`:** shows the vocabularies and the workflow it will use, proposes phase names, asks the user to confirm or change them, writes tasks with `atm add --json-file`, gives every task a priority and proposes labels for groups of tasks (spikes, areas) instead of writing markers into names, and runs `atm check`. The actor is the user when the user asked for the tasks. |
| S-3.5 | P1 | **Hints:** when a command suggests archiving (CLI-5), do-task and loop-tasks run `atm archive` at a natural break (after a task's commit, never during one) and commit it on its own (`chore: archive N finished tasks`), unless `meta.archive.auto` is `false` or the project says otherwise; then they relay the hint to the user. |

The user's personal `push-pr-iterate-to-success` skill can be retired for atm projects, or point to `/atm:push`.

## 4. This repository's CI notes

Project-specific procedures stay in the project. The root `CLAUDE.md` gets a **CI** section:

- **Linux screenshot baselines:** CI fails until they are committed and attaches them as the
  `linux-screenshot-baselines` artifact. Download it with `gh api …/artifacts/<id>/zip` (`gh run download` fails on
  its duplicate entries), extract only `*-linux.png`, look at one, commit.
- **Performance budgets:** CI's budget is twice the local one, and runners are about 3× slower. A CI-only failure
  needs a local measurement and a real fix.
- **Workflow:** `pull-request`, one combined PR per release branch (also in `meta.workflow`).
