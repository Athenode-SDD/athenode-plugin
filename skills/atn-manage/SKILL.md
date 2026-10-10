---
name: atn-manage
description: Use when agent setups, or the files, skills, agents, MCP servers or rules of the installed or another setup, need to be listed, created, changed or deleted, or when a setup is to be taken from, updated from or published to the setup library.
claudecode:
  argument-hint: "[request]"
  allowed-tools: AskUserQuestion, Read, Glob, Grep
codexcli:
  argument-hint: "[request]"
  allowed-tools: Read, Glob, Grep
cursor:
  metadata:
    argument-hint: "[request]"
    allowed-tools: Read, Glob, Grep
copilot:
  argument-hint: "[request]"
  allowed-tools:
    - read
    - search
copilotcli:
  argument-hint: "[request]"
  allowed-tools:
    - read
    - search
opencode:
  allowed-tools:
    - read
    - glob
    - grep
devin:
  argument-hint: "[request]"
  allowed-tools:
    - read
    - glob
    - grep
qwencode:
  argument-hint: "[request]"
---

Manage the project's agent setups and everything inside one of them — its files, skills, agents, MCP servers and rules; the installed setup unless the request names another — by listing, creating, changing and deleting them on the Athenode server. It also works with the setup library: browsing its entries, adding one as a new setup, merging one into a setup, updating a setup added from the library, and publishing, re-publishing, editing and unpublishing the project's own entries, including whether an entry is shown on the public website.

## Arguments

- A request (optional, free text): what to list, create, change or delete. Without it, ask what to manage as an open question.

## Scope

- A project holds several agent setups; exactly one is installed in this local project. The setup tools (`setups_list`, `setups_create`, `setups_clone`, `setups_update`, `setups_delete`, `setups_pull_preview`, `setups_pull`) act on any setup of the project.
- Every other tool acts on one setup's content: its file tree (`setups_files_*`), skills (`skills_*`), agents (`agents_*`), MCP servers (`mcp_servers_*`) and rules (`rules_get`, `rules_update`). Without `setupId` that is the installed setup; with `setupId` it is any other setup of the project.
- Work on the installed setup unless the request names another one. Resolve a named setup to its id with `setups_list` and pass that id as `setupId` in every call of the operation, the reads included; if the name matches no setup or several, show the setups and ask.
- A change to a setup that is not installed is stored on the server only: no local file is regenerated and the result has no `install` and `regeneration` parts. It reaches a project when that setup is installed there, or on the next `npx @athenode/cli init` where it already is.
- The setup library tools (`library_*`) name their setup with `setup` — its exact name, or its id together with `setupById` — and never with `setupId`. `setup` is always required and the installed setup is never assumed: take the name from `setups_list`, and ask when the request does not say which setup is meant. A library entry is its exact name, or its id together with `byId`.
- The pull tools (`setups_pull_preview`, `setups_pull`) name the setup that receives the content with `setup` in the same way, and the setup the content is taken from with `source` — its exact name, or its id together with `sourceById`. Both are always required and both are setups of this project.
- Installing a different setup is done by the user in a terminal, never by you: `npx @athenode/cli init --setup <id or slug>` in the project root, followed by a restart of the session.
- Everything is stored on the Athenode server. Never create or edit the generated files in the local repository (skill, agent, rules and MCP config files): the write tools regenerate them, and a manual edit is overwritten by the next regeneration. Read local files only to take content the user wants to store in the setup.

## Flow

