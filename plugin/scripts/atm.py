"""atm: the Agentic Task Manager helper (Python implementation).

Twin of atm.mjs: both must behave identically (same commands, output, exit codes and files), and are kept in the same
structure so a change to one maps line by line onto the other. Run through the `atm` launcher. Standard library only.
"""

import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PLUGIN_ROOT = os.path.dirname(SCRIPT_DIR)
TASK_DIR = ".agentic-task-manager"
TASKS_FILE = "tasks.json"
DASHBOARD_FILE = "tasks-dashboard.html"
LEGACY_DIRS = ["docs", "."]
TEMPLATE = os.path.join(PLUGIN_ROOT, "templates", DASHBOARD_FILE)
# Runtime files in the task folder that must not be committed (the dashboard is a copy of the plugin's template)
IGNORED = ["tasks-dashboard.html", ".server.json", ".server.log", "claims.json", ".lock/"]
VERSION_META = re.compile(r'<meta name="atm-dashboard-version" content="([^"]*)"')
RUNTIME = "python"
SERVER_RECORD = ".server.json"
SERVER_LOG = ".server.log"
DEFAULT_PORT = 8000
PORT_TRIES = 100
WHOAMI = "/__atm/whoami"

USAGE = """usage: atm <command> [options]

commands:
  version        print the plugin version
  paths [--json] print where this project's task files are
  migrate [--json]
                 move tasks.json from docs/ or the root into .agentic-task-manager/,
                 and set up the folder (.gitignore, current dashboard)
  serve [start|stop|status] [--open] [--port N]
                 run the dashboard server for this project in the background
  help           show this help
"""


class AtmError(Exception):
    def __init__(self, message, code=1):
        super().__init__(message)
        self.code = code


# ---- helpers ----


def out(text=""):
    sys.stdout.write(text + "\n")


def to_json(value):
    return json.dumps(value, indent=2, ensure_ascii=False)


def git(args, cwd):
    """Run git; return stdout stripped, or None if git fails or isn't installed."""
    try:
        result = subprocess.run(["git"] + args, cwd=cwd, capture_output=True, text=True)
    except OSError:
        return None
    return result.stdout.strip() if result.returncode == 0 else None


def plugin_version():
    with open(os.path.join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), encoding="utf-8") as f:
        return json.load(f)["version"]


def parse_options(args, flags=(), options=()):
    """Split args into positionals, set flags and option values. Unknown --options are usage errors."""
    positional, values = [], {}
    i = 0
    while i < len(args):
        a = args[i]
        if a in flags:
            values[a] = True
        elif a in options:
            if i + 1 >= len(args):
                raise AtmError(f"{a} needs a value", 2)
            values[a] = args[i + 1]
            i += 1
        elif a.startswith("--"):
            raise AtmError(f"unknown option {a}", 2)
        else:
            positional.append(a)
        i += 1
    return positional, values


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(text):
    return datetime.strptime(text, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def format_duration(seconds):
    seconds = max(0, int(seconds))
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        return f"{seconds // 60}m"
    return f"{seconds // 3600}h {seconds % 3600 // 60}m"


def write_json_atomic(p, value):
    tmp = f"{p}.{os.getpid()}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(to_json(value) + "\n")
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, p)


def read_json(p):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def rel(root, p):
    return os.path.relpath(p, root)


def is_tracked(root, p):
    return git(["ls-files", "--error-unmatch", "--", rel(root, p)], root) is not None


def in_git(root):
    return git(["rev-parse", "--git-dir"], root) is not None


def parse_version(text):
    parts = []
    for part in (text or "").split("."):
        m = re.match(r"\d+", part)
        parts.append(int(m.group()) if m else 0)
    return parts


def dashboard_version(p):
    try:
        with open(p, encoding="utf-8") as f:
            m = VERSION_META.search(f.read())
    except OSError:
        return None
    return m.group(1) if m else ""


