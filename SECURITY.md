# Security

## Reporting a vulnerability

Please report it privately: open **Security → Report a vulnerability** on this repository (GitHub's private
vulnerability reporting), rather than a public issue. Say what you found, how to reproduce it, and what it lets an
attacker do. You'll get an answer within a week; a fix ships as a new plugin version, with a note in
`plugin/CHANGELOG.md` once it's out.

## What the plugin runs on your machine

atm is a Claude Code plugin. Installing it gives your agent the `/atm:*` skills and the `atm` command, and runs two
hooks **automatically**:

| When | Runs | What it does |
|---|---|---|
| after every tool call | `atm heartbeat --auto` | renews the agent's claims on its tasks: reads the claims store, and writes it only when a claim's last renewal is ten minutes old |
| at session start | `atm serve --refresh` | if the dashboard server is running an older dashboard than the plugin, restarts it |

Both are the plugin's own code, from the version you installed. `/plugin marketplace update` installs the newest
version from this repository's `main` branch, which is why changes reach `main` only through reviewed pull requests
with passing checks.

## What atm never does

- run your task text as commands: the skills tell agents that task names, descriptions and notes describe work, and
  to stop and ask when a task asks for commands, credentials, CI or git config changes;
- run a shell or evaluate code: `atm` runs `git` with argument lists, nothing else;
- read or write outside your project's `.agentic-task-manager/` folder through a symlink;
- accept a request that changes anything over HTTP: the dashboard server only reads, answers on `localhost` only, and
  refuses requests for any other host name;
- contact any server but GitHub (through `gh`, when the push skill opens a pull request) and its own on `localhost`.

The full threat model, the rules each change keeps and the tests that check them are in
[`docs/security-architecture.md`](docs/security-architecture.md).
