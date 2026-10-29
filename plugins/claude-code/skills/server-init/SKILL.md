---
name: server-init
description: >-
  Use when a server connected to the SSH Gateway has to be documented from
  scratch (or re-documented) by inspecting it read-only, writing the connection
  description, documenting every service with its description and, if the user
  wants them, health checks.
allowed-tools: AskUserQuestion
argument-hint: '[connection name]'
metadata:
  internal: true
---
# Server init

Document a server in the SSH Gateway (the gateway tools of the Athenode MCP server; `atn:ssh-gateway` holds the rules
for working with them): inspect it
read-only, write the connection description, add every service with a description and, only if the user wants them,
a health check. Nothing on the server is changed.

## Arguments

- A gateway connection name (optional). Without it, list the connections and ask which one to initialize.

## Rules

- Server access only through the gateway tools (`exec`, `read_file`, `list_dir`, …) — never `ssh` / `scp` from Bash.
  If the connection's status isn't `ok` or the gateway is unavailable, stop and tell the user.
- **Read-only.** Run only commands that inspect: no restarts, no package installs, no file writes, no `docker pull`,
  no `prune`. Give every `exec` a precise `reason`, a `timeoutSec`, and the `sessionLabel` "server init <name>".
- Keep outputs small: filter on the host (`grep`, `head`, `--format`); outputs over ~100 KB are hard to work with.
- **Secrets never leave the host**: don't print `.env` / env files, keys, tokens or passwords; record only their paths
  and variable names (`grep -o '^[A-Z_]*=' file`).
- Persisted text is in English; talk to the user in their language.
- The gateway cannot create connections: if the server has none, the user creates it in the gateway first.

## Flow

1. **Pick the connection.** `list_connections`; resolve the argument against it (ask if it matches none or several).
   `get_connection <name>`: if it already has a description or services, ask whether to rebuild everything (old
   services are replaced/removed) or only fill the gaps (keep what is there, add what is missing).
2. **Ask about health checks** — one question, before any inspection:
   **Should the services get health checks (a command the gateway runs on the host on an interval; exit 0 = healthy)?**
   - A) Yes, for every service (Recommended)
   - B) Only for the services I pick (I'll choose after seeing the list)
   - C) No, descriptions only
   Health checks are optional; with C skip every check step below.
3. **Inspect the server** (read-only `exec`, several commands per call, grouped by topic):
   - Host: `hostnamectl`, `cat /etc/os-release`, `uname -m`, `nproc`, `free -h`, `lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT`,
     `df -h -x tmpfs -x overlay`, swap.
   - Network: `ip -br addr`, `ip route`, `ss -ltnup` (listening ports and owners), `wg show` (no keys), `/etc/hosts`.
   - Firewall: `nft list ruleset | head -200` or `ufw status verbose` / `iptables -S | head`.
   - Access: `/etc/ssh/sshd_config.d/*`, `sshd -T | grep -E '^(port|permitrootlogin|passwordauthentication)'`, the
     comments/options of `authorized_keys` entries (not the keys), users with a login shell, sudoers drop-ins.
   - Containers: `docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'`, `docker compose ls`, for each
     project its compose file path, networks (`docker network ls`), volumes, healthchecks
     (`docker inspect -f '{{.Name}} {{json .Config.Healthcheck}}'`), `mem_limit`s.
   - systemd: running non-stock services (`systemctl list-units --type=service --state=running`), enabled units under
     `/etc/systemd/system`, timers (`systemctl list-timers --all`), `/etc/cron.d/*`, root's crontab.
   - Web: Caddy / nginx / Traefik config (domains → upstreams), TLS.
   - Backups, monitoring agents, log shipping, maintenance scripts in `/usr/local/sbin`.
   - Anything the user named as important.
   Follow leads (a compose project's `.env` names, a script called by a timer) until each running thing is understood.
4. **Split what you found.**
   - A **service** is something that runs and can be health-checked: a container or a group of one product's containers,
     a daemon, a timer / cron job, a firewall or rules loader.
   - Everything else — host facts, networks and access, firewall policy, compose projects, deploy mechanism, storage,
     rules, procedures, pitfalls — goes into the **description**, or into the service it belongs to.
   - Show the user the planned service list (name — one line of what it is) and the description outline. With answer
     B of step 2, ask which services get checks. Proceed after the user agrees or corrects.
5. **Write the description** — `set_connection_description` (max 4000 characters, replaces the whole text):
   - First paragraph: what the host is (provider, OS, arch, public / VPN IPs), its role, prod or not, related repos.
   - Then `##` sections as needed: Networks and access, Firewall, SSH, Compose projects, Deploy, Storage, Pitfalls.
   - Current state only: no history, dates, resource usage snapshots, secrets.
6. **Add the services** — `add_service` (in rebuild mode `update_service` / `remove_service` for the old ones):
   - Name ≤ 100 characters, short and stable (`caddy`, `gitlab`, `pg-backup`, `monitoring agents`).
   - Description ≤ 1000 characters: what it is, image / binary, domains and ports, networks, config and data paths,
     its own healthcheck, deploy / reload command, gotchas. Split a service that doesn't fit rather than truncate.
7. **Health checks** (only with A or B of step 2). For each service:
   - Write a read-only POSIX sh command; exit 0 = healthy; print one short line per checked thing so the run output
     explains a failure. Patterns:
     - container(s): `docker inspect -f "{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}"`
       → `running/healthy` or `running/none`; loop over a product's containers, fail if any isn't;
     - endpoint: `curl -s -o /dev/null -m 10 -w "%{http_code}"` against the local listener (`--resolve <domain>:443:127.0.0.1`)
       and an expected code (not 5xx / 000);
     - daemon: `systemctl is-active` plus proof it works (port listening via `ss -ltnH`, nft table present, fresh state file);
     - timer: timer active, `systemctl show -p Result --value <unit>.service` = `success`, and
       `LastTriggerUSec` of the timer younger than its period plus margin;
     - cron job: freshness of what it writes (file mtime, a metric's timestamp).
   - **Dry-run every command with `exec` first**, also once against a missing name, to see it fails as expected.
   - Then `add_service` / `update_service` with `check` = `{command, intervalSec, timeoutSec}` and a `reason`:
     production containers 60–120 s, daemons 300 s, timers 3600 s; `timeoutSec` 20–60; `failureThreshold` default 2.
   - `run_service_check` each new check.
8. **Verify** with `get_connection`: the description is there, every planned service exists, every check's health is
   `healthy` (or the user knows why not).
9. **Related docs.** If the host belongs to infrastructure that has its own docs (an infrastructure repository, a hosts
   table, the project's plugin files), tell the user what should be added there and do it if they agree.

## Report

- The connection, and whether it was a fresh init, a rebuild or a gap fill.
- The description sections written, and its length.
- A table: service | what it is | check (yes/no, interval) | last health.
- Checks that are not healthy, with their output.
- What was skipped (by the user's choice or because the host didn't allow it) and anything that needs the user
  (connection to create, docs elsewhere to update).