def ensure_dashboard(dashboard):
    """Copy the plugin's dashboard if the project's is missing or older. Returns (action, old, new)."""
    new = dashboard_version(TEMPLATE)
    old = dashboard_version(dashboard)
    if old is not None and parse_version(old) >= parse_version(new):
        return ("current", old, new)
    os.makedirs(os.path.dirname(dashboard), exist_ok=True)
    shutil.copyfile(TEMPLATE, dashboard)
    return ("installed" if old is None else "updated", old, new)


def ensure_gitignore(task_dir):
    """Add any missing runtime entries to the folder's .gitignore, keeping the user's lines. Returns True if changed."""
    p = os.path.join(task_dir, ".gitignore")
    try:
        with open(p, encoding="utf-8") as f:
            text = f.read()
    except OSError:
        text = ""
    lines = text.splitlines()
    missing = [entry for entry in IGNORED if entry not in lines]
    if not missing:
        return False
    if not text:
        text = "# atm runtime files (managed by atm)\n"
    elif not text.endswith("\n"):
        text += "\n"
    with open(p, "w", encoding="utf-8") as f:
        f.write(text + "".join(entry + "\n" for entry in missing))
    return True


def project_root(cwd):
    """The git top level; outside git, the nearest directory with a task folder or docs/tasks.json, else cwd."""
    top = git(["rev-parse", "--show-toplevel"], cwd)
    if top:
        return top
    d = cwd
    while True:
        if os.path.isdir(os.path.join(d, TASK_DIR)) or os.path.isfile(os.path.join(d, "docs", TASKS_FILE)):
            return d
        parent = os.path.dirname(d)
        if parent == d:
            return cwd
        d = parent


def find_paths(cwd):
    root = project_root(cwd)
    task_dir = os.path.join(root, TASK_DIR)
    legacy = None
    for d in LEGACY_DIRS:
        candidate = os.path.normpath(os.path.join(root, d, TASKS_FILE))
        if os.path.isfile(candidate):
            dashboard = os.path.join(os.path.dirname(candidate), DASHBOARD_FILE)
            legacy = {"tasks": candidate, "dashboard": dashboard if os.path.isfile(dashboard) else None}
            break
    tasks = os.path.join(task_dir, TASKS_FILE)
    return {
        "root": root,
        "dir": task_dir,
        "tasks": tasks,
        "tasks_exists": os.path.isfile(tasks),
        "dashboard": os.path.join(task_dir, DASHBOARD_FILE),
        "legacy": legacy,
    }


# ---- commands ----


def cmd_version(args):
    out(plugin_version())


def cmd_paths(args):
    paths = find_paths(os.getcwd())
    if "--json" in args:
        out(to_json(paths))
        return
    for key in ["root", "dir", "tasks", "dashboard"]:
        out(f"{key}: {paths[key]}")
    if paths["legacy"]:
        out(f"legacy: {paths['legacy']['tasks']}")


def migrate(paths):
    """Move a legacy tasks.json into the task folder and set the folder up. Never commits."""
    root, task_dir, legacy = paths["root"], paths["dir"], paths["legacy"]
    result = {"moved": None, "removed_dashboard": None, "warning": None, "gitignore_updated": False, "dashboard": None}
    legacy_version = None
    if legacy and paths["tasks_exists"]:
        result["warning"] = (
            f"both {rel(root, legacy['tasks'])} and {rel(root, paths['tasks'])} exist; "
            f"using {rel(root, paths['tasks'])}. Remove the old file when you no longer need it."
        )
    elif legacy:
        os.makedirs(task_dir, exist_ok=True)
        tracked = is_tracked(root, legacy["tasks"])
        if tracked:
            if git(["mv", "--", rel(root, legacy["tasks"]), rel(root, paths["tasks"])], root) is None:
                raise AtmError(f"git mv {rel(root, legacy['tasks'])} failed")
        else:
            os.rename(legacy["tasks"], paths["tasks"])
        result["moved"] = {"from": rel(root, legacy["tasks"]), "to": rel(root, paths["tasks"]), "git": tracked}
        if legacy["dashboard"]:
            legacy_version = dashboard_version(legacy["dashboard"])
            if is_tracked(root, legacy["dashboard"]):
                git(["rm", "--cached", "-q", "--", rel(root, legacy["dashboard"])], root)
            os.remove(legacy["dashboard"])
            result["removed_dashboard"] = rel(root, legacy["dashboard"])
    if not os.path.isfile(paths["tasks"]):
        return result
    if ensure_gitignore(task_dir):
        result["gitignore_updated"] = True
        if in_git(root):
            git(["add", "--", rel(root, os.path.join(task_dir, ".gitignore"))], root)
    action, old, new = ensure_dashboard(paths["dashboard"])
    if action == "installed" and legacy_version is not None:
        # Report against the dashboard the project had before the move
        old = legacy_version
        action = "current" if parse_version(old) >= parse_version(new) else "updated"
    result["dashboard"] = {"action": action, "from": old, "to": new}
    return result


