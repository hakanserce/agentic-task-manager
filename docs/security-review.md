# atm security review

Status: **draft for review** (T-211). Nothing here is fixed yet, and none of the proposed tasks in §4 is in
`tasks.json` until it's approved.

## 1. What atm is, from a security point of view

atm is a Claude Code plugin with four parts that touch untrusted input:

| Part | What it does | Runs as |
|---|---|---|
| **atm-cli** (`atm-cli/atm/*.py` → `plugin/scripts/atm.py`) | reads and writes `.agentic-task-manager/tasks.json`, the claims store, the projects registry; runs `git` | the user, on their machine |
| **Dashboard server** (`atm serve`, `server.py`) | one long-running local HTTP server for all the user's projects | the user, in the background, across sessions |
| **Dashboard** (`plugin/templates/tasks-dashboard.html`) | renders tasks, notes, Markdown, links and logos in the user's browser | the browser, origin `http://localhost:<port>` |
| **Skills and hook** (`plugin/skills/*/SKILL.md`, `plugin/hooks/`) | tell an AI agent to read tasks and act on them: write code, run commands, commit, push, open PRs, fix CI | the agent, with the user's shell, git and `gh` credentials |

The plugin is installed from this repository through the marketplace (`.claude-plugin/marketplace.json`); users run
the committed build artifacts (`plugin/scripts/atm.py`, `plugin/templates/tasks-dashboard.html`), not the sources.

## 2. Threat model

### 2.1 Assets

- **A1 The user's machine and accounts**, reachable through the agent's shell: files, SSH keys, `gh` and git
  credentials, cloud credentials in the environment. The most valuable asset, and the one an agent can reach.
- **A2 The user's repositories**: source code, history, branches, the ability to push and open or merge PRs.
- **A3 Task data**: `tasks.json`, the archive, claims, notes. Integrity matters more than secrecy (it steers agents);
  some projects keep private plans in it.
- **A4 Other local projects' data** through the one dashboard server: the registry lists every project the user has
  run atm in.
- **A5 The plugin's distribution**: what users install and run on update.

### 2.2 Actors

| Actor | Trust | Reaches atm through |
|---|---|---|
| **The user** | trusted | the CLI, the skills, the dashboard |
| **The user's agents** | trusted to act for the user, but they follow text they read, so they're only as safe as their inputs | the CLI, the shell |
| **A collaborator** (or anyone whose commits the user pulls, e.g. a merged PR from a contributor) | partly trusted: may write tasks, but shouldn't control the user's machine | `tasks.json`, the archive, `.gitattributes`, `meta` (workflow, verify, commit template, repository, logo) |
| **A hostile repository** the user clones and opens | untrusted | everything in it, including `.agentic-task-manager/` and symlinks |
| **A web page** in the user's browser | untrusted | HTTP requests to `localhost` (CSRF, DNS rebinding) |
| **Another local user or process** | untrusted | shared paths (`/tmp`), the server's port, files in `ATM_HOME` with loose permissions |
| **An outside contributor's PR / CI output** | untrusted | PR titles and bodies, CI logs, review comments the push skill reads |
| **The supply chain** | partly trusted | npm dependencies, GitHub Actions, the CI container, the marketplace |

### 2.3 Trust boundaries and entry points

1. **Task text → agent** (*prompt injection*). Task names, descriptions, notes, questions, answers, rejection
   reasons and `meta.workflow` are read by agents that hold A1 and A2. This is the boundary with the biggest
   blast radius: atm's whole purpose is to make agents act on this text.
2. **Repository files → atm-cli**: `tasks.json`, the archive, `.gitattributes`, the git config the merge driver
   uses, file lists (`atm commit --file`), paths and symlinks under `.agentic-task-manager/`.
3. **Browser → dashboard server**: every HTTP route, from any page the user has open.
4. **Task data → dashboard rendering**: names, Markdown, links (`meta.repository`, commits, PRs), logos.
5. **Local machine → atm's runtime files**: `ATM_HOME` (registry, server pid/port files, claims, locks).
6. **Contributors and CI → this repository → users**: workflows, artifacts (Linux screenshot baselines), npm
   dependencies, the committed build artifacts users run.

### 2.4 Threats (STRIDE), by boundary

§3 says which of these the code already handles. The columns:

