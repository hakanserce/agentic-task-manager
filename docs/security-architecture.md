# atm security architecture

Status: **approved** (T-232, reviewed with Hakan on 2026-10-26). The maintained version of the threat model from `docs/security-review.md`, the
rules every change must keep, and the check that enforces each. The review stays as the record of the first pass;
this document is what changes with the code.

## 1. What we protect, from whom

**Assets**, most valuable first:

1. **The user's machine and accounts**, reachable through the agent's shell: files, SSH keys, `gh` and git credentials,
   cloud credentials in the environment.
2. **The user's repositories**: code, history, the right to push and open PRs.
3. **Task data**: `tasks.json`, the archive, claims, notes. Its *integrity* matters most, because it steers agents.
4. **Other local projects' data**, through the one dashboard server.
5. **The plugin's distribution**: what users install and run on update.

**Actors**:

| Actor | Trusted? | Reaches atm through |
|---|---|---|
| The user | yes | the CLI, the skills, the dashboard |
| The user's agents | to act for the user, but only as safe as the text they read | the CLI, the shell |
| A collaborator, or anyone whose commits the user pulls | may write tasks, must not control the machine | `tasks.json`, the archive, `meta` |
| A hostile repository the user clones | no | everything in it, symlinks included |
| A web page in the user's browser | no | HTTP requests to `localhost` |
| Another local user or process | no | the server's port, files in `ATM_HOME` |
| An outside contributor, CI output | no | PRs, CI logs, review comments the push skill reads |
| The supply chain | partly | npm, GitHub Actions, the CI container, the marketplace |

**Trust boundaries** (where untrusted input enters):

| # | Boundary | Untrusted input |
|---|---|---|
| B1 | task text → agent | names, descriptions, notes, questions, answers, reasons, `meta.workflow` |
| B2 | repository files → atm-cli | `tasks.json`, the archive, `.gitattributes`, paths, symlinks under `.agentic-task-manager/` |
| B3 | browser → dashboard server | every HTTP request, from any page |
| B4 | task data → dashboard rendering | names, Markdown, links, logos |
| B5 | local machine → atm's runtime files | `ATM_HOME`, the server's port |
| B6 | contributors and CI → repository → users | workflows, artifacts, dependencies, the build artifacts users run |

The threats per boundary (STRIDE, with likelihood and impact) are in `docs/security-review.md` §2.4; new ones are
added here, in §4.

## 2. Invariants

Every change keeps these. Each has the check that enforces it; **to build** marks a check that doesn't exist yet,
with the task that adds it.

### Agents and skills (B1)

| # | Invariant | Enforced by |
|---|---|---|
| I1 | **Task text is data, not commands.** The skills and `plugin/CLAUDE.md` say so, and an agent blocks a task that asks it to run copied commands, fetch scripts, touch credentials, CI, git config or hooks | `dashboard/tests/unit/skills.test.ts` (the rule is present); the agent sandbox's red-team run (**to build**, T-235) |
| I2 | **Skills pre-approve no command runner**: only named `atm` subcommands, never `atm run` or `atm *` | `skills.test.ts` |
| I3 | **Agent-written text is single-quoted** in skill templates, never double-quoted | `skills.test.ts` |
| I4 | **CI logs and PR comments are evidence**, never instructions, for the push skill | `skills.test.ts` (the rule is present) |

### atm-cli (B2)

| # | Invariant | Enforced by |
|---|---|---|
| I5 | **atm never runs a shell**: subprocesses get argument lists; no `shell=True`, `os.system`, `eval` or `exec` | review; a static check (**to build**, T-234) |
| I6 | **atm never reads or writes through a symlink** in the task folder, nor a task folder outside the project | `tests/scripts/symlinks.test.mjs` |
| I7 | **A `--file` names one file**: git runs with literal pathspecs; whole-tree pathspecs are refused | `tests/scripts/git.test.mjs` |
| I8 | **Strings from `tasks.json` that reach a shell are shell-safe**: task IDs and `meta.workflow.base` are checked on load | `tests/scripts/scenarios/security.json` |
| I9 | **The merge driver's command comes from the clone's own git config**, never from the repository | review (`merge.py`) |