1. **Understand the request.** Split it into operations from "## Operations". If it is ambiguous about the object or the action, ask before writing anything.
2. **Read the current state** each operation depends on, with the list or get tool of its group, and resolve every name the user gave against it. If nothing matches, show the existing names and ask which one was meant; never guess between similar names.
3. **Confirm destructive and public operations.** These tools act immediately and without confirmation, so ask the user first, one question per case:
   - **Deletions** — one question listing exactly what will be removed — for: `setups_delete`, `setups_files_delete`, `skills_remove`, `agents_remove`, `mcp_servers_remove`, `rules_update` with an empty text, and `library_unpublish` (the entry and all its versions leave the library; setups already added from it keep working and stop receiving updates). Add the matching warning from "## Safeguards". A request that already names the exact object and the delete action still gets this question once; several deletions of one request are confirmed together.
   - **Publishing** (`library_publish`, a new entry and a new version alike): first call it without `confirmPublic`, which publishes nothing and returns what would be published. Show the user the entry's name, description, tags, the version note and the counts of what it holds, and say what the one consent covers. Every signed-in Athenode user will see the whole setup — agents, skills with their files, rules, MCP servers and files, the `settings/` files included. The entry is also shown on the public Athenode website: its name, description and tags and the full content of its agents, skills with their bundle files, rules and setup files become visible to anyone on the open web without an account and may be indexed by search engines; MCP server configuration is not shown there, and after public display is turned off with `library_edit` the entry can stay on the public site for up to a day and longer in search engines' caches. When the preview says `publicDisplayBanned: true`, say instead that public display is unavailable for the entry and it is published to the in-app library only. Pass `confirmPublic: true` only after a yes to that one question; it is the whole consent, and `library_publish` takes no `publicDisplay`.
   - **Public display** (`publicDisplay: true` on `library_edit`, for an entry whose public display was turned off): ask a question about the open web, and only when the user asked for public display. Say that the entry's name, description and tags and the full content of its agents, skills with their bundle files, rules and setup files become visible to anyone on the open web without an account and may be indexed by search engines, that MCP server configuration is not shown, and that after it is turned off the entry can stay on the public site for up to a day and longer in search engines' caches. Pass `publicDisplay: true` with `confirmPublic: true` only after a yes to that question. `publicDisplay: false` needs no question.
   - **Replacements**: a `library_merge`, `library_update` or `setups_pull` whose `decisions` replace any item or the rules. List exactly which skills, agents, MCP servers, files and rules will be replaced, and say that there is no undo and no backup. A merge, update or pull without `decisions` adds what is new, replaces nothing and needs no question.
4. **Apply the operations** one call at a time, in the order the user gave. If a call fails, stop the remaining operations that depend on it, keep going with the independent ones and report the error text.
5. **Check the result.** After a write to the installed setup, which regenerates it, read the `regeneration` and `install` parts of the result: report `missingEnvVars`, and when the tool returned an error although the change was saved, say that the server holds the change and the local files are stale until `npx @athenode/cli init` is re-run.
6. Give the report (see "## Report").

## Operations

Every tool outside "### Setups" and "### Setup library" also takes the optional `setupId` (see "## Scope"); the tables leave it out.

### Setups

| Request | Tool | Notes |
|---|---|---|
| List the setups | `setups_list` | Show name, id and description, and mark the installed one and the project's own copy of the standard setup. For a setup added from the library, `libraryOrigin` names its entry and version and says whether an update is available. |
| Create an empty setup | `setups_create` (`name`, optional `description`) | It has no skills, agents, rules, files or MCP servers, and is not installed. |
| Create a setup from an existing one | `setups_clone` (`source`, `name`) | Copies the source with its content; the installed setup is not changed. Prefer this when the user wants a variant of a setup they already have. |
| Rename a setup or change its description | `setups_update` (`target`, `name` and/or `description`) | |
| Delete a setup | `setups_delete` (`target`) | See "## Safeguards". |
| Pull another setup of this project into a setup | `setups_pull_preview`, then `setups_pull` (`source`, `setup`) | Copies skills, agents, MCP servers, files and rules of `source` into `setup`, all of them or the ones the user picks. Always preview first and show the new, conflicting and identical items and the state of the rules. Pass the user's choices as `decisions`, built from the preview; without `decisions` everything new is added, nothing is replaced and the rules are kept. |

`source` and `target` are setup names; pass `byId: true` with an id when two setups share a name. After creating or cloning a setup, tell the user how to install it (see "## Scope") if they want to work in it.

For a pull, `source` and `setup` are named as "## Scope" says (`sourceById`, `setupById`), and:

- `decisions` has the preview's shape: `sourceFingerprint` and `fingerprint` from the preview, per kind (`skills`, `agents`, `mcpServers`, `files`) the lists `add` and `replace`, and `rules` as `keep`, `append` or `replace`. Appended rules go under a heading with the source setup's name. A replacement needs `confirmReplace: true` and the confirmation of step 3 of "## Flow".
- A pull with `decisions` is refused when either setup changed since the preview. Repeat the preview, show the user what is different and apply with the new values; never retry with the old ones.
- A pull into the installed setup regenerates the local files (see step 5 of "## Flow"); into any other setup it changes the server only.
- A pull is a one-time copy: the pulled items are independent of the source, nothing about the source is recorded and there is no update later. To take later changes of the source, pull again.
- Only a setup of this project can be the source. Pulling from a setup of another project exists only in the web app; for a library entry use the tools of "### Setup library".

### Files of a setup