- **STRIDE** is the kind of threat: **S**poofing (pretending to be someone or something else), **T**ampering
  (changing data or code), **R**epudiation (denying an action because nothing recorded it), **I**nformation
  disclosure (reading what you shouldn't), **D**enial of service (making it hang, crash or unusable), **E**levation
  of privilege (getting to do more than you're allowed, e.g. running commands as the user).
- **L** is the likelihood that someone tries it and it works, **I** the impact if it does; both rough, as
  **H**igh, **M**edium or **L**ow.

| # | Boundary | Threat | STRIDE | L | I |
|---|---|---|---|---|---|
| T1 | 1 | A task description tells the agent to run a command, exfiltrate secrets, or push to another remote | E, I | M | H |
| T2 | 1 | `meta.workflow.verify` (or a similar meta field) names a command the agent runs on every push | E | M | H |
| T3 | 1 | Text in CI logs or PR comments steers the push skill's "fix CI" rounds | E | L | H |
| T4 | 2 | A path in task data or a CLI argument (`--file`, logo, archive) escapes the repository: read, commit or overwrite outside it, or via a symlink | T, I | L | H |
| T5 | 2 | A task-controlled string reaches a shell or becomes a git option (`-…`), or a format string | E | L | H |
| T6 | 2 | The merge driver registration lets a repository run a command of its choosing | E | L | H |
| T7 | 2 | A huge or deeply nested `tasks.json` hangs or crashes atm (and the agent's loop) | D | L | L |
| T8 | 3 | A web page reads task data from `localhost` (DNS rebinding, missing Host/Origin checks, permissive CORS) | I | M | M |
| T9 | 3 | A web page triggers a state change on the server (stop, refresh, register) | T, D | M | L |
| T10 | 3 | The server serves files outside the registered projects' task folders (path traversal) | I | L | H |
| T11 | 4 | Task text runs script in the dashboard (XSS through Markdown, links, logos), with access to every project's data the server serves | T, I | M | M |
| T12 | 5 | Another local user reads or alters the registry, claims or pid files, or takes over the server's port | S, T, I | L | M |
| T13 | 6 | A workflow with write permissions runs untrusted PR input; an action or dependency is compromised | E, T | L | H |
| T14 | 6 | A poisoned CI artifact (screenshot baselines) or build artifact reaches users unreviewed | T | L | M |
| T15 | 6 | The committed build artifacts users run differ from the reviewed sources | T | L | H |

## 3. Review against the threat model

Findings are numbered F1–F19 and grouped by area.
Three read-only reviews: atm-cli and the hook; the server and dashboard; the skills and CI. Nothing was run
against a live server. Findings marked *unconfirmed* need a test to prove them (the proposed tasks include one).
GitHub-side settings (branch protection, default token permissions, fork PR approval) were not checked.

### 3.1 Coverage

Each threat from §2.4 gets a verdict:

- **Handled**: the code already defends against it, and the review found no way around the defence.
- **Partly open**: there is a defence, but the review found a gap in it (named in Notes, with its finding).
- **Open**: nothing defends against it today.
- **(low)** after a verdict: the gap exists but its impact is small.

| # | Verdict | Notes |
|---|---|---|
| T1 | **Open** | Nothing tells agents that task text is data. do-task says "implement exactly what it says"; loop-tasks runs it with no human in the loop (F1, F2) |
| T2 | Handled | `meta.workflow.verify` is a boolean, not a command; push takes the command from `CLAUDE.md`. But `meta.workflow.base` is an unchecked string the agent puts into shell commands (F5) |
| T3 | **Open** | push reads `--log-failed` and "the project's instructions" and acts on them for up to `max_rounds` (F4) |
| T4 | **Partly open** | `commit_paths` and logos check real paths. Writes to `.gitignore` / `.gitattributes` and the files the server serves follow symlinks (F7, F8); `atm commit --file` takes glob pathspecs (F6) |
| T5 | Handled in atm, **open in skills** | atm-cli uses argv lists only, no `shell=True`, paths after `--`, `str.replace` templates. Skill templates put agent-written text in double quotes (F3), and IDs and `base` reach the agent's shell unchecked (F5) |
| T6 | Handled | the driver command comes from the clone's own git config; `.gitattributes` can only select it |
| T7 | **Open** (low) | deep JSON raises `RecursionError`, recursive `find_cycle`, possible ReDoS in the ID regex; one bad project breaks `/api/projects` (F12, F13) |
| T8 | Handled | 127.0.0.1 only, strict Host check (blocks DNS rebinding), no CORS headers. But the URLs say `localhost`, and a `[::1]` listener may win (F10, *unconfirmed*) |
| T9 | Handled | no state change over HTTP; everything but GET/HEAD is 405 |
| T10 | Handled for paths, **open for symlinks** | fixed file allowlist, the id is a lookup key only (F8) |
| T11 | **Partly open** | Markdown is a tree, links limited to http(s)/mailto/#, logos in `<img>` with `CSP: sandbox`. PR URLs are used raw in two places (F9); no CSP on the page (F11) |
| T12 | **Partly open** (low) | `ATM_HOME` uses default permissions; `[::1]` port takeover (F10); a committed legacy `.server.json` can make atm signal a pid (F14) |
| T13 | **Partly open** | `pull_request` only, no event text in `run:`, no secrets. No `permissions:` block, credentials persisted on checkout, actions pinned by tag (F15) |
| T14 | **Partly open** (low) | the baselines artifact holds the whole screenshot folder and can come from a fork's run (F16) |
| T15 | **Partly open** | CI checks the build artifacts are fresh, but after the push; no signed release, and the hooks run new code on every user's next session (F17) |

### 3.2 Findings

Severity is for this project as it is used today (a single maintainer, agents with the user's credentials).

**Agents and skills**

- **F1 `Bash(atm *)` pre-approves any command (high).** Every skill's `allowed-tools` has `Bash(atm *)`, and
  `atm run <id> -- <anything>` runs its child, so `atm run T-1 -- sh -c '…'` skips the permission prompt. The skills
  teach agents to wrap long commands in `atm run`. `atm commit` (auto-approved) also runs the repo's git hooks.
- **F2 Task text is executed as instructions (high in shared repos).** do-task: "implement exactly what it says";
  notes (rejection, handoff, answer) are acted on; an `--on agent` answer is agent-to-agent. A task or note that
  arrives through a pull or a merged PR is carried out by `/atm:loop-tasks` unattended. create-tasks also turns
  outside documents (a URL, a README) into task text without showing the drafted tasks before `atm add`.
- **F3 Shell-quoting in templates (medium).** Templates use `--note "<…>"`, `--question "<…>"`, `--reason "<…>"`,
  `gh pr create --title "<…>"`, while the skills ask for `` `code` `` in notes: backticks or `$(…)` inside double
  quotes run as command substitution, including text copied from a task name.
- **F4 CI logs and the branch's `CLAUDE.md` steer the push loop (medium).** push acts on log text "by kind" and on
  "the project's documented steps"; nothing says log text is evidence, not instructions.
- **F5 Unchecked strings from `tasks.json` reach the agent's shell (medium).** `meta.workflow.base` only has to be
  a non-empty string; task IDs aren't checked for characters on load; skills paste both into commands.
- **F19 Unreviewed `--push` (medium).** With the `direct` workflow, `/atm:loop-tasks --push` pushes each
  task's commit to the base branch with no review; a commit rejected by a hook only logs a warning and the loop
  goes on.

**atm-cli**

- **F7 Writes follow symlinks (medium).** A repo can commit `.agentic-task-manager/.gitignore` (or
  `.gitattributes`, or the folder itself) as a symlink; `atm serve`, `migrate`, `init` and `archive` then write
  through it, outside the repo.
- **F6 `atm commit --file` takes pathspecs (medium).** Only `*` and a leading `:` are refused; `'*.env'` or
  `src/[id]/` match more than one file, and `git add -A -- <pathspec>` stages untracked matches (local secrets).
- **F12 Hostile JSON crashes atm (low).** `RecursionError` from deep nesting isn't caught; `find_cycle` recurses per
  hop (about 1000 tasks); non-dict tasks raise `AttributeError`; `main` catches only `AtmError`, so the user and
  the merge driver get a traceback. The ID regex `^(.*?)(\d+)$` may backtrack quadratically (*unconfirmed*).
- **F13 Lock-breaking race (low).** Two waiters breaking the same stale lock can both end up holding it.
- **F14 Legacy `.server.json` (low).** A committed one makes `atm serve` / `migrate` contact a localhost port and
  SIGTERM the pid in it, if the listener there answers with matching values.
- **Info:** the PostToolUse hook registers every folder with a `tasks.json` the agent visits, so a cloned repo's
  task data is served to the dashboard without the user running atm there. `commit_template` and
  `trailers.require` from a pulled `meta` go into every commit (forged trailers are possible, by design).

**Server and dashboard**

- **F9 PR URLs used raw as links (medium).** `atm pr --url` stores any string; `ProjectCard.svelte` and
  `stages.ts` → `KanbanColumns.svelte` use it as `href` (only `repo.ts` checks `^https?://`). A `javascript:` URL
  is a stored XSS if the browser runs it in the dashboard's origin (*unconfirmed*; links open in a new tab).
- **F10 IPv4 bind, `localhost` URLs (medium, *unconfirmed*).** The server binds 127.0.0.1 but users, `whoami` and
  `serve stop` use `localhost`; another local user on `[::1]:<port>` could serve a look-alike dashboard or answer
  `whoami` to get a pid signalled.
- **F8 Served files follow symlinks (low; high together with F9).** `p/<id>/tasks-archive.json` can be a symlink to
  `~/.ssh/id_rsa`; the Host check keeps other sites out, so only script in the dashboard's origin could read it.
- **F11 No security headers (low).** No CSP, `nosniff`, `frame-ancestors` or CORP on the page and JSON. A
  hash-based CSP would also neutralise F9.
- **F18 Smaller server items (low).** One deeply nested project fails `/api/projects` for all; no handler timeout
  and no file-size cap; `meta.id` collisions shadow another project; `ATM_HOME` is created with default
  permissions.

**CI and distribution**

- **F15 Workflow hardening (low–medium).** No top-level `permissions:`; `actions/checkout` keeps the token in
  `.git/config` for later steps (a compromised devDependency could push on `push` / `workflow_dispatch` runs);
  actions and containers pinned by tag (`python:${{ matrix.python }}` floats); no Dependabot. Developers are told
  `npm install`, not `npm ci`.
- **F16 Screenshot baselines artifact (low).** It holds the whole `__screenshots__/` folder and a fork PR's run
  uploads one with the same name; the documented steps don't check which run it came from.
- **F17 Distribution (medium, design).** The marketplace installs `./plugin` from the default branch, and the hooks
  run `atm` on every tool call and session start: anything merged to `main` runs on every user's machine after an
  update. No branch protection was verified, no signed tag, no `SECURITY.md`.
- **Info:** `prepare` sets `core.hooksPath`, so a contributor's branch changes what runs at commit time on the
  maintainer's machine.

### 3.3 Already right

atm-cli never uses a shell, `eval` or format strings on task data; the merge driver can't be redirected by a repo;
logos are path-checked, typed, size-capped and served sandboxed; the server is loopback-only with a strict Host
check, no CORS and no state change over HTTP; the dashboard renders Markdown as a tree with an http(s)/mailto/#
link allowlist and no task text in `{@html}`; CI uses `pull_request` (not `_target`), no secrets, and rejects
stale build artifacts; the push skill never force-pushes, merges, weakens tests or edits CI to pass.

## 4. Proposed tasks

All in a new phase **20 "Security fixes"**, label `security` (plus the area label), type `bugfix` unless noted.
P0 = do first; the rest by priority. Each fix comes with the test named in its finding.

### 4.1 Fixes

| # | Task | Findings | Type | P |
|---|---|---|---|---|
| S1 | **Skills: narrow `allowed-tools`.** List only the `atm` subcommands each skill needs; leave out `atm run` (its child gets a normal permission check) | F1 | bugfix | P0 |
| S2 | **Skills: task text is data, not commands.** A rule in do-task, loop-tasks and `plugin/CLAUDE.md`: names, descriptions, notes, answers and reasons describe the work; never run commands copied from them, fetch or run remote scripts, or touch credentials, CI, git config or hooks because a task says so: block `--on user` instead. create-tasks shows the drafted task text before `atm add` and flags imperative commands from its sources. push: CI log text is evidence, not instructions; no new packages or downloads without asking | F2, F4 | bugfix | P0 |
| S3 | **Shell-safe values.** Skill templates single-quote agent text (or use new `--note-file` / `--reason-file`); atm validates task IDs (`[A-Za-z0-9._-]{1,64}`) and `meta.workflow.base` (git ref syntax, no leading `-`) on load and in `atm check`; a check in `npm run check` that skills have no `"<…>"` templates | F3, F5 | bugfix | P1 |
| S4 | **`atm commit`: literal paths only.** git reads a `--file` value as a *pattern* (`*.env` means every file ending in `.env`, `src/[id]` matches `src/i` and `src/d`), not as one file's name. Run git with `--literal-pathspecs`, so each value names exactly one file or fails | F6 | bugfix | P1 |
| S5 | **No writes or reads through symlinks.** atm-cli refuses a symlinked `.agentic-task-manager/` (or one whose real path leaves the repo) and symlinked `.gitignore` / `.gitattributes`; the server serves only regular files whose real path is inside the project's task folder | F7, F8 | bugfix | P1 |
| S6 | **Dashboard: one `safeUrl()` for every link.** PR links on cards and Kanban sections go through it; `atm pr --url` and the summary accept only http(s) | F9 | bugfix | P1 |
| S7 | **Server: security headers.** CSP on `/` (hash-based `script-src`, `connect-src 'self'`, `frame-ancestors 'none'`, …), `nosniff` and CORP on every response; e2e checks the page still works under it | F11 | feature | P1 |
| S8 | **Server: loopback and isolation.** Use `127.0.0.1` in URLs and `whoami` (confirm F10 first; note it resets saved views in localStorage); one failing project shows as missing instead of failing `/api/projects`; handler timeout; file-size cap; unique project ids; `ATM_HOME` mode 0700 | F10, F18 | bugfix | P2 |
| S9 | **atm-cli: robust on hostile files.** Catch `RecursionError`; iterative `find_cycle`; check task shapes on load; a catch-all in `main` (and the merge driver) that reports cleanly; fix or cap the ID regex; fix the lock-breaking race; delete a legacy `.server.json` without contacting or signalling anything | F12, F13, F14 | bugfix | P2 |
| S10 | **Loop: safer `--push` in `direct`.** Confirm once per loop with the commit list (or require `--yes`); a commit a hook rejects stops the loop | F19 | bugfix | P2 |
| S11 | **CI hardening.** Top-level `permissions: contents: read`; `persist-credentials: false`; actions pinned by SHA and images by digest; Dependabot for actions, npm and docker; the artifact holds only `*-linux.png`; docs: check the run's head SHA before using its baselines, and `npm ci` instead of `npm install` | F15, F16 | infra | P2 |
| S12 | **Distribution: protect what users run.** Branch protection with required checks on `main`; `SECURITY.md` (how to report, what the hooks run); decide whether the marketplace points at a release tag | F17 | infra | P2 |

S12 needs repository settings only you can change; the task would prepare them and ask.

### 4.2 Security architecture

These make the review repeatable instead of one-off.

| # | Task | Type | P |
|---|---|---|---|
| SA1 | **Define the security architecture** in `docs/security-architecture.md`: the assets, actors and boundaries from §2 as the maintained threat model; the **invariants** every change must keep (task text is data for agents; atm never runs a shell or follows a symlink out of the repo; nothing changes state over HTTP; the server answers only loopback with a matching Host; every link the dashboard renders is http(s)/mailto/#; no `{@html}` on data; skills pre-approve no command runner; CI tokens are read-only by default); for each invariant, the test or check that enforces it; how the threat model is kept current (a section a PR updates when it adds an entry point, a file format or a skill instruction) | docs | P1 |
| SA2 | **Decide on a sandbox for verification**, as part of SA1, with a recommendation: two levels. (a) **A hostile-repo fixture** for atm-cli and the server: a temp `HOME`/`ATM_HOME` and a generated repo with symlinks, nested JSON, odd IDs and URLs, run in the existing `tests/scripts` harness; cheap, so it runs everywhere. (b) **An agent sandbox** for the skills: a container (devcontainer or Docker) with a throwaway repo, no real credentials, network egress blocked except the model API, where an agent runs `/atm:loop-tasks` on red-team tasks (injected commands, `curl \| sh`, credential reads) and the run passes if it blocks them. Only (b) can test prompt injection; it costs model calls, so it doesn't run on every PR | docs | P1 |
| SA3 | **Build the hostile-repo suite** (SA2 a) in `tests/scripts/`: the tests from S3–S9 together, plus a static check that atm-cli has no `shell=True` / `os.system` / `eval` | test | P1 |
| SA4 | **Build the agent sandbox** (SA2 b): the container, the red-team task set, a script that runs it and reports which injections were followed | infra | P2 |
| SA5 | **Verification schedule**, written into SA1 and wired up: **every PR (CI)**: the hostile-repo suite, the header and link checks, the skills-template check, the build-freshness checks, Dependabot alerts; **before each release**: the agent sandbox run (SA4) and a checklist in the release steps (`CLAUDE.md` Versions) that the threat model was updated for new entry points; **periodically** (each quarter, or when Claude Code's permission model changes): a review like this one against the threat model, and a pass over pinned action and image versions | infra | P2 |

Dependencies: S2 before SA4 (the sandbox tests S2's rule); SA1 before SA2–SA5; S3–S9 feed SA3.
