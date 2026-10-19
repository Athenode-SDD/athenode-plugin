---
name: manage
description: >-
  Use when plugins, or the files, skills, agents, MCP servers or rules of the
  installed or another plugin, need to be listed, created, changed or deleted,
  when an external plugin is to be imported into a plugin or updated, or when a
  plugin is to be taken from, updated from or published to the plugin library.
allowed-tools: 'AskUserQuestion, Read, Glob, Grep'
argument-hint: '[request]'
metadata:
  internal: true
---
Manage the project's plugins and everything inside one of them — its files, skills, agents, MCP servers and rules; the installed plugin unless the request names another — by listing, creating, changing and deleting them on the Athenode server. It also imports external plugins (third-party plugin packages from a GitHub or GitLab repository or a local folder) into a plugin and updates them, and works with the plugin library: browsing its entries, adding one as a new plugin, merging one into a plugin, updating a plugin added from the library, and publishing, re-publishing, editing and unpublishing the project's own entries, including whether an entry is shown on the public website.

## Arguments

- A request (optional, free text): what to list, create, change or delete. Without it, ask what to manage as an open question.

## Scope

- A project holds several plugins; exactly one is installed in this local project. The plugin tools (`plugins_list`, `plugins_create`, `plugins_clone`, `plugins_update`, `plugins_delete`, `plugins_pull_preview`, `plugins_pull`) act on any plugin of the project.
- Every other tool acts on one plugin's content: its file tree (`plugins_files_*`), skills (`skills_*`), agents (`agents_*`), MCP servers (`mcp_servers_*`) and rules (`rules_get`, `rules_update`). Without `pluginId` that is the installed plugin; with `pluginId` it is any other plugin of the project.
- Work on the installed plugin unless the request names another one. Resolve a named plugin to its id with `plugins_list` and pass that id as `pluginId` in every call of the operation, the reads included; if the name matches no plugin or several, show the plugins and ask.
- A change to a plugin that is not installed is stored on the server only and the result has no `sync` part. It reaches a project when that plugin is installed there, or on the next `athenode sync` where it already is.
- The plugin library tools (`library_*`) name their plugin with `plugin` — its exact name, or its id together with `pluginById` — and never with `pluginId`. `plugin` is always required and the installed plugin is never assumed: take the name from `plugins_list`, and ask when the request does not say which plugin is meant. A library entry is its exact name, or its id together with `byId`.
- The pull tools (`plugins_pull_preview`, `plugins_pull`) name the plugin that receives the content with `plugin` in the same way, and the plugin the content is taken from with `source` — its exact name, or its id together with `sourceById`. Both are always required and both are plugins of this project.
- The external plugin tools (`plugins_external_*`) name their plugin with `plugin` and `pluginById` in the same way. `plugin` is required to update an external plugin; an import without it creates a new plugin, and `plugins_external_sources` without it lists the installed plugin's sources.
- Installing a different plugin is done by the user in a terminal, never by you: `athenode init --plugin <id or slug>` in the project root. `init` then prints, under "Still to do in your tools", what each of the user's AI tools needs before it uses the plugin; that step differs by tool, so point the user at those lines and name no step of your own.
- Everything is stored on the Athenode server the project is bound to: the local Athenode service, or a Pro server. Never create or edit the generated files in the local repository (skill, agent, rules and MCP config files): `athenode sync` writes them from the server, and a manual edit is overwritten by the next sync. Read local files only to take content the user wants to store in the plugin.

## Flow