| Request | Tool | Notes |
|---|---|---|
| Browse the file tree | `setups_files_list` (optional `path`) | Lists one directory level; walk the directories the request needs. |
| Read a file | `setups_files_get` (`path`) | |
| Create a file or directory | `setups_files_create` (`path`, `content`, optional `summary`; `dir: true` for a directory) | Missing parent directories are created. Give every file a one-line `summary` saying when an agent should read it. |
| Change a file | `setups_files_update` (`path`, `content` and/or `summary`) | Replaces the whole content: read the file first, change it and send the full text. Directories cannot be updated. |
| Move or rename a file | `setups_files_get`, `setups_files_create` at the new path, then `setups_files_delete` of the old path | Delete the old path only after the create succeeded. |
| Delete a file or directory | `setups_files_delete` (`path`; `recursive: true` for a non-empty directory) | List a non-empty directory first and show what goes with it. |

Content is passed inline and limited to 50000 characters per file; split a longer document into several files. Files are plain Markdown that agents and skills load at runtime, so write them as instructions for an agent, in English.

### Skills and agents of a setup

| Request | Tool | Notes |
|---|---|---|
| List | `skills_list` / `agents_list` | Only what is attached to the setup, not the whole catalog. |
| Create | `skills_create` / `agents_create` (`name`, `description`, `prompt`, optional `metadata`) | `description` is required. |
| Change | `skills_update` / `agents_update` (`identifier`, any of `description`, `prompt`, `metadata`, `rename`) | Omitted fields and unlisted metadata are kept. `prompt` replaces the whole body: start from the current body in the list result. |
| Remove | `skills_remove` / `agents_remove` (`identifier`) | Detaches it from the setup; for the installed setup, also removes its generated files. |

- `name` is lowercase words joined with `-`. `description` is one sentence starting with "Use when", since the coding assistant decides from it when to load the skill or delegate to the agent.
- Write a skill's `prompt` as: a first line stating its purpose, then `## Arguments` (if it takes any), `## Flow` with numbered steps, and `## Report`. Write an agent's `prompt` as a role statement, the steps it follows and the format of what it returns.
- `metadata` keys are either common fields or `<target>.<field>` for one coding assistant (`claudecode.allowed-tools`, `claudecode.argument-hint`, `claudecode.model` and the like). Set only what the user asked for or the skill needs; tool names differ per target, so never copy one target's tool list to another.
- A skill or agent created or renamed in the installed setup becomes available to the coding assistant only after the session is restarted. Say so.

### MCP servers of a setup

| Request | Tool | Notes |
|---|---|---|
| List | `mcp_servers_list` | |
| Create | `mcp_servers_create` (`name`, `transport`, then `command`, `args`, `env` for `stdio`, or `url`, `headers` for `http` / `sse`) | Ask for the transport and its fields if the request doesn't give them. |
| Change | `mcp_servers_update` (`identifier`, the fields to change) | A given `args`, `env` or `headers` replaces the whole value: read the server first and resend every entry that must stay. Switching the transport drops the old transport's fields. |
| Remove | `mcp_servers_remove` (`identifier`) | For the installed setup, also removes its entries from the local MCP config files. |

- Secrets never go into a server definition: the setup is shared with everyone who installs it. Write tokens and keys as `${VAR}` references in `env`, `headers`, `args` or `url`, and tell the user which variables to export. If the user pastes a literal secret, replace it with a `${VAR}` reference and say so. Publishing is stricter: `library_publish` is refused while any MCP server of the setup holds a literal `env` or `headers` value, whatever its name; replace each one with a `${VAR}` reference and publish again.
- A server created or changed in the installed setup connects only after the session is restarted.

### Rules of a setup

| Request | Tool | Notes |
|---|---|---|
| Read the rules | `rules_get` | |
| Change the rules | `rules_get`, then `rules_update` (`content`) | Replaces the whole text: change the current text and send it in full. The content is literal. |

### Setup library

The setup library has two levels of visibility: every signed-in Athenode user sees every entry with its whole content, and the open web sees an entry while its public display is on, which every publish turns on and `library_edit` turns off, and then its name, description and tags and the full content of its agents, skills with their bundle files, rules and setup files; MCP server configuration is not shown. Each table row leaves out `entry` (with `byId`) and `setup` (with `setupById`), described in "## Scope"; the other parameters are in the tool descriptions.