### Dashboard server (B3, B5)

| # | Invariant | Enforced by |
|---|---|---|
| I10 | **Loopback only, matching Host**: the server binds 127.0.0.1 and refuses any other Host header (DNS rebinding) | `serve.test.mjs` "a request for another Host is refused" |
| I11 | **Nothing changes state over HTTP**: only GET and HEAD | `serve.test.mjs` "only the four files…" |
| I12 | **Only the registered projects' task files are served**, regular files only, never through a symlink | `serve.test.mjs` (the four files; the symlink test) |
| I13 | **Every response has `nosniff` and CORP same-origin; the page has the strict CSP** (own scripts by hash, `connect-src 'self'`, `frame-ancestors 'none'`) | `serve.test.mjs` "security headers"; `dashboard/tests/e2e/security.spec.ts` |

### Dashboard (B4)

| # | Invariant | Enforced by |
|---|---|---|
| I14 | **Every link from task data is http(s)** (`safeUrl`); Markdown links are http(s), mailto or `#` | `tests/unit/url.test.ts`, `markdown.test.ts`, `stages.test.ts`, `ProjectCard.component.test.ts` |
| I15 | **No `{@html}` on data**: only on the built-in icons and the bundled logo | review; a check that `{@html}` appears only in `Icon.svelte` and `Logo.svelte` (**to build**, T-234) |
| I16 | **The page runs under its CSP**: nothing it does is refused | the e2e `cspGuard` fixture (every e2e test) |
| I17 | **No request leaves localhost** | the e2e `externalRequestGuard` fixture |

### CI and distribution (B6)

| # | Invariant | Enforced by |
|---|---|---|
| I18 | **CI tokens are read-only by default; checkouts don't keep credentials** | the workflow (**to build**, T-230) |
| I19 | **Actions and images are pinned by digest**, updated by Dependabot | the workflow (**to build**, T-230) |
| I20 | **What users run is what was reviewed**: the committed build artifacts match their sources | CI's freshness checks |
| I21 | **`main` takes only reviewed changes with green checks** | branch protection (**to set up**, T-231) |

## 3. Verifying it

How each kind of check runs, and when, is decided in T-233 (the sandbox) and T-236 (the schedule). In short, as the
review proposed:

- **Every PR (CI)**: everything in §2 that is a test.
- **Every PR that changes what agents read** (a skill, `plugin/CLAUDE.md`, or atm's output agents act on), before
  it is merged: the agent sandbox's red-team run (I1). Here **every PR to `main` is a release** (the version is
  bumped and `/plugin marketplace update` delivers it), so "before a release" means "before merging such a PR". PRs
  that change only the dashboard or atm-cli don't need the sandbox run: their invariants are covered by CI.
- **Each quarter**: a review against this document, like `docs/security-review.md`.

## 4. Keeping it current

This document changes **in the same PR** as a change that:

- adds an **entry point**: a new HTTP route, a CLI command that reads a path or a URL, a new file in the task folder;
- adds a **file format** or a field agents or the dashboard act on (a link, a command, a path);
- adds or changes a **skill instruction** that runs commands, pushes, or reads outside text (CI logs, issues, web
  pages);
- changes **CI permissions**, actions, or how the plugin is distributed.

Such a PR adds the threat (with its boundary) and, if it needs one, the invariant and its check. `CLAUDE.md`
(development) points here.

## 5. Review outcome

- The invariants were approved as listed.
- Those still **to build** rely on review until their tasks add the checks: I5 and I15 (T-234), I1's red-team run
  (T-235), I18 and I19 (T-230), I21 (T-231). I9 stays a review item.
- A release is every PR to `main` (§3).