def describe_migration(r, paths):
    lines = []
    if r["warning"]:
        lines.append("warning: " + r["warning"])
    if r["moved"]:
        line = f"Moved {r['moved']['from']} to {r['moved']['to']}"
        if r["moved"]["git"]:
            line += " (staged with git mv, not committed)"
        if r["removed_dashboard"]:
            line += f"; removed {r['removed_dashboard']} (a current copy now sits next to tasks.json, ignored by git)"
        lines.append(line + ".")
    elif not os.path.isfile(paths["tasks"]):
        lines.append("No tasks.json found. Run /atm:create-tasks to create one.")
    d = r["dashboard"]
    if d and d["action"] == "installed":
        lines.append(f"Dashboard v{d['to']} installed.")
    elif d and d["action"] == "updated":
        lines.append(f"Dashboard updated from v{d['from'] or '?'} to v{d['to']}.")
    if not lines:
        lines.append("Nothing to migrate.")
    return lines


def cmd_migrate(args):
    paths = find_paths(os.getcwd())
    r = migrate(paths)
    if "--json" in args:
        out(to_json(r))
        return
    for line in describe_migration(r, paths):
        out(line)


# ---- dashboard server ----


def server_url(port):
    return f"http://localhost:{port}/{DASHBOARD_FILE}"


def whoami(port):
    """Ask the server on this port who it is; None if nothing (or not an atm server) answers."""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}{WHOAMI}", timeout=1) as response:
            info = json.loads(response.read().decode("utf-8"))
    except (OSError, ValueError):
        return None
    return info if isinstance(info, dict) and info.get("atm") else None


def live_server(task_dir):
    """The record of this folder's running server, or None. A stale record is removed."""
    record_path = os.path.join(task_dir, SERVER_RECORD)
    record = read_json(record_path)
    if record is None:
        return None
    info = whoami(record.get("port"))
    if info and info.get("folder") == task_dir and info.get("pid") == record.get("pid"):
        return record
    os.remove(record_path)
    return None