| Request | Tool | Notes |
|---|---|---|
| Browse or search the library | `library_list` | Takes a search text, a tag and a sort order; pass `nextCursor` back as `cursor` for the next page. Show name, version, publisher and counts. |
| Show one entry | `library_get` | Its metadata, version log and the lists of its items, without their texts. |
| Read one item of an entry | `library_item` | An agent, skill, skill file, MCP server, file or the rules text. Use it to show the user what an entry holds before they add it or choose a replacement. |
| Add an entry as a new setup | `library_add` | Creates a new setup on the server only: the installed setup and the local files do not change. If the project already has a setup of that name, offer the suggested free name. |
| Merge an entry into a setup | `library_merge_preview`, then `library_merge` | Always preview first and show the new, conflicting and identical items and the state of the rules. Pass the user's choices as `decisions`, built from the preview; without `decisions` everything new is added, nothing is replaced and the rules are kept. |
| Update a setup added from the library | `library_update_preview`, then `library_update` | Only for a setup that was added as a whole from the library and has a newer version available (see `setups_list`). The same preview and choices as a merge. |
| Publish a setup, or a new version of it | `library_publish` | One tool for both: a setup that already has an entry gets the next version, with an optional note. Every publish also turns the entry's public display on, unless an administrator made it unavailable for the entry; `confirmPublic: true` is the one consent to both, and the tool takes no `publicDisplay`. Needs a paid plan and the confirmation of step 3 of "## Flow". |
| Change an entry's name, description, tags or public display | `library_edit` | Creates no new version. `publicDisplay: true` needs `confirmPublic: true` and the confirmation of step 3 of "## Flow"; `publicDisplay: false` needs neither. |
| Unpublish an entry | `library_unpublish` | Confirm first (step 3 of "## Flow"). |

- A merge or update with `decisions` is refused when the setup or the entry changed since the preview. Repeat the preview, show the user what is different and apply with the new values; never retry with the old ones.
- A merge or update into the installed setup regenerates the local files (see step 5 of "## Flow"); into any other setup it changes the server only.
- A setup added with `library_add` carries the publisher's `settings/` files. After the user installs it, suggest the `atn-settings` skill to make them fit this project.
- Likes and skipping a version exist only in the web app.

## Safeguards

Name the consequence in the confirmation question whenever one of these applies:

- **The installed setup** (`setups_delete`): this project loses its skills, agents, rules and MCP servers on the next regeneration. Suggest installing another setup first.
- **The `athenode` MCP server** (`mcp_servers_remove`, or an update of its command or arguments): every tool this and every other Athenode skill uses comes from it; without it nothing works in a project that has the setup installed until `npx @athenode/cli init` is re-run on a setup that has it.
- **The `settings/` files** (`setups_files_delete`, or an update of a `## Parameters` or `## Rules` section): the specification skills load them. Change parameters and rules by invoking the `atn-settings` skill instead; here, edit only their `## Custom` sections, keeping the other sections byte-for-byte.
- **The built-in skills and agents** (`atn-apply`, `atn-decompose`, `atn-mindmap`, `atn-settings`, `atn-manage` and the `spec-*` agents): they invoke each other by name, so removing or renaming one breaks the others. A changed built-in skill or agent no longer receives Athenode's updates.
- **The `MCP`, `Settings`, `Questions` and `Language` sections of the rules**: every Athenode agent and skill relies on them; keep them when changing the rules unless the user explicitly asks to drop them. The same holds for a merge or update that replaces the rules.
- **Publishing** (`library_publish`): the whole setup becomes visible to every signed-in Athenode user and stays so until the entry is unpublished. Publish only the setup the user named, never one you chose, and never to get around a limit or a refusal. The check for literal `env` and `headers` values is the only one made for the user: command arguments, URLs, rules, files and the texts of skills and agents are theirs to review.
- **Public display** (`library_publish`, `library_edit`): it puts the entry's details and the full content of its agents, skills with their bundle files, rules and setup files on the open web. Publishing always turns it on, so never publish without the user's yes to the publishing question of step 3, which names the open web. With `library_edit` turn it on only when the user asked for it for that entry, never on your own judgment. If the server refuses because public display is unavailable for the entry, report that and do not retry; turning it off still works.
- **A replaced built-in skill, agent or `settings/` file** (`library_merge`, `library_update`, `setups_pull`): the consequences of the bullets above apply to it as to a manual change.

Without a user to ask, perform no destructive operation, no publishing and no merge or update that replaces anything, and report each as skipped. A `setups_pull` that replaces anything is such a merge. The same holds for turning public display on: without a user to ask, never pass `publicDisplay: true` to `library_edit`.

## Report

- Every operation performed, with the object's name (and id for setups) and what changed; listings as a compact table. Name the setup whenever it is not the installed one.
- Every operation skipped, declined or failed, with the reason or the error text.
- What the user has to do next: restart the session for new or renamed skills, agents and MCP servers of the installed setup; export the environment variables a server references; run `npx @athenode/cli init --setup <id or slug>` to install a new setup — one created here or added from the library — or one changed here that is not installed.
- After a publish, the entry's name and version; after a merge or update, what was added and what was replaced.
