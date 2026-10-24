"""The project's workflow (meta.workflow: direct or pull-request, docs/v4/skills-and-workflows.md §1) and the git
side of tasks: atm workflow."""

import os

from .core import AtmError, git, out, to_json, write_json_atomic
from .lock import locked
from .model import WORKFLOW_TYPES, load_tasks, workflow_of
from .paths import find_paths


def default_base(root):
    """The remote's default branch (origin/HEAD), else main."""
    ref = git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], root)
    return ref.split("/", 1)[1] if ref and "/" in ref else "main"


def describe_workflow(workflow, root):
    if workflow is None:
        return "No workflow set: /atm:push asks for one, or run `atm workflow set direct|pull-request`."
    trailers = workflow.get("trailers")
    lines = [
        f"workflow: {workflow['type']}",
        "  base: " + (workflow["base"] if workflow.get("base") else f"{default_base(root)} (the remote's default branch)"),
        f"  verify before pushing: {'yes' if workflow['verify'] else 'no'}",
        f"  CI fix rounds: {workflow['max_rounds']}",
        f"  commit message: {workflow['commit_template']}",
        "  trailers: "
        + (
            "none (Co-Authored-By lines are removed)"
            if trailers == "forbid"
            else ("required: " + "; ".join(trailers["require"]) if isinstance(trailers, dict) else "as the agent writes them")
        ),
    ]
    return "\n".join(lines)


def cmd_workflow(args):
    paths = find_paths(os.getcwd())
    if args.action is None:
        workflow = workflow_of(load_tasks(paths))
        out(to_json(workflow or {"type": None}) if args.json else describe_workflow(workflow, paths["root"]))
        return
    if args.type not in WORKFLOW_TYPES:
        raise AtmError(f"atm workflow set needs a type: {' or '.join(WORKFLOW_TYPES)}", 2)
    changes = {"type": args.type}
    if args.base is not None:
        changes["base"] = args.base
    if args.verify is not None:
        changes["verify"] = args.verify == "true"
    if args.max_rounds is not None:
        changes["max_rounds"] = args.max_rounds
    if args.commit_template is not None:
        changes["commit_template"] = args.commit_template
    if args.trailers == "forbid":
        changes["trailers"] = "forbid"
    elif args.trailers == "require":
        if not args.trailer:
            raise AtmError("--trailers require needs at least one --trailer LINE", 2)
        changes["trailers"] = {"require": args.trailer}
    with locked(paths["dir"]):
        data = load_tasks(paths)
        if not isinstance(data.get("meta"), dict):
            data["meta"] = {}
        current = data["meta"].get("workflow") if isinstance(data["meta"].get("workflow"), dict) else {}
        workflow = {**current, **changes}
        if args.trailers == "none":
            workflow.pop("trailers", None)
        data["meta"]["workflow"] = workflow
        effective = workflow_of(data)  # validates before anything is written
        write_json_atomic(paths["tasks"], data)
    out(to_json(effective) if args.json else describe_workflow(effective, paths["root"]))