1. **Understand the request.** Split it into operations from "## Operations". If it is ambiguous about the object or the action, ask before writing anything.
2. **Read the current state** each operation depends on, with the list or get tool of its group, and resolve every name the user gave against it. If nothing matches, show the existing names and ask which one was meant; never guess between similar names.
3. **Confirm destructive and public operations.** These tools act immediately and without confirmation, so ask the user first, one question per case:
   - **Deletions** — one question listing exactly what will be removed — for: `plugins_delete`, `plugins_files_delete`, `skills_remove`, `agents_remove`, `mcp_servers_remove`, `rules_update` with an empty text, and `library_unpublish` (the entry and all its versions leave the library; plugins already added from it keep working and stop receiving updates). Add the matching warning from "## Safeguards". A request that already names the exact object and the delete action still gets this question once; several deletions of one request are confirmed together.
   - **Publishing** (`library_publish`, a new entry and a new version alike): first call it without `confirmPublic`, which publishes nothing and returns what would be published. Show the user the entry's name, description, category, the version note and the counts of what it holds, and say what the one consent covers. Every signed-in Athenode user will see the whole plugin — agents, skills with their files, rules, MCP servers and files, the `settings/` files included. The entry is also shown on the public Athenode website: its name, description and category and the full content of its agents, skills with their bundle files, rules and plugin files become visible to anyone on the open web without an account and may be indexed by search engines; MCP server configuration is public too and installable with `npx @athenode/cli use <slug>`, and after public display is turned off with `library_edit` the entry can stay on the public site for up to a day and longer in search engines' caches. When the preview says `publicDisplayBanned: true`, say instead that public display is unavailable for the entry and it is published to the in-app library only. Pass `confirmPublic: true` only after a yes to that one question; it is the whole consent, and `library_publish` takes no `publicDisplay`.
   - **Public display** (`publicDisplay: true` on `library_edit`, for an entry whose public display was turned off): ask a question about the open web, and only when the user asked for public display. Say that the entry's name, description and category and the full content of its agents, skills with their bundle files, rules and plugin files become visible to anyone on the open web without an account and may be indexed by search engines, that MCP server configuration is public too and installable with `npx @athenode/cli use <slug>`, and that after it is turned off the entry can stay on the public site for up to a day and longer in search engines' caches. Pass `publicDisplay: true` with `confirmPublic: true` only after a yes to that question. `publicDisplay: false` needs no question.
   - **Replacements**: a `library_merge`, `library_update`, `plugins_pull`, `plugins_external_import` or `plugins_external_update` whose `decisions` replace or remove any item or replace the rules. List exactly which skills, agents, MCP servers, files and rules will be replaced or removed, and say that there is no undo and no backup. A merge, update, pull or import without `decisions` adds what is new, replaces nothing and needs no question.
4. **Apply the operations** one call at a time, in the order the user gave. If a call fails, stop the remaining operations that depend on it, keep going with the independent ones and report the error text.
5. **Check the result.** The tools change the server only; the repository's files are not regenerated. When the result of a write has a `sync` part with `stale: true`, the change concerns the installed plugin: tell the user to run `athenode sync` in the project root, which writes the changed files and prints, under "Still to do in your tools", what each AI tool needs before it uses them (that step differs by tool, so point the user at those lines and name no step of your own). For a tool that `athenode sync` names no such step for, say that the tool reads the change at its next start at the latest: a running session is restarted.
6. Give the report (see "## Report").

## Operations

Every tool outside "### Plugins", "### External plugins" and "### Plugin library" also takes the optional `pluginId` (see "## Scope"); the tables leave it out.

### Plugins

| Request | Tool | Notes |
|---|---|---|
| List the plugins | `plugins_list` | Show name, slug, id and description, and mark the installed one and the project's own copy of the standard plugin. For a plugin added from the library, `libraryOrigin` names its entry and version and says whether an update is available. |
| Create an empty plugin | `plugins_create` (`name`, optional `description` and `slug`) | It has no skills, agents, rules, files or MCP servers, and is not installed. Without `slug` the server derives one from the name. |
| Create a plugin from an existing one | `plugins_clone` (`source`, `name`, optional `slug`) | Copies the source with its content; the installed plugin is not changed. Prefer this when the user wants a variant of a plugin they already have. |
| Rename a plugin or change its description or slug | `plugins_update` (`target`, `name`, `description` and/or `slug`) | The slug is the name of the plugin package and the prefix of its commands: a changed slug renames both, and the local install follows at the next `athenode sync`. |
| Delete a plugin | `plugins_delete` (`target`) | See "## Safeguards". |
| Pull another plugin of this project into a plugin | `plugins_pull_preview`, then `plugins_pull` (`source`, `plugin`) | Copies skills, agents, MCP servers, files and rules of `source` into `plugin`, all of them or the ones the user picks. Always preview first and show the new, conflicting and identical items and the state of the rules. Pass the user's choices as `decisions`, built from the preview; without `decisions` everything new is added, nothing is replaced and the rules are kept. |

`source` and `target` are plugin names; pass `byId: true` with an id when two plugins share a name. A `slug` is refused, writing nothing, with code `plugin_slug_conflict` (another plugin of the project has it), `plugin_slug_forbidden`, `plugin_slug_locked` or `plugin_slug_invalid`; show the code and ask for another slug. After creating or cloning a plugin, tell the user how to install it (see "## Scope") if they want to work in it.

