"""The status commands: start, done, fail, release."""

import os

from .claims import (
    agent_identity,
    check_holder,
    completion,
    expire_claims,
    locked_with_claims,
    new_claim,
    read_store,
    report_expired,
    write_store,
)
from .core import AtmError, out, parse_options, to_json, write_json_atomic
from .model import change_status, find_task, load_tasks
from .paths import find_paths


def cmd_status_change(command):
    def run(args):
        positional, values = parse_options(args, flags=("--json",), options=("--reason", "--agent"))
        if len(positional) != 1:
            raise AtmError(f"usage: atm {command} <task id>", 2)
        task_id, agent = positional[0], agent_identity(values)
        paths = find_paths(os.getcwd())
        with locked_with_claims(paths):
            data = load_tasks(paths)
            store = read_store(paths)
            claims = store["claims"]
            expired = expire_claims(paths, data, claims)
            task = find_task(data, task_id)
            check_holder(claims, task_id, agent, command)
            previous = change_status(task, data, command, values.get("--reason"), agent)
            if command == "start":
                claims[task_id] = new_claim(paths, data, task_id, agent)
                store["completed"].pop(task_id, None)  # starting a task again on purpose
            else:
                claims.pop(task_id, None)
            if command == "done":
                store["completed"][task_id] = completion(paths, task_id, agent)
            write_json_atomic(paths["tasks"], data)
            write_store(paths, store)
        report_expired(expired)
        if "--json" in values:
            out(to_json({**task, "claim": claims.get(task_id)}))
        else:
            out(f"{task['id']}: {previous} -> {task['status']}")

    return run