def pid_alive(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def open_browser(url):
    opener = "open" if sys.platform == "darwin" else "xdg-open"
    try:
        subprocess.Popen([opener, url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError:
        out(f"Could not open a browser; open {url} yourself.")


def serve_start(paths, values):
    for line in describe_migration(migrate(paths), paths):
        if line != "Nothing to migrate.":
            out(line)
    if not os.path.isfile(paths["tasks"]):
        raise AtmError("no tasks.json to serve. Run /atm:create-tasks first.")
    task_dir = paths["dir"]
    record = live_server(task_dir)
    if record:
        out(f"Dashboard server already running: {server_url(record['port'])}")
        return record
    port = int(values.get("--port", DEFAULT_PORT))
    with open(os.path.join(task_dir, SERVER_LOG), "ab") as log:
        child = subprocess.Popen(
            [sys.executable, os.path.abspath(__file__), "_serve-child", task_dir, str(port)],
            cwd=task_dir,
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=log,
            start_new_session=True,
        )
    deadline = time.time() + 10
    while time.time() < deadline:
        record = read_json(os.path.join(task_dir, SERVER_RECORD))
        if record and record.get("pid") == child.pid and whoami(record["port"]):
            out(f"Dashboard server started: {server_url(record['port'])}")
            return record
        if child.poll() is not None:
            break
        time.sleep(0.05)
    raise AtmError(f"the dashboard server did not start; see {os.path.join(task_dir, SERVER_LOG)}")


def serve_stop(paths):
    task_dir = paths["dir"]
    record_path = os.path.join(task_dir, SERVER_RECORD)
    record = read_json(record_path)
    if record is None:
        out("Dashboard server is not running.")
        return
    info = whoami(record.get("port"))
    if not (info and info.get("folder") == task_dir and info.get("pid") == record.get("pid")):
        os.remove(record_path)
        out(f"Dashboard server is not running (removed a stale record for pid {record.get('pid')}).")
        return
    pid = record["pid"]
    os.kill(pid, signal.SIGTERM)
    deadline = time.time() + 5
    while time.time() < deadline and pid_alive(pid):
        time.sleep(0.05)
    if os.path.exists(record_path):
        os.remove(record_path)
    out(f"Dashboard server stopped (pid {pid}).")


def serve_status(paths, values):
    record = live_server(paths["dir"])
    if "--json" in values:
        out(to_json({"running": bool(record), **(record or {}), "url": server_url(record["port"]) if record else None}))
        return
    if not record:
        out("Dashboard server is not running.")
        return
    up = format_duration((datetime.now(timezone.utc) - parse_iso(record["started_at"])).total_seconds())
    out(f"Dashboard server running: {server_url(record['port'])} (pid {record['pid']}, {record['runtime']}, up {up})")


def cmd_serve(args):
    positional, values = parse_options(args, flags=("--open", "--json"), options=("--port",))
    action = positional[0] if positional else "start"
    paths = find_paths(os.getcwd())
    if action == "start":
        record = serve_start(paths, values)
        if "--open" in values:
            open_browser(server_url(record["port"]))
    elif action == "stop":
        serve_stop(paths)
    elif action == "status":
        serve_status(paths, values)
    else:
        raise AtmError(f"unknown serve action '{action}' (use start, stop or status)", 2)


def cmd_serve_child(args):
    """The detached server process: serve task_dir on the first free port from `port`, record it, run until stopped."""
    import http.server
    import socketserver

    task_dir, port = args[0], int(args[1])
    record_path = os.path.join(task_dir, SERVER_RECORD)

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=task_dir, **kw)

        def do_GET(self):
            path = self.path.split("?", 1)[0]
            if path == WHOAMI:
                body = json.dumps({"atm": True, "folder": task_dir, "pid": os.getpid(), "runtime": RUNTIME}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            elif path == "/":
                self.send_response(302)
                self.send_header("Location", "/" + DASHBOARD_FILE)
                self.end_headers()
            else:
                super().do_GET()

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def list_directory(self, path):
            self.send_error(404)
            return None

    class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True
        allow_reuse_address = False

    server = None
    for candidate in range(port, port + PORT_TRIES):
        try:
            server = Server(("127.0.0.1", candidate), Handler)
            break
        except OSError:
            continue
    if server is None:
        sys.stderr.write(f"atm: no free port in {port}-{port + PORT_TRIES - 1}\n")
        return
    record = {
        "pid": os.getpid(),
        "port": server.server_address[1],
        "folder": task_dir,
        "runtime": RUNTIME,
        "started_at": now_iso(),
    }
    write_json_atomic(record_path, record)

    def stop(signum, frame):
        if (read_json(record_path) or {}).get("pid") == os.getpid():
            os.remove(record_path)
        os._exit(0)

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    server.serve_forever()


def cmd_help(args):
    sys.stdout.write(USAGE)


COMMANDS = {
    "version": cmd_version,
    "paths": cmd_paths,
    "migrate": cmd_migrate,
    "serve": cmd_serve,
    "_serve-child": cmd_serve_child,
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
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