For a pull, `source` and `plugin` are named as "## Scope" says (`sourceById`, `pluginById`), and:

- `decisions` has the preview's shape: `sourceFingerprint` and `fingerprint` from the preview, per kind (`skills`, `agents`, `mcpServers`, `files`) the lists `add` and `replace`, and `rules` as `keep`, `append` or `replace`. Appended rules go under a heading with the source plugin's name. A replacement needs `confirmReplace: true` and the confirmation of step 3 of "## Flow".
- A pull with `decisions` is refused when either plugin changed since the preview. Repeat the preview, show the user what is different and apply with the new values; never retry with the old ones.
- A pull into the installed plugin leaves the local files stale until `athenode sync` (see step 5 of "## Flow"); into any other plugin it changes the server only.
- A pull is a one-time copy: the pulled items are independent of the source, nothing about the source is recorded and there is no update later. To take later changes of the source, pull again.
- Only a plugin of this project can be the source. Pulling from a plugin of another project exists only in the web app; for a library entry use the tools of "### Plugin library"; for a third-party plugin package use those of "### External plugins".

### External plugins

An external plugin is a third-party plugin package — an Agent Plugin (`plugin.json`), a Claude Code plugin (`.claude-plugin/plugin.json`), a marketplace or a `plugins/*` folder — taken from a public GitHub or GitLab repository URL or from a local folder. Its skills, agents, MCP servers and root `AGENTS.md` (as the rules) are imported into a plugin of the project; hooks, commands and the like are listed as ignored.

| Request | Tool | Notes |
|---|---|---|
| Import an external plugin | `plugins_external_import_preview`, then `plugins_external_import` (`source`, optional `pick`, `plugin`, `slug`, `name`) | Always preview first. When the package offers several plugins (`candidates`), ask which one and pass it as `pick`. Show what the picked one brings, its licence and attribution, the `warnings` and the `ignored` parts. Without `plugin` the import creates a new plugin with the proposed `slug` and `name`; with `plugin` it merges into that plugin, and the preview's `merge` part lists the new, conflicting and identical items. A preview expires after an hour. |
| List what a plugin was imported from | `plugins_external_sources` (optional `plugin`) | The URL and revision or the uploaded zip, the external plugin's name, licence class and the items it owns. |
| Update an external plugin | `plugins_external_update_preview`, then `plugins_external_update` (`pluginSource`, `plugin`, `path` for an uploaded one) | `pluginSource` is the id or name from `plugins_external_sources`. Show the items to add, those that change, those unchanged and those the new version no longer has; without `decisions` every new item is added and nothing is replaced or removed. |

- `decisions` has the preview's shape, with its `previewId`, `sourceFingerprint` and `fingerprint`; replacing or removing an item needs `confirmReplace: true` and the confirmation of step 3 of "## Flow". A `library_merge_stale` error means the plugin changed since the preview: repeat it.
- A local folder is resolved against the project root and uploaded as a zip, without `.git`, `node_modules` and links. Import only a folder the user named.
- An import or update into the installed plugin leaves the local files stale until `athenode sync` (see step 5 of "## Flow").

### Files of a plugin

| Request | Tool | Notes |
|---|---|---|
| Browse the file tree | `plugins_files_list` (optional `path`) | Lists one directory level; walk the directories the request needs. |
| Read a file | `plugins_files_get` (`path`) | |
| Create a file or directory | `plugins_files_create` (`path`, `content`, optional `summary`; `dir: true` for a directory) | Missing parent directories are created. Give every file a one-line `summary` saying when an agent should read it. |
| Change a file | `plugins_files_update` (`path`, `content` and/or `summary`) | Replaces the whole content: read the file first, change it and send the full text. Directories cannot be updated. |
| Move or rename a file | `plugins_files_get`, `plugins_files_create` at the new path, then `plugins_files_delete` of the old path | Delete the old path only after the create succeeded. |
| Delete a file or directory | `plugins_files_delete` (`path`; `recursive: true` for a non-empty directory) | List a non-empty directory first and show what goes with it. |

Content is passed inline and limited to 50000 characters per file; split a longer document into several files. Files are plain Markdown that agents and skills load at runtime, so write them as instructions for an agent, in English.

### Skills and agents of a plugin

