# atm helper: modules for development, one file for the plugin

**Status:** proposal, for review · **Date:** 2026-10-24 · **Task:** T-096 (review feedback on 0.11.0)

## 1. The problem

`plugin/scripts/atm.py` is 1,299 lines and 84 functions in one file, in seven sections: helpers, the lock, paths and
migrate, the dashboard server, task status, claims, and the merge driver. It is getting hard to navigate and review,
and every change touches the same file.

Two constraints stay:
- **One file in the plugin.** Users install by cloning; nothing is built or installed on their side.
- **Readable.** People read what a plugin runs. Claude also reads the helper when a skill's call fails.

## 2. Options

**(a) Modules in a dev folder, concatenated into one readable file (recommended).** The source lives in
`helper/atm/` at the repo root (dev only, not shipped), one module per concern. A small build script
(`helper/build.py`, Python standard library) writes `plugin/scripts/atm.py`:
- a "generated from helper/atm/ by helper/build.py — don't edit" header;
- all standard-library imports, deduplicated and hoisted to the top;
- each module's code in dependency order under a banner (`# ==== lock.py ====`), with its intra-package imports
  (`from .core import AtmError`) removed, since everything ends up in one namespace.

The build checks with `ast` that no top-level name is defined in two modules, so concatenation can't silently shadow
anything. The output is ordinary Python, about the same as today's file, so tracebacks and reading still work, and
module banners tell you which source file a line came from.

**(b) Python's built-in `zipapp`.** `python3 -m zipapp helper -m atm.cli:main` gives one `atm.pyz` that `python3`
runs directly. It needs no custom build code, but the file is a zip archive: users can't read it in a browser or an
editor, and neither can Claude when a skill call fails. That conflicts with the readability constraint.

**(c) Ship the package folder (`plugin/scripts/atm/`).** It needs no build at all and is the simplest during
development. But the plugin would contain about 9 files instead of one, which goes against the single-file
requirement. It's only worth choosing if that requirement is relaxed.

| | One file in the plugin | Readable | Build step | Effort |
|---|---|---|---|---|
| **(a) concatenate** | ✓ | ✓ | small script (~80 lines), checked by CI | medium |
| (b) zipapp | ✓ | ✗ (zip) | one command | low |
| (c) package folder | ✗ | ✓ | none | low |

## 3. Recommended layout (option a)

```
helper/
  build.py          # helper/atm/*.py -> plugin/scripts/atm.py
  atm/
    core.py         # constants, AtmError/AtmExit, output, git(), JSON and time helpers, atomic writes
    paths.py        # project root, task folder, legacy locations
    migrate.py      # migrate, .gitignore, dashboard copy
    lock.py         # the lock directory
    tasks.py        # status changes (start/done/fail/release), loading tasks.json
    claims.py       # claims store, leases, completion records, next
    merge.py        # the tasks.json merge driver, init
    server.py       # serve start/stop/status, the server process
    cli.py          # usage text, command table, main()
```

**Workflow**
- `npm run build:helper` (also part of `npm run build` and `npm run verify`) regenerates `plugin/scripts/atm.py`.
- The pre-commit hook rebuilds and stages it when `helper/` changes, like the dashboard.
- CI rebuilds and fails if the committed file is stale (the dashboard's freshness check, extended).
- `tests/scripts/` keeps testing the built file through the launcher, exactly as users run it, so the move itself is
  proven by the existing 82 tests passing unchanged. Modules can also get direct Python unit tests where useful.
- Root `CLAUDE.md` documents the layout and says to edit `helper/atm/`, never the generated file.

## 4. Plan once approved

1. Add `helper/build.py` with the name-collision check, and a test that the build is deterministic.
2. Move the code into modules one section at a time. After each move, the build must give a file with identical
   behaviour, checked by `tests/scripts`.
3. Wire up the npm scripts, the pre-commit hook and the CI freshness check, then update CLAUDE.md.

## 5. Question for you

Option (a), concatenating into one readable file? If you'd rather relax the single-file rule, (c) is simpler.
