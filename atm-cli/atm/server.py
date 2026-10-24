"""`atm serve`: the dashboard server, a detached process per project."""

import json
import os
import signal
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone

from .core import (
    DASHBOARD_FILE,
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
from .migrate import describe_migration, migrate
from .paths import find_paths

SERVER_RECORD = ".server.json"
SERVER_LOG = ".server.log"
DEFAULT_PORT = 8000
PORT_TRIES = 100
WHOAMI = "/__atm/whoami"


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


def open_browser(url):
    opener = "open" if sys.platform == "darwin" else "xdg-open"
    try:
        subprocess.Popen([opener, url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError:
        out(f"Could not open a browser; open {url} yourself.")


def serve_start(paths, port):
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


def serve_status(paths, as_json):
    record = live_server(paths["dir"])
    if as_json:
        out(to_json({"running": bool(record), **(record or {}), "url": server_url(record["port"]) if record else None}))
        return
    if not record:
        out("Dashboard server is not running.")
        return
    up = format_duration((datetime.now(timezone.utc) - parse_iso(record["started_at"])).total_seconds())
    out(f"Dashboard server running: {server_url(record['port'])} (pid {record['pid']}, up {up})")


def cmd_serve(args):
    paths = find_paths(os.getcwd())
    if args.action == "start":
        record = serve_start(paths, args.port)
        if args.open:
            open_browser(server_url(record["port"]))
    elif args.action == "stop":
        serve_stop(paths)
    else:
        serve_status(paths, args.json)


def cmd_serve_child(args):
    """The detached server process: serve task_dir on the first free port from `port`, record it, run until stopped."""
    import http.server
    import socketserver

    task_dir, port = args.task_dir, args.port
    record_path = os.path.join(task_dir, SERVER_RECORD)

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=task_dir, **kw)

        def do_GET(self):
            path = self.path.split("?", 1)[0]
            if path == WHOAMI:
                body = json.dumps({"atm": True, "folder": task_dir, "pid": os.getpid()}).encode()
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
