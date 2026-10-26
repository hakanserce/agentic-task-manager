"""`atm repository`: the project's repository web address in meta.repository (e.g. https://github.com/o/r), which the
dashboard uses to link commits and pull requests. Git remotes are turned into that address."""

import os
import re

from .core import AtmError, git, out, to_json, write_json_atomic
from .lock import locked
from .model import load_tasks
from .paths import find_paths

SCP_REMOTE = re.compile(r"^(?:[\w.-]+@)?([\w.-]+):(?!//)(.+)$")  # git@github.com:o/r.git
URL = re.compile(r"^(https?|ssh|git)://(?:[^@/]+@)?([^/:]+)(?::\d+)?(/.*)?$")


def repository_url(text):
    """The web address of a repository: an http(s) URL as given, or a git remote turned into one
    (git@github.com:o/r.git, ssh://git@github.com/o/r.git, https://github.com/o/r.git -> https://github.com/o/r).
    Credentials, a trailing .git and a trailing slash go. None if it isn't one."""
    text = (text or "").strip()
    m = URL.match(text)
    if m:
        scheme, host, path = m.group(1), m.group(2), (m.group(3) or "")
        web = "https" if scheme in ("ssh", "git") else scheme
    else:
        m = SCP_REMOTE.match(text)
        if not m or "/" in m.group(1):
            return None
        web, host, path = "https", m.group(1), "/" + m.group(2)
    path = re.sub(r"\.git/?$", "", path.rstrip("/")).rstrip("/")
    if not host or "." not in host and host != "localhost" or not path.strip("/"):
        return None
    return f"{web}://{host}{path}"


def origin_repository(root):
    """The web address of the clone's origin remote, or None."""
    return repository_url(git(["remote", "get-url", "origin"], root) or "")


def ensure_repository(paths):
    """Fill meta.repository from origin when tasks.json has none. Returns the address it set, or None."""
    if not os.path.isfile(paths["tasks"]):
        return None
    url = origin_repository(paths["root"])
    if not url:
        return None
    with locked(paths["dir"]):
        data = load_tasks(paths)
        meta = data.setdefault("meta", {})
        if meta.get("repository"):
            return None
        meta["repository"] = url
        write_json_atomic(paths["tasks"], data)
    return url


def cmd_repository(args):
    paths = find_paths(os.getcwd())
    if args.action is None:
        if args.url is not None:
            raise AtmError(f"unexpected argument '{args.url}' (atm repository set URL)", 2)
        current = load_tasks(paths).get("meta", {}).get("repository")
        if args.json:
            out(to_json({"repository": current or None}))
        elif current:
            out(current)
        else:
            out("No repository address yet. Set it with `atm repository set <url>` (a git remote works too).")
        return
    url = repository_url(args.url)
    if not url:
        raise AtmError(f"{args.url!r} is not a repository address: give an http(s) URL or a git remote", 2)
    with locked(paths["dir"]):
        data = load_tasks(paths)
        data.setdefault("meta", {})["repository"] = url
        write_json_atomic(paths["tasks"], data)
    out(to_json({"repository": url}) if args.json else f"Repository address set: {url}")
