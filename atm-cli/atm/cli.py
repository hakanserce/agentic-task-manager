"""The command line: one argparse parser, a subparser per command, and main().

Every command takes --json. Usage errors keep atm's format ("atm: <message>", exit code 2) followed by the command's
usage line; with --json, every error is {"error": "...", "code": N} on stderr, with the same exit code.
"""

import argparse
import sys

from .claims import cmd_claims, cmd_heartbeat, cmd_next
from .core import AtmError, AtmExit, out, plugin_version, to_json
from .lock import cmd_lock_test
from .merge import cmd_init, cmd_merge_driver
from .migrate import cmd_migrate
from .paths import cmd_paths
from .server import DEFAULT_PORT, cmd_serve, cmd_serve_child
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
                 the task /atm:loop-tasks works on next (lowest phase, then most urgent priority, then
                 lowest ID); --claim also starts and claims it, atomically (exit code 3 if there is none)
  heartbeat <id> extend your claim's lease
  init           give tasks.json a meta.id if it has none, and register the tasks.json merge driver in this
                 clone (migrate registers the driver too)
  merge-driver <base> <ours> <theirs>
                 git merge driver for tasks.json (see .agentic-task-manager/.gitattributes)
  claims [--json]
                 list live claims, shared by all worktrees of this clone
                 (start/done/fail/release/heartbeat take --agent NAME and --json; start/done/fail/release and
                 next --claim take --status ID to pick a status when the project has several of that kind)
  help           show this help

Every command takes --json, and `atm <command> --help` describes it.
"""


class Parser(argparse.ArgumentParser):
    """Usage errors as AtmError (exit code 2), so they are reported like every other error."""

    def error(self, message):
        raise AtmError(f"{message}\n{self.format_usage().strip()}", 2)


def cmd_version(args):
    out(to_json({"version": plugin_version()}) if args.json else plugin_version())


def cmd_help(args):
    if args.json:
        out(to_json({"usage": USAGE}))
    else:
        sys.stdout.write(USAGE)


def build_parser():
    parser = Parser(prog="atm", add_help=False)
    commands = parser.add_subparsers(dest="command", parser_class=Parser)

    def command(name, run, description, hidden=False):
        sub = commands.add_parser(name, description=description, help=argparse.SUPPRESS if hidden else description)
        sub.add_argument("--json", action="store_true", help="print the result as JSON")
        sub.set_defaults(run=run)
        return sub

    def agent_option(sub):
        sub.add_argument("--agent", metavar="NAME", help="who you are (default: ATM_AGENT, else this session)")

    def status_option(sub):
        sub.add_argument(
            "--status",
            metavar="ID",
            help="the status to move to when the project has several of that kind (default: the first listed)",
        )

    command("version", cmd_version, "print the plugin version")
    command("help", cmd_help, "show the list of commands")
    command("paths", cmd_paths, "print where this project's task files are")
    command("migrate", cmd_migrate, "move an old tasks.json into .agentic-task-manager/ and set the folder up")

    serve = command("serve", cmd_serve, "run the dashboard server for this project in the background")
    serve.add_argument("action", nargs="?", default="start", choices=["start", "stop", "status"])
    serve.add_argument("--open", action="store_true", help="also open the dashboard in the browser")
    serve.add_argument("--port", type=int, default=DEFAULT_PORT, help="the port to try first")

    for name, description in (
        ("start", "mark a task in_progress and claim it (its dependencies must be done)"),
        ("done", "mark an in_progress task done and drop its claim"),
        ("fail", "put an in_progress task back to todo, recording why"),
        ("release", "put an in_progress task back to todo"),
    ):
        sub = command(name, cmd_status_change(name), description)
        sub.add_argument("id", help="the task ID")
        agent_option(sub)
        status_option(sub)
        if name == "fail":
            sub.add_argument("--reason", metavar="TEXT", help="why it failed")

    next_ = command("next", cmd_next, "the task /atm:loop-tasks works on next (exit code 3 if there is none)")
    next_.add_argument("--phase", type=float, help="only this phase")
    next_.add_argument("--type", help="only this task type")
    next_.add_argument("--claim", action="store_true", help="also start and claim it, atomically")
    agent_option(next_)
    status_option(next_)

    heartbeat = command("heartbeat", cmd_heartbeat, "extend your claim's lease")
    heartbeat.add_argument("id", help="the task ID")
    agent_option(heartbeat)

    command("init", cmd_init, "give tasks.json a meta.id, and register the tasks.json merge driver")
    merge = command("merge-driver", cmd_merge_driver, "git merge driver for tasks.json")
    for side in ("base", "ours", "theirs"):
        merge.add_argument(side)
    command("claims", cmd_claims, "list live claims, shared by all worktrees of this clone")

    child = command("_serve-child", cmd_serve_child, "the detached server process", hidden=True)
    child.add_argument("task_dir")
    child.add_argument("port", type=int)
    lock_test = command("_lock-test", cmd_lock_test, "test hook: hold the lock", hidden=True)
    lock_test.add_argument("seconds", type=float, nargs="?", default=0.0)
    return parser, commands.choices


def report(error, as_json):
    if as_json:
        sys.stderr.write(to_json({"error": str(error), "code": error.code}) + "\n")
    else:
        sys.stderr.write(f"atm: {error}\n")


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        sys.stdout.write(USAGE)
        return 0
    parser, commands = build_parser()
    as_json = "--json" in argv
    if argv[0] not in commands:
        if as_json:
            report(AtmError(f"unknown command '{argv[0]}'", 2), True)
        else:
            sys.stderr.write(f"atm: unknown command '{argv[0]}'\n" + USAGE)
        return 2
    try:
        args, extra = parser.parse_known_args(argv)
        if extra:
            # Reported by the command's own parser, so the usage line is the command's
            commands[argv[0]].error(f"unrecognized arguments: {' '.join(extra)}")
        args.run(args)
    except AtmError as e:
        report(e, as_json)
        return e.code
    except AtmExit as e:
        return e.code
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
