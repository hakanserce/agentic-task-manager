"""The command table and main()."""

import sys

from .claims import cmd_claims, cmd_heartbeat, cmd_next
from .core import AtmError, AtmExit, out, plugin_version
from .lock import cmd_lock_test
from .merge import cmd_init, cmd_merge_driver
from .migrate import cmd_migrate
from .paths import cmd_paths
from .server import cmd_serve, cmd_serve_child
from .tasks import cmd_status_change

USAGE = """usage: atm <command> [options]

commands:
  version        print the plugin version
  paths [--json] print where this project's task files are
  migrate [--json]
                 move tasks.json from docs/ or the root into .agentic-task-manager/,
                 and set up the folder (.gitignore, current dashboard)
  serve [start|stop|status] [--open] [--port N]
                 run the dashboard server for this project in the background
  start <id>     mark a task in_progress and claim it (its dependencies must be done)
  done <id>      mark an in_progress task done and drop its claim
  fail <id> [--reason TEXT]
                 put an in_progress task back to todo, recording why
  release <id>   put an in_progress task back to todo
  next [--phase N] [--type T] [--claim] [--json]
                 the task /atm:loop-tasks works on next; --claim also starts and claims it,
                 atomically (exit code 3 if there is none)
  heartbeat <id> extend your claim's lease
  init           give tasks.json a meta.id if it has none, and register the tasks.json merge driver in this
                 clone (migrate registers the driver too)
  merge-driver <base> <ours> <theirs>
                 git merge driver for tasks.json (see .agentic-task-manager/.gitattributes)
  claims [--json]
                 list live claims, shared by all worktrees of this clone
                 (start/done/fail/release/heartbeat take --agent NAME and --json)
  help           show this help
"""


def cmd_version(args):
    out(plugin_version())


def cmd_help(args):
    sys.stdout.write(USAGE)


COMMANDS = {
    "version": cmd_version,
    "paths": cmd_paths,
    "migrate": cmd_migrate,
    "serve": cmd_serve,
    "start": cmd_status_change("start"),
    "done": cmd_status_change("done"),
    "fail": cmd_status_change("fail"),
    "release": cmd_status_change("release"),
    "next": cmd_next,
    "heartbeat": cmd_heartbeat,
    "init": cmd_init,
    "merge-driver": cmd_merge_driver,
    "claims": cmd_claims,
    "_serve-child": cmd_serve_child,
    "_lock-test": cmd_lock_test,
    "help": cmd_help,
}


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        sys.stdout.write(USAGE)
        return 0
    command = COMMANDS.get(argv[0])
    if not command:
        sys.stderr.write(f"atm: unknown command '{argv[0]}'\n" + USAGE)
        return 2
    try:
        command(argv[1:])
    except AtmError as e:
        sys.stderr.write(f"atm: {e}\n")
        return e.code
    except AtmExit as e:
        return e.code
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
