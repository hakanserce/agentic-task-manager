"""`atm serve`: one dashboard server per user, a detached process serving every registered project.

The server holds the plugin's dashboard in memory and serves each registered project's task files under /p/<id>/.
Its routes and record are described in docs/multi-project-api.md.
"""

import hashlib
import json
import os
import re
import signal
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone
from urllib.parse import urlsplit

from .core import (
    PLUGIN_ROOT,
    TASK_DIR,
    TASKS_FILE,
    AtmError,
    format_duration,
    now_iso,
    out,
    parse_iso,
    pid_alive,
    read_json,
    to_json,
    write_json_atomic,
)
from .migrate import TEMPLATE, dashboard_head, describe_migration, migrate
from .paths import find_paths
from .registry import REGISTRY_FILE, atm_home, listed, main_worktree, project_id, project_meta, register

SERVER_RECORD = "server.json"
SERVER_LOG = "server.log"
DEFAULT_PORT = 8765
PORT_TRIES = 100
WHOAMI = "/__atm/whoami"
PROJECT_FILES = ("tasks.json", "claims.json", "tasks-archive.json")
PROJECT_FILE = re.compile(r"/p/([^/]+)/(" + "|".join(re.escape(f) for f in PROJECT_FILES) + r")")


def server_url(port, project=None):
    return f"http://localhost:{port}/" + (f"#project={project}" if project else "")


def whoami(port):
    """Ask the server on this port who it is; None if nothing (or not an atm server) answers."""
    try:
        request = urllib.request.Request(f"http://localhost:{port}{WHOAMI}")
        with urllib.request.urlopen(request, timeout=1) as response:
            info = json.loads(response.read().decode("utf-8"))
    except (OSError, ValueError):
        return None
    return info if isinstance(info, dict) and info.get("atm") else None


def live_server(home):
    """The record of the user's running server, or None. A stale record is removed."""
    record_path = os.path.join(home, SERVER_RECORD)
    record = read_json(record_path)
    if record is None:
        return None
    info = whoami(record.get("port"))
    if info and info.get("pid") == record.get("pid"):
        return record
    os.remove(record_path)
    return None


