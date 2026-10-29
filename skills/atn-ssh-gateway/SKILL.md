---
name: atn-ssh-gateway
description: Use when any task needs to run commands on, read or transfer files from, or document a remote server through the SSH Gateway tools of the Athenode MCP server (exec, jobs, files, connection descriptions, services and health checks).
---
# SSH Gateway

Work with remote servers through the SSH Gateway tools of the Athenode MCP server (`list_connections`, `exec`,
`get_connection` and the others below). The gateway holds the connections (host, user, keys), runs every action on the server and
keeps an audit log. It also stores each server's documentation: a description and the services running on it,
optionally with health checks.

## Rules

- **Only the gateway tools reach the servers.** Never fall back to `ssh`, `scp`, `rsync` or `sftp` from a shell, even
  when the gateway fails. If a connection's status isn't `ok` or the gateway is unavailable, stop and tell the user.
- **Read the documentation first.** Before acting on a server, `get_connection <name>`: its description and services
  say what runs there and how. Treat them as the source of truth; when the server contradicts them, they are stale —
  tell the user and update them (see "Documenting a server").
- **Keep the documentation in sync with the server.** Whenever you add, change or remove something on a server
  (a container, daemon, timer or cron job, its config, ports, domains, paths, networks, firewall, access), update its
  documentation in the same task: a new service → `add_service`; a changed one → `update_service` (description, and
  its check if names, ports or paths changed); a removed one → `remove_service`; host-wide changes →
  `set_connection_description`. The task isn't done until `get_connection` matches the server.
- **Give a precise `reason`** on every call that takes one: it is kept in the audit log.
  Set a `sessionLabel` once per session (or `set_session_label`) naming the task.
- **Secrets**: never put them in `command` (it is logged) — pass them in `env` (values are not logged). Never print
  secret files into the chat or write secrets into descriptions or services; record only paths and variable names.
- Remote access, especially as root, can cut you off: when changing SSH or firewall settings, first allow the new
  access, verify it with a fresh `exec`, and only then remove the old one.

## Tools

| Need | Tool | Notes |
|---|---|---|
| Which servers exist, their status | `list_connections` | Returns full descriptions of all connections — heavy; for one server use `get_connection`. |
| One server's docs and health | `get_connection` | Description, services, each service's check and current health. |
| Run a command | `exec` | See "Running commands". |
| Rest of a cut output | `exec_output` | `outputId`, `stream`, `offset` (from `stdoutNextOffset` / `nextOffset`), optional `limit`. |
| Long-running work | `start_job`, `job_status`, `job_logs`, `cancel_job` | See "Long-running work". |
| Read / list / write files on the server | `read_file`, `list_dir`, `write_file` | SFTP. `read_file` is for small files. |
| Move files between your machine and the server | `upload`, `download` | Return a one-time URL and a `curl` command to run yourself; see "Files". |
| Server description | `set_connection_description` | Max 4000 characters; replaces the whole text. |
| Services | `add_service`, `update_service`, `remove_service` | Name ≤ 100, description ≤ 1000 characters, optional `check`. |
| Health history / run a check now | `service_health`, `run_service_check` | |

## Running commands

- `exec` runs one command line through a POSIX shell on the server; each call is independent. Use `cwd` and `env`
  instead of `cd` / `export`. Write portable `sh` (no bashisms), even if the server's shell happens to be bash.
- stdin is closed and there is no TTY: nothing interactive. No `-it`, no editors, no pagers (`--no-pager`, `| cat`),
  no prompts (`-y`, `DEBIAN_FRONTEND=noninteractive`), never attach to `screen` / `tmux` sessions.
- Set `timeoutSec` on anything that could hang (network calls, locks, big queries); on timeout the command's process
  group is killed and the partial output comes back with `timedOut: true`.
- `sudo: true` runs the command as root with the password stored in the gateway (output merged into stdout); it fails
  if no sudo password is stored. Not needed when the connection already logs in as root.
- Check `exitCode` (and `signal`), not only the output; stderr comes back separately unless merged.
- Non-UTF-8 output comes back base64 (`stdoutEncoding: "base64"`).
- **Keep outputs small.** Filter on the server (`grep`, `tail -n`, `head`, `wc -l`, `--since`, `--format`, `jq`).
  Output above the gateway's limit (8 MB by default, both streams together) is cut with `truncated: true` and an
  `outputId`; page the rest with `exec_output` only when you really need it. Very large tool results are hard to
  read and may be cut further by the client — tens of KB per call is a good size.
