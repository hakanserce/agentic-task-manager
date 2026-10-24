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
from .edit import cmd_add, cmd_check, cmd_edit
from .query import cmd_deps, cmd_list, cmd_show, cmd_status
from .tasks import cmd_note, cmd_status_change

USAGE = """usage: atm <command> [options]

commands:
  version        print the plugin version
  paths [--json] print where this project's task files are
  migrate [--json]
                 move tasks.json from docs/ or the root into .agentic-task-manager/,
                 and set up the folder (.gitignore, current dashboard)
  serve [start|stop|status] [--open] [--port N]
                 run the dashboard server for this project in the background
  status         the overview: counts, what is in progress, in review or blocked, the next task
  show <id>...   tasks in full (description, dependencies, files, notes)
  list [--status S] [--phase N] [--type T] [--priority P] [--label L] [--agent A] [--ready] [--blocked]
                 one line per task: ID, status, phase, priority, labels, name
  deps <id>      what a task waits for, and what waits for it
  start <id>     mark a task in_progress and claim it (its dependencies must be done); prints the task
  review <id> [--note TEXT]
                 ask for a review of a finished task: in_review, and its claim is released
  done <id> [--note TEXT] [--commit SHA]
                 mark an in_progress or in_review task done and drop its claim; the note is a one-line
                 outcome (for a task in review, done means the review passed); prints the tasks now ready
  reject <id> --reason TEXT
                 send a task in review back to todo, with what needs to change
  fail <id> [--reason TEXT]
                 put an in_progress task back to todo, recording why (a failure note)
  release <id> [--note TEXT]
                 put an in_progress task back to todo; the note is a handoff for the next agent
  note <id> TEXT add a note to a task (at most 500 characters)
  add --name N --phase P --type T [--priority P] [--label L]... [--description D] [--dep ID]... [--file F]...
                 add a task with the next ID; add --json-file F adds many (see atm add --help)
  edit <id> [--name] [--description] [--phase] [--type] [--priority] [--add-dep/--remove-dep ID]
            [--add-file/--remove-file F] [--add-label/--remove-label L]
                 change a task's definition (its status changes only through the status commands)
  check          check tasks.json: schema, vocabularies, dependencies (exit code 1 on errors)
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
                 (status commands and heartbeat take --agent NAME and --json; status commands and next --claim
                 take --status ID to pick a status when the project has several of that kind)
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
        ("review", "ask for a review of a finished task: in_review, its claim released"),
        ("done", "mark an in_progress or in_review task done and drop its claim"),
        ("fail", "put an in_progress task back to todo, recording why"),
        ("release", "put an in_progress task back to todo"),
        ("reject", "send a task in review back to todo, recording why"),
    ):
        sub = command(name, cmd_status_change(name), description)
        sub.add_argument("id", help="the task ID")
        agent_option(sub)
        status_option(sub)
        if name == "fail":
            sub.add_argument("--reason", metavar="TEXT", help="why it failed (kept as a failure note)")
        if name == "release":
            sub.add_argument("--note", metavar="TEXT", help="a handoff for whoever picks it up next")
        if name == "review":
            sub.add_argument("--note", metavar="TEXT", help="what the reviewer should look at")
        if name == "reject":
            sub.add_argument("--reason", metavar="TEXT", required=True, help="what needs to change (a rejection note)")
        if name == "done":
            sub.add_argument("--note", metavar="TEXT", help="a one-line outcome")
            sub.add_argument("--commit", metavar="SHA", help="the task's commit")

    next_ = command("next", cmd_next, "the task /atm:loop-tasks works on next (exit code 3 if there is none)")
    next_.add_argument("--phase", type=float, help="only this phase")
    next_.add_argument("--type", help="only this task type")
    next_.add_argument("--claim", action="store_true", help="also start and claim it, atomically")
    agent_option(next_)
    status_option(next_)

    show = command("show", cmd_show, "tasks in full: what an agent needs to work on them")
    show.add_argument("ids", nargs="+", metavar="id", help="task IDs")
    list_ = command("list", cmd_list, "one line per task: ID, status, phase, priority, labels, name")
    list_.add_argument("--status", action="append", metavar="ID", help="only these statuses (repeatable)")
    list_.add_argument("--phase", type=float, help="only this phase")
    list_.add_argument("--type", help="only this task type")
    list_.add_argument("--priority", help="only this priority (a missing one counts as the default)")
    list_.add_argument("--label", action="append", help="only tasks with this label (repeatable: all of them)")
    list_.add_argument("--agent", metavar="NAME", help="only tasks started by this agent")
    list_.add_argument("--ready", action="store_true", help="only to-do tasks whose dependencies are done")
    list_.add_argument("--blocked", action="store_true", help="only blocked tasks and to-do tasks still waiting")
    command(
        "status",
        cmd_status,
        "the overview: counts, what is in progress, in review or blocked, the next task, the file's size",
    )
    deps = command("deps", cmd_deps, "what a task waits for, and what waits for it")
    deps.add_argument("id", help="the task ID")

    add = command("add", cmd_add, "add a task with the next ID, or many from a JSON file")
    add.add_argument("--name", help="a short name (about 60 characters)")
    add.add_argument("--phase", type=float, help="the phase number")
    add.add_argument("--type", help="the task type (one of the project's types)")
    add.add_argument("--priority", help="the priority (default: none, which counts as the project's default)")
    add.add_argument("--label", action="append", default=[], help="a label (repeatable)")
    describe = add.add_mutually_exclusive_group()
    describe.add_argument("--description", default="", help="what exactly to do")
    describe.add_argument("--description-file", metavar="FILE", help="read the description from a file")
    add.add_argument("--dep", action="append", default=[], metavar="ID", help="a task it depends on (repeatable)")
    add.add_argument("--file", action="append", default=[], help="a file it will create or change (repeatable)")
    add.add_argument("--requirement", action="append", default=[], help="a requirement ID (repeatable)")
    add.add_argument(
        "--json-file",
        metavar="FILE",
        help='add many: a JSON list of tasks; an "id" there is a placeholder (e.g. "new-1") other tasks\' '
        '"dependencies" can use, replaced by the real ID',
    )
    agent_option(add)

    edit = command("edit", cmd_edit, "change a task's definition (not its status: use the status commands)")
    edit.add_argument("id", help="the task ID")
    edit.add_argument("--name")
    edit_description = edit.add_mutually_exclusive_group()
    edit_description.add_argument("--description")
    edit_description.add_argument("--description-file", metavar="FILE")
    edit.add_argument("--phase", type=float)
    edit.add_argument("--type")
    edit.add_argument("--priority")
    for option, help_text in (
        ("file", "a file it creates or changes"),
        ("dep", "a task it depends on"),
        ("label", "a label"),
    ):
        edit.add_argument(f"--add-{option}", action="append", default=[], metavar="VALUE", help=f"add {help_text}")
        edit.add_argument(f"--remove-{option}", action="append", default=[], metavar="VALUE", help=f"remove {help_text}")
    agent_option(edit)

    check = command("check", cmd_check, "check tasks.json: the schema, the vocabularies, dependencies; exit 1 on errors")
    check.add_argument("--files", action="store_true", help="also warn about missing files listed by finished tasks")

    note = command("note", cmd_note, "add a note to a task (at most 500 characters)")
    note.add_argument("id", help="the task ID")
    note.add_argument("text", help="the note")
    agent_option(note)

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