def open_browser(url):
    opener = "open" if sys.platform == "darwin" else "xdg-open"
    try:
        subprocess.Popen([opener, url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError:
        out(f"Could not open a browser; open {url} yourself.")


def ensure_server(home, port):
    """The running server's record, starting the server if none runs. Returns (record, started)."""
    record = live_server(home)
    if record:
        return record, False
    os.makedirs(home, exist_ok=True)
    with open(os.path.join(home, SERVER_LOG), "ab") as log:
        child = subprocess.Popen(
            [sys.executable, os.path.abspath(__file__), "_serve-child", home, str(port)],
            cwd=home,
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=log,
            start_new_session=True,
        )
    deadline = time.time() + 10
    while time.time() < deadline:
        record = read_json(os.path.join(home, SERVER_RECORD))
        if record and record.get("pid") == child.pid and whoami(record["port"]):
            return record, True
        if child.poll() is not None:
            break
        time.sleep(0.05)
    raise AtmError(f"the dashboard server did not start; see {os.path.join(home, SERVER_LOG)}")


def project_for(paths):
    """(id, listed) of the project at `paths`, after registering it."""
    register(paths)
    path = main_worktree(paths["root"])
    meta = project_meta(path) or project_meta(paths["root"]) or {}
    return project_id(meta, path), listed(meta)


def serve_start(paths, port, overview):
    """Start (or reuse) the server; returns the URL to show: the project's, or the overview's."""
    project = None
    if not overview:
        for line in describe_migration(migrate(paths), paths):
            if line != "Nothing to migrate.":
                out(line)
        if not os.path.isfile(paths["tasks"]):
            raise AtmError("no tasks.json to serve. Run /atm:create-tasks first.")
        project, shown = project_for(paths)
        if not shown:
            out("This project isn't listed on the dashboard (meta.dashboard.listed is false).")
            project = None
    home = atm_home()
    record, started = ensure_server(home, port)
    url = server_url(record["port"], project)
    out(f"Dashboard server {'started' if started else 'already running'}: {url}")
    return url


def serve_stop(home):
    record_path = os.path.join(home, SERVER_RECORD)
    record = read_json(record_path)
    if record is None:
        out("Dashboard server is not running.")
        return
    info = whoami(record.get("port"))
    if not (info and info.get("pid") == record.get("pid")):
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


def serve_status(home, as_json):
    record = live_server(home)
    if as_json:
        out(to_json({"running": bool(record), **(record or {}), "url": server_url(record["port"]) if record else None}))
        return
    if not record:
        out("Dashboard server is not running.")
        return
    up = format_duration((datetime.now(timezone.utc) - parse_iso(record["started_at"])).total_seconds())
    out(
        f"Dashboard server running: {server_url(record['port'])} "
        f"(pid {record['pid']}, dashboard {record.get('version')}, up {up})"
    )


def cmd_serve(args):
    # --dir acts on another project without a cd (which permission rules can't check)
    cwd = os.path.abspath(args.dir) if args.dir else os.getcwd()
    if not os.path.isdir(cwd):
        raise AtmError(f"--dir {args.dir}: not a directory", 2)
    home = atm_home()
    if args.action == "start":
        url = serve_start(find_paths(cwd), args.port, args.all)
        if args.open:
            open_browser(url)
    elif args.action == "stop":
        serve_stop(home)
    else:
        serve_status(home, args.json)


def file_stamp(p):
    """(size, nanosecond mtime) of a file, or None if it doesn't exist."""
    try:
        st = os.stat(p)
    except OSError:
        return None
    return (st.st_size, st.st_mtime_ns)


def file_etag(stamp):
    """A strong ETag from a file's size and nanosecond mtime. Last-Modified alone has one-second resolution, so two
    atm changes in the same second would look unchanged to the dashboard."""
    return f'"{stamp[0]:x}-{stamp[1]:x}"'


class Registry:
    """The registry as the server sees it, re-read when projects.json changes."""

    def __init__(self, home):
        self.path = os.path.join(home, REGISTRY_FILE)
        self.stamp = None
        self.projects = []

    def entries(self):
        stamp = file_stamp(self.path)
        if stamp != self.stamp:
            data = read_json(self.path)
            entries = data.get("projects") if isinstance(data, dict) else None
            self.projects = [e for e in entries or [] if isinstance(e, dict) and isinstance(e.get("path"), str)]
            self.stamp = stamp
        return self.projects

    def find(self, project):
        return next((e for e in self.entries() if e.get("id") == project), None)


def task_file(entry, name):
    return os.path.join(entry["path"], TASK_DIR, name)


def api_projects(registry):
    """(body, ETag) of /api/projects. The ETag changes with the registry and each project's tasks.json and claims."""
    entries = registry.entries()
    stamps = [registry.stamp] + [
        (file_stamp(task_file(e, TASKS_FILE)), file_stamp(task_file(e, "claims.json"))) for e in entries
    ]
    etag = '"' + hashlib.sha1(repr(stamps).encode("utf-8")).hexdigest()[:16] + '"'
    projects = [
        {
            "id": e.get("id"),
            "name": e.get("name"),
            "path": e["path"],
            "missing": not os.path.isfile(task_file(e, TASKS_FILE)),
            "summary": None,
        }
        for e in entries
    ]
    return to_json({"generated_at": now_iso(), "projects": projects}).encode("utf-8"), etag


def cmd_serve_child(args):
    """The detached server process: serve on the first free port from `port`, record it, run until stopped."""
    import http.server
    import socketserver

    home, port = args.home, args.port
    record_path = os.path.join(home, SERVER_RECORD)
    with open(TEMPLATE, "rb") as f:
        page = f.read()
    version, build = dashboard_head(TEMPLATE)
    registry = Registry(home)

    class Handler(http.server.BaseHTTPRequestHandler):
        server_version = "atm"

        def send(self, status, body=b"", content_type="application/json", etag=None):
            self.send_response(status)
            if body or status == 200:
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(body)))
            if etag:
                self.send_header("ETag", etag)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if body and self.command != "HEAD":
                self.wfile.write(body)

        def send_error_json(self, status, message):
            self.send(status, to_json({"error": message}).encode("utf-8"))

        def send_conditional(self, body_fn, etag, content_type="application/json"):
            if self.headers.get("If-None-Match") == etag:
                # Unchanged since the dashboard's last poll: it skips parsing and re-rendering (D-5.1)
                self.send(304, etag=etag)
                return
            self.send(200, body_fn(), content_type, etag)

        def do_GET(self):
            port_now = self.server.server_address[1]
            if self.headers.get("Host") not in (f"localhost:{port_now}", f"127.0.0.1:{port_now}"):
                # A page on another site that points its own domain at 127.0.0.1 (DNS rebinding) is refused
                self.send_error_json(403, "unexpected Host header")
                return
            path = urlsplit(self.path).path
            if path == "/":
                self.send(200, page, "text/html; charset=utf-8")
            elif path == WHOAMI:
                info = {"atm": True, "pid": os.getpid(), "port": port_now, "version": version, "build": build}
                self.send(200, to_json(info).encode("utf-8"))
            elif path == "/api/projects":
                body, etag = api_projects(registry)
                self.send_conditional(lambda: body, etag)
            else:
                self.serve_project_file(path)

        do_HEAD = do_GET

        def serve_project_file(self, path):
            match = PROJECT_FILE.fullmatch(path)
            if not match:
                self.send_error_json(404, "not found")
                return
            entry = registry.find(match.group(1))
            if entry is None:
                self.send_error_json(404, "unknown project")
                return
            p = task_file(entry, match.group(2))
            stamp = file_stamp(p)
            if stamp is None:
                self.send_error_json(404, "not found")
                return

            def read():
                with open(p, "rb") as f:
                    return f.read()

            self.send_conditional(read, file_etag(stamp))

        def not_allowed(self):
            self.send_error_json(405, "only GET and HEAD")

        do_POST = do_PUT = do_DELETE = do_PATCH = do_OPTIONS = not_allowed

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
        "version": version,
        "build": build,
        "plugin_root": PLUGIN_ROOT,
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