- Several independent `exec` calls may run in parallel.
- If a call reports a dropped connection or no exit status, the command may or may not have run: before repeating a
  command that changes state, check whether it took effect.

## Long-running work

Anything that may take more than about a minute (backups, image pulls, builds, migrations, large copies) → `start_job`
instead of `exec`. Then poll `job_status` (state, exit code, output size) and read output with `job_logs` using `tail`
(last N lines). An `offset` returns everything from that point to the end, so use it only near the end of a big log.
`cancel_job` stops the job's whole process group. If a start couldn't be confirmed, look the job up with `job_status`
before starting it again.

## Files

- Inspect with `list_dir` and `read_file` (text or binary). `read_file` returns the whole file in one result — for
  anything larger than a few MB use `download`. Reading a directory with `read_file` fails with a generic SFTP error.
- `write_file` for small text files; `upload` / `download` for real files (binary, large) between the machine you run
  on and the server. They take only `remotePath` (`upload` also an optional `sha256` of your file, which the received
  bytes must match) and return `{url, method, headers, expiresAt, maxBytes, curl}`, without moving anything yet:
  - Run the returned `curl` yourself, on your own machine, with your own absolute path in place of `<LOCAL_FILE>`
    (`curl --fail -T <LOCAL_FILE> …` uploads it, `curl --fail -o <LOCAL_FILE> …` downloads to it; create the local
    target directory first). Keep `--fail`, so an error is an error, and check curl's exit code.
  - The `X-Athenode-Transfer` header is a secret: never share it, log it or write it into files or messages.
  - The URL works once and expires (`expiresAt`, 10 minutes by default): if it was used or expired, call the tool
    again. Files above `maxBytes` (1 GiB by default) are refused.
  - An upload replaces an existing file (keeping its mode) only once the whole file arrived; the remote parent
    directory must exist. The PUT answers `{bytes, sha256}`: compare the hash with your file's.
- If the server's files are managed elsewhere (configuration management, a git repo, a deploy pipeline), change them
  there, not on the server; a direct edit is an emergency measure to be mirrored back right away.

## Documenting a server

Each connection carries its own documentation; keep it current whenever the server's architecture changes.

- **Description** (`set_connection_description`, ≤ 4000 characters, whole-text replace — start from
  `get_connection` and edit that): what the host is (provider, OS, IPs, role, production or not), then host-wide
  facts — networks and access, firewall, SSH, deploy mechanism, compose projects, storage, pitfalls.
- **Services** (`add_service` / `update_service` / `remove_service`): a service is something that runs — a container
  or one product's group of containers, a daemon, a timer or cron job, a firewall or rules loader. Its description
  (≤ 1000 characters) says what it is, image or binary, ports and domains, config and data paths, its own healthcheck,
  how to deploy or reload it and its gotchas. Projects, rules and procedures are not services: put them in the
  description or in the service they belong to. Split a service that doesn't fit rather than truncate it.
- Describe the current state only: no history, dates, resource snapshots or secrets.

## Health checks

A service can have a `check`: a command the gateway runs on the server every `intervalSec` (30–86400, default 300),
killed after `timeoutSec` (default 30, not above the interval); exit 0 = healthy; after `failureThreshold`
consecutive failures (default 2) the service counts as down. Give a `reason` when creating or changing a check;
disable it with `enabled: false`, remove it with `check: null`.

- Health checks are optional: add them only when the user wants them.
- The command must be read-only, quick and portable `sh`, and print one short line per checked thing so a failed
  run explains itself. Typical patterns:
  - container: `docker inspect -f "{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}" <name>`
    is `running/healthy` or `running/none`;
  - endpoint: `curl -s -o /dev/null -m 10 -w "%{http_code}" <url>` returns the expected code;
  - daemon: `systemctl is-active <unit>` plus a sign it works (listening port via `ss -ltnH`, loaded rules, fresh
    state file);
  - timer: timer active, the service's last `Result` is `success`, last trigger younger than its period plus margin;
  - cron job or exporter: freshness of what it writes (mtime, timestamp in a metrics file).
- Dry-run the command with `exec` first — including once against a wrong name, to see it fails — then save it and run
  it once with `run_service_check`.
- `get_connection` shows each service's current health; `service_health` shows the run history with outputs. Start
  troubleshooting a server from its unhealthy services.
- When a service is renamed, moved or removed, update or remove its check too.

## Report

Tell the user what was run where (connection, commands that changed something), the results that matter, and which
descriptions, services or checks were changed.
