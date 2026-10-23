# One implementation for the atm helper: options and proposal

**Status:** accepted (B, Python only) · **Date:** 2026-10-23 · **Context:** review comment on `plugin/scripts/atm.mjs`
(0.10.0 ships the helper twice, as `atm.py` and `atm.mjs`, held equal by a shared test suite)

## 1. The problem

The helper is about to grow from ~400 lines (paths, migrate, serve) to the core of FR-8: locking, claims and
leases, the loop's selection rule and a merge driver. Two hand-written copies of that logic will drift, and every
change costs twice the work and review. The conformance suite catches divergence in what it tests, not elsewhere.

The constraint that led to two copies: **no installed packages and no build step for users**. The plugin is
cloned from git and must run as-is.

## 2. Who has what (the use cases)

| Use case | Python 3.9+ | Node 18+ | Notes |
|---|---|---|---|
| U1 macOS developer | ✓ almost always | often | `git` on macOS comes from the Xcode Command Line Tools, which also install `python3` (3.9.x) |
| U2 Linux developer / WSL | ✓ almost always | often | `python3` is in practically every distribution's base install |
| U3 Dev container / CI image | usually | usually | Slim and Alpine images may have neither; Node-based images may lack Python (to verify per image) |
| U4 Windows, native (not WSL) | sometimes | sometimes | Already out of scope (P2) |
| U5 Claude Code cloud / remote sessions | ✓ in the images I know of | ✓ | To verify |

The Python/Node twin mainly helps U3 images that have Node but not Python, and parts of U4.

## 3. Options

**A. Lua core embedded in thin Python/Node wrappers (the review's suggestion).** Neither standard library can run Lua.
Python needs `lupa`, a compiled extension installed with pip. Node needs `fengari` (a JS Lua VM) or a WebAssembly
build of Lua; either could be vendored as one file. There is no maintained pure-Python Lua interpreter to vendor, so
the Python side breaks the no-packages rule. **Not viable.** The same goes for any "embed an interpreter" design:
Python's standard library can only run Python, and Node's can run JavaScript or WebAssembly (and Python has no
WebAssembly runtime in its standard library).

**B. Python only.** One implementation, as readable as today's `atm.py`; drop `atm.mjs` and the twin tests. It covers
U1, U2 and most of U3 and U5. Users without Python get a clear error from the launcher. **Cost: lowest. Gap: Node-only
images, native Windows.**

**C. Node only.** Same idea in JavaScript. Claude Code's native installer doesn't bring Node, and many Python, Go or
Rust projects have no Node, so this covers fewer of U1 and U2 than B does.

**D. One source, generated into both (Haxe → Python + JS).** Haxe compiles one codebase to standalone Python and
Node files, which we would commit like the dashboard build. Logic is written once, and users still need either
runtime. But file system, process and HTTP code still needs per-target bindings, the generated code is hard to read and
debug, and contributors need a niche toolchain. **Cost: high, for a few hundred lines.**

**E. One compiled binary (Go), no runtime at all.** Covers U1–U5 including Windows, with real file locking and no
interpreter. Binaries for macOS/Linux/Windows × x64/arm64 come to about 2–3 MB each.
- E1: commit them to the plugin, so roughly 12 MB more git history per release, forever.
- E2: download the right one from a GitHub release on first use, checked against a checksum pinned in the plugin.
  This needs network access the first time.

Both need a CI cross-compile and release pipeline, and binaries are opaque to users who read what a plugin runs.
**Cost: medium-high. Gap: none.**

**F. Keep the twins but make them tiny.** The helper provides only the primitives: a lock (`atm lock`/`unlock` on a
lock directory), an atomic write, and the server. The rules (selection, claims, transitions) live in the skill
instructions and are executed by the agent. Each twin stays about 150 lines. But it puts the correctness-critical logic
back into LLM-followed prose, which FR-8 set out to avoid, and the merge driver can't live in a prompt. **Not
recommended.**

**G. Status quo: twins plus the conformance suite.** It works today. The maintenance cost grows with every FR-8
feature.

| | Single source | U1–U2 | U3 Node-only | U4 Windows | No build step | Offline | Effort |
|---|---|---|---|---|---|---|---|
| A Lua core | ✓ | ✗ needs pip package | | | | | n/a |
| **B Python only** | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | low |
| C Node only | ✓ | partly | ✓ | partly | ✓ | ✓ | low |
| D Haxe → both | ✓ | ✓ | ✓ | partly | ✗ (dev only) | ✓ | high |
| E1 Go binary, committed | ✓ | ✓ | ✓ | ✓ | ✗ (dev only) | ✓ | medium-high, repo growth |
| E2 Go binary, downloaded | ✓ | ✓ | ✓ | ✓ | ✗ (dev only) | ✗ first run | medium-high |
| F Tiny twins | partly | ✓ | ✓ | partly | ✓ | ✓ | low, but logic in prompts |
| G Twins (today) | ✗ | ✓ | ✓ | partly | ✓ | ✓ | grows with FR-8 |

## 4. Proposal

**B now: one Python implementation. E as the upgrade path if real users need Node-only or Windows support.**

- Python covers the people actually running atm: anyone with `git` on macOS already has `python3` 3.9. The script
  stays one readable file with no build step, which suits a plugin people read before running.
- The twin's real benefit is a narrow slice of container images, and paying for it with double maintenance of the
  concurrency logic is the wrong trade. If that slice turns out to matter, a single Go binary (E2) serves it, and
  Windows too, without bringing back two implementations.
- Lua was the right instinct, a single portable core, but neither standard library can host it. A compiled binary is
  the form of that idea that works.

**Changes if accepted** (before phase 11, as a 0.10.1 follow-up on this branch):
1. Delete `plugin/scripts/atm.mjs`. The launcher runs `atm.py` with Python 3.9+, or explains that Python is needed.
   `ATM_RUNTIME` goes away.
2. Tests: `tests/scripts` keeps every scenario and test, run once against Python. CI keeps the Python 3.9 and 3.13
   jobs; the Node matrix and the mixed-runtime cases go.
3. Docs: `docs/v3-requirements.md` (FR-6.10, FR-8.1/8.1a, NFR-2, decision 5), `docs/parallel-agents-design.md`
   ("Runtimes" in §4), README prerequisites, `plugin/CLAUDE.md` and the dev `CLAUDE.md` say Python 3.9+.
4. The lock can go back to `fcntl.flock`, which the OS releases automatically on a crash. The lock directory existed
   so Node, which has no `flock`, could share it. I'd keep the lock directory anyway, because it also works on Windows,
   if E or Windows ever comes.

## 5. Questions for you
1. Is a Python 3.9+ requirement acceptable (B), or is Node-only coverage important enough to plan E now?
2. If E: committed binaries (E1) or a first-use download (E2)?