| Request | Tool | Notes |
|---|---|---|
| List | `skills_list` / `agents_list` | Only what is attached to the plugin, not the whole catalog. |
| Create | `skills_create` / `agents_create` (`name`, `description`, `prompt`, optional `metadata`) | `description` is required. |
| Change | `skills_update` / `agents_update` (`identifier`, any of `description`, `prompt`, `metadata`, `rename`) | Omitted fields and unlisted metadata are kept. `prompt` replaces the whole body: start from the current body in the list result. |
| Remove | `skills_remove` / `agents_remove` (`identifier`) | Detaches it from the plugin; for the installed plugin, also removes its generated files. |

- `name` is lowercase words joined with `-`. `description` is one sentence starting with "Use when", since the coding assistant decides from it when to load the skill or delegate to the agent.
- Write a skill's `prompt` as: a first line stating its purpose, then `## Arguments` (if it takes any), `## Flow` with numbered steps, and `## Report`. Write an agent's `prompt` as a role statement, the steps it follows and the format of what it returns.
- `metadata` keys are either common fields or `<target>.<field>` for one coding assistant (`claudecode.allowed-tools`, `claudecode.argument-hint`, `claudecode.model` and the like). Set only what the user asked for or the skill needs; tool names differ per target, so never copy one target's tool list to another.
- A skill or agent created or renamed in the installed plugin is not available to the coding assistant at once: what brings it into use is the step of step 5 of "## Flow". Say so.

### MCP servers of a plugin

| Request | Tool | Notes |
|---|---|---|
| List | `mcp_servers_list` | |
| Create | `mcp_servers_create` (`name`, `transport`, then `command`, `args`, `env` for `stdio`, or `url`, `headers` for `http` / `sse`) | Ask for the transport and its fields if the request doesn't give them. |
| Change | `mcp_servers_update` (`identifier`, the fields to change) | A given `args`, `env` or `headers` replaces the whole value: read the server first and resend every entry that must stay. Switching the transport drops the old transport's fields. |
| Remove | `mcp_servers_remove` (`identifier`) | For the installed plugin, also removes its entries from the local MCP config files. |

- Secrets never go into a server definition: the plugin is shared with everyone who installs it. Write tokens and keys as `${VAR}` references in `env`, `headers`, `args` or `url`, and tell the user which variables to export. If the user pastes a literal secret, replace it with a `${VAR}` reference and say so. Publishing is stricter: `library_publish` is refused while any MCP server of the plugin, or one inline in an agent's metadata, holds a literal `env` or `headers` value, whatever its name; replace each one with a `${VAR}` reference and publish again.
- A server created or changed in the installed plugin connects only after the step of step 5 of "## Flow".

### Rules of a plugin

| Request | Tool | Notes |
|---|---|---|
| Read the rules | `rules_get` | |
| Change the rules | `rules_get`, then `rules_update` (`content`) | Replaces the whole text: change the current text and send it in full. The content is literal. |

### Plugin library

The plugin library has two levels of visibility: every signed-in Athenode user sees every entry with its whole content, and the open web sees an entry while its public display is on, which every publish turns on and `library_edit` turns off, and then its name, description and category and the full content of its agents, skills with their bundle files, rules and plugin files; MCP server configuration is public too and installable with `npx @athenode/cli use <slug>`. Each table row leaves out `entry` (with `byId`) and `plugin` (with `pluginById`), described in "## Scope"; the other parameters are in the tool descriptions.

| Request | Tool | Notes |
|---|---|---|
| Browse or search the library | `library_list` | Takes a search text (`query`), a `category` and a page size (`limit`), and has no sort order of its own; pass `nextCursor` back as `cursor`, with the same `query` and `category`, for the next page. Show name, version, publisher and counts. |
| Show one entry | `library_get` | Its metadata, version log and the lists of its items, without their texts. |
| Read one item of an entry | `library_item` | An agent, skill, skill file, MCP server, file or the rules text. Use it to show the user what an entry holds before they add it or choose a replacement. |
| Add an entry as a new plugin | `library_add` | Creates a new plugin on the server only: the installed plugin and the local files do not change. If the project already has a plugin of that name (`plugin_name_conflict`), offer the suggested free name. |
| Merge an entry into a plugin | `library_merge_preview`, then `library_merge` | Always preview first and show the new, conflicting and identical items and the state of the rules. Pass the user's choices as `decisions`, built from the preview; without `decisions` everything new is added, nothing is replaced and the rules are kept. |
| Update a plugin added from the library | `library_update_preview`, then `library_update` | Only for a plugin that was added as a whole from the library and has a newer version available (see `plugins_list`). The same preview and choices as a merge. |
| Publish a plugin, or a new version of it | `library_publish` | One tool for both: a plugin that already has an entry gets the next version, with an optional note. Every publish also turns the entry's public display on, unless an administrator made it unavailable for the entry; `confirmPublic: true` is the one consent to both, and the tool takes no `publicDisplay`. A first publish beyond the plan's library entry limit (3 entries on the Free plan) is refused; new versions are not limited. Needs the confirmation of step 3 of "## Flow". |
| Change an entry's name, description, category or public display | `library_edit` | Creates no new version. `publicDisplay: true` needs `confirmPublic: true` and the confirmation of step 3 of "## Flow"; `publicDisplay: false` needs neither. |
| Unpublish an entry | `library_unpublish` | Confirm first (step 3 of "## Flow"). |

- A merge or update with `decisions` is refused when the plugin or the entry changed since the preview. Repeat the preview, show the user what is different and apply with the new values; never retry with the old ones.
- A merge or update into the installed plugin leaves the local files stale until `athenode sync` (see step 5 of "## Flow"); into any other plugin it changes the server only.
- A plugin added with `library_add` carries the publisher's `settings/` files. After the user installs it, suggest the `atn:settings` skill to make them fit this project.
- Likes and skipping a version exist only in the web app.

## Safeguards

Name the consequence in the confirmation question whenever one of these applies:

- **The installed plugin** (`plugins_delete`): this project loses its skills, agents, rules and MCP servers on the next `athenode sync`. Suggest installing another plugin first.
- **The `athenode` MCP server** (`mcp_servers_remove`, or an update of its command or arguments): every tool this and every other Athenode skill uses comes from it; without it nothing works in a project that has the plugin installed until `athenode init` is re-run on a plugin that has it.
- **The `settings/` files** (`plugins_files_delete`, or an update of a `## Parameters` or `## Rules` section): the specification skills load them. Change parameters and rules by invoking the `atn:settings` skill instead; here, edit only their `## Custom` sections, keeping the other sections byte-for-byte.
- **The built-in skills and agents** (`atn:apply`, `atn:decompose`, `atn:mindmap`, `atn:settings`, `atn:manage`, `atn:todo-enqueue`, `atn:todo-dequeue`, and the `spec-*` and `todo-*` agents): they invoke each other by name, so removing or renaming one breaks the others. A changed built-in skill or agent no longer receives Athenode's updates.
- **The `MCP`, `Settings`, `Questions` and `Language` sections of the rules**: every Athenode agent and skill relies on them; keep them when changing the rules unless the user explicitly asks to drop them. The same holds for a merge or update that replaces the rules.
- **Publishing** (`library_publish`): the whole plugin becomes visible to every signed-in Athenode user and stays so until the entry is unpublished. Publish only the plugin the user named, never one you chose, and never to get around a limit or a refusal. The check for literal `env` and `headers` values is the only one made for the user: command arguments, URLs, rules, files and the texts of skills and agents are theirs to review.
- **Public display** (`library_publish`, `library_edit`): it puts the entry's details and the full content of its agents, skills with their bundle files, rules and plugin files on the open web. Publishing always turns it on, so never publish without the user's yes to the publishing question of step 3, which names the open web. With `library_edit` turn it on only when the user asked for it for that entry, never on your own judgment. If the server refuses because public display is unavailable for the entry, report that and do not retry; turning it off still works.
- **A replaced built-in skill, agent or `settings/` file** (`library_merge`, `library_update`, `plugins_pull`, `plugins_external_import`, `plugins_external_update`): the consequences of the bullets above apply to it as to a manual change.

Without a user to ask, perform no destructive operation, no publishing and no merge or update that replaces anything, and report each as skipped. A `plugins_pull`, `plugins_external_import` or `plugins_external_update` that replaces or removes anything is such a merge. The same holds for turning public display on: without a user to ask, never pass `publicDisplay: true` to `library_edit`.

## Report

- Every operation performed, with the object's name (and id for plugins) and what changed; listings as a compact table. Name the plugin whenever it is not the installed one.
- Every operation skipped, declined or failed, with the reason or the error text.
- What the user has to do next: the step of step 5 of "## Flow", per tool, for new or renamed skills, agents and MCP servers of the installed plugin (`athenode sync`); export the environment variables a server references; run `athenode init --plugin <id or slug>` to install a new plugin — one created here, imported or added from the library — or one changed here that is not installed.
- After a publish, the entry's name and version; after a merge, update or import, what was added, replaced and removed.
