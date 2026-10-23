<p align="center">
  <a href="https://athenode.com">
    <img src="assets/logo.svg" alt="Athenode logo" width="96">
  </a>
</p>

<h1 align="center">Athenode</h1>

<p align="center">
  Think your product through before your AI coding agent writes code.
</p>

<p align="center">
  <a href="https://athenode.com">Website</a> ·
  <a href="https://athenode.com/docs">Documentation</a> ·
  <a href="https://athenode.com/docs/getting-started">Quickstart</a> ·
  <a href="https://lib.athenode.com">Plugin library</a> ·
  <a href="https://athenode.com/docs/install">Install</a>
</p>

## The standard Athenode plugin

[Athenode](https://athenode.com) is a spec-driven development platform. You grow a tree of specifications (specs), from the whole application down to a task an agent finishes in one go, and your own AI coding tool builds from it.

This repository holds the standard Athenode plugin, the plugin every new Athenode project starts with. A plugin is a named bundle of what your AI coding tools work with: skills, agents, rules, MCP servers and plugin files. The standard plugin contains 7 skills, 10 agents, 1 rules text, 1 MCP server and 5 settings files, and one command installs it into Claude Code, Codex, Cursor or any other of the [30 supported AI tools](https://athenode.com/docs/supported-ai-tools).

## What you get

An AI coding agent is good at a well-defined task and bad at guessing what you meant. A feature larger than one prompt holds decisions you have not made, and your agent makes them for you as it writes the code. With Athenode the work is thought through and written down first, then it is built.

| Advantage | What it means for you |
|---|---|
| A spec tree that grows in depth | You work out a whole application before any code exists and deepen any part of it whenever you need to. Any spec can have sub-specifications, to any depth. |
| Your agent asks about what you did not think of | A mind map is a session in which your AI agent asks rounds of questions and turns your answers into a spec. Before the first question it looks at your codebase and at the specs you already have. |
| From a thought-through tree to code | An apply run implements the leaf specs under a spec in the order their blockers allow. It plans, implements and reviews each one, goes on by itself and stops only when something falls outside the spec and needs you. Several apply runs can work at the same time, in separate sessions or on separate branches. |
| The workflow follows your project's settings | You choose once per project how thoroughly the agent tests, whether tests come before the code (TDD) or after it, when the code is reviewed and what the agent does with git, from branches and commits to an open pull request. You can add rules of your own on top. |
| Search by meaning across the tree | You find a spec by describing it in your own words, in the web app or from your AI tool. Your agent searches the same way before it writes a spec, so it sees the specs the new one depends on or overlaps with. |
| ToDo cards for what turns up along the way | A follow-up, tech debt, a bug or an idea becomes a ToDo card. An agent carries a card out by itself when it needs no answer from you, or the card becomes a spec through a mind map. |
| One plugin for every AI tool you use | The Athenode CLI installs the plugin in the format each AI tool reads. Your own rules and MCP servers are kept, and you see every change before it is made. |
| Your code stays in your repository | Athenode keeps your specs with their questions, answers, plans and statuses, your ToDo cards and your plugins. Your AI tool does the building in your repository, on your subscription to it. |

## Install

You need Node.js 22.12 or later and one of the [supported AI coding tools](https://athenode.com/docs/supported-ai-tools). Athenode runs on your own machine, with no account: the `athenode` package holds the CLI and the local Athenode service (the daemon) that stores your specs and plugins. A team runs a self-hosted Athenode Pro server instead.

1. Install the package and the service:

   ```bash
   npm i -g athenode
   athenode service install
   ```

2. In the root of your repository, run:

   ```bash
   athenode init
   ```

   For a Pro server, run `athenode init --server <url>` and sign in through the browser.
3. Choose or create the project, choose your AI tools and confirm the plan that `init` shows.
4. Do what `init` prints under "Still to do in your tools", such as trusting the project folder or restarting a running session, so that each tool loads the skills, the agents and the Athenode MCP server.

The [Quickstart](https://athenode.com/docs/getting-started) goes through each step, and [Install a plugin](https://athenode.com/docs/plugins/install) describes everything `init` does.

`init` gives each tool the plugin in the form that tool reads: a plugin package where the tool takes one, and files elsewhere. For Claude Code the skills, the agents and the Athenode MCP server are also published as the plugin package `atn` in this repository's marketplace. The project still needs `init` once, because the plugin package carries no rules and no settings files. When the plugin package is enabled for the project, `init` asks whether to keep it and write the rules only, or to replace it with its own install. To install the plugin package, run in Claude Code:

```text
/plugin install atn --marketplace Athenode-SDD/athenode-plugin
```

On Claude Code before 2.1.275, add the marketplace first with `/plugin marketplace add Athenode-SDD/athenode-plugin`, then run `/plugin install atn@athenode`. [The plugin package's README](plugins/claude-code/README.md) describes what it runs.

## Use the skills

A skill is a reusable set of instructions that your AI tool runs as a command, such as `/atn:mindmap`. The skills below are written as the commands of the plugin package `atn`, which is what you type in a tool that received the plugin as a plugin package and puts the package's name in front of a skill, such as Claude Code. Installed as files, the same skill is `/atn-mindmap`, and some tools have you name the skill to the agent. [Supported AI tools](https://athenode.com/docs/supported-ai-tools) gives the form for each tool, and `init` prints how to run the settings skill in each tool you selected.

You run the skills in your AI tool, in this order: settings once for the project, then a mind map for each piece of work, a decomposition when the work is large, and an apply run to have it built.

### 1. Choose how your project works with `/atn:settings`

You run `/atn:settings` once, before the first piece of work. The skill looks at your repository and asks how agents should work in it: how thoroughly they test, whether tests come before the code (TDD) or after it, when the code is reviewed and what the review checks, and what they do with git, from branches and commits to an open pull request. Every later step follows your answers. You run the skill again whenever you want to change them, and you can add rules of your own on top.

### 2. Think the work through with `/atn:mindmap`

You start a mind map with what you want to build, in a sentence. A mind map is a session in which your AI agent asks rounds of questions and turns your answers into a spec, one described piece of work. Before the first question the agent looks at your codebase and at the specs you already have, so the questions are about the decisions you have not made. After each round you choose the next topic, and you decide when the mind map is finished.

The result is a spec with the status Prepared, which means ready to be decomposed or implemented. You read it in the web app, with the questions and answers behind it. A small change needs only this step before you apply it.

### 3. Break large work into stages with `/atn:decompose`

You decompose a spec when it is too big for an agent to finish in one go. To decompose a spec is to break it down into one level of stages, each a spec of its own. The skill asks the questions each stage raises, writes each stage from your answers and links the stages with blockers. A blocker is a dependency between two specs: a spec that is blocked by another is implemented after it.

You decompose a stage again wherever it is too big, so the spec tree grows as deep as the work needs. A leaf spec, a spec with nothing below it, is what your agent implements.

### 4. Have it built with `/atn:apply`

You apply a spec when it is thought through. Your AI agent goes through the leaf specs under it in the order their blockers allow. For each leaf it records an implementation plan and writes the code, then tests, reviews and commits the way you chose in the settings.

An apply run goes on by itself and stops only when something falls outside the spec and needs you. Each spec's status changes in the web app while the agent works, and a spec becomes Completed when everything under it is. Several apply runs can work at the same time, in separate sessions or on separate branches.

### 5. Keep what turns up as ToDo cards

A ToDo card is a short note of work to do later: a follow-up, tech debt, a bug or an idea. At the end of an apply run you choose which of your agent's findings become cards, and `/atn:todo-enqueue` adds a card of your own at any moment of a session.

`/atn:todo-dequeue` works through the open cards one by one. A card that needs thinking through becomes a spec through a mind map, and a card that needs no answer from you is carried out directly by an agent.

### 6. Change the plugin with `/atn:manage`

`/atn:manage` takes no part in building a spec. You use it when you want to change what your agents work with: you describe the change, and the skill lists, creates, changes or deletes plugins and their skills, agents, rules, MCP servers and files, imports external plugins, and works with the plugin library.

### Where to read more

While a skill runs, it hands work to the 10 agents of the plugin, such as a planner, an implementer and a reviewer. You do not run them yourself. The documentation has the arguments and options of each skill and the role of each agent.

| Topic | Documentation |
|---|---|
| The workflow as a whole | [The Athenode workflow](https://athenode.com/docs/workflow) |
| Each skill | [`/atn:settings`](https://athenode.com/docs/workflow/atn-settings), [`/atn:mindmap`](https://athenode.com/docs/workflow/atn-mindmap), [`/atn:decompose`](https://athenode.com/docs/workflow/atn-decompose), [`/atn:apply`](https://athenode.com/docs/workflow/atn-apply), [`/atn:todo-enqueue`](https://athenode.com/docs/todo-cards/atn-todo-enqueue), [`/atn:todo-dequeue`](https://athenode.com/docs/todo-cards/atn-todo-dequeue), [`/atn:manage`](https://athenode.com/docs/plugins/atn-manage) |
| Skills, agents and settings files of this plugin | [Standard Athenode plugin](https://athenode.com/docs/plugins/standard-plugin) |
| How to run a skill in each AI tool | [Supported AI tools](https://athenode.com/docs/supported-ai-tools) |
| Specs, statuses and search | [Specifications](https://athenode.com/docs/specifications), [Search by meaning](https://athenode.com/docs/specifications/search) |
| ToDo cards | [ToDo cards](https://athenode.com/docs/todo-cards) |

## Make the plugin your own

Your project's copy of the standard plugin is yours to edit: change a skill, add an agent, write rules of your own or add an MCP server, in the web app or with `/atn:manage`. For a different job, such as a security review of your application, you install a different plugin. The [plugin library](https://lib.athenode.com) is the shared catalogue of plugins that projects have published, and anyone can browse it.

When Athenode changes the standard plugin, it updates your project's copy part by part.

| Part of your copy | What an update does |
|---|---|
| A built-in skill or agent that your project has not changed | Receives the version from the standard plugin. |
| A built-in skill or agent that your project changed | Keeps your version. |
| The rules, if your project has not changed them | Receive the version from the standard plugin. |
| The rules, if your project changed them | Keep your version. |
| A skill or agent that the standard plugin gains | Is added, unless your copy already has one of that name. |
| Settings files, MCP servers and everything you added | Stay as they are. |

An update changes the copy in your Athenode project. To bring it into a local project directory, run `athenode sync` there. `init` shows the changed files in its plan before it writes them.

Go deeper: [Standard Athenode plugin](https://athenode.com/docs/plugins/standard-plugin) · [Plugins](https://athenode.com/docs/plugins) · [Plugin library](https://athenode.com/docs/library) · [Athenode MCP server](https://athenode.com/docs/athenode-mcp)

## Repository layout

The files are in Athenode's source format, which the Athenode CLI turns into the format each AI tool reads. The repository is `Athenode-SDD/athenode-plugin`; a local clone made before its rename may still sit in a directory named `athenode-setup/` until it is moved.

| Path | What it holds |
|---|---|
| `description.md` | The plugin's description, shown in Athenode. |
| `rules/athenode.md` | The rules text, installed as the Athenode rules block in `CLAUDE.md`, `AGENTS.md` and their counterparts. |
| `subagents/<name>.md` | One agent per file. |
| `skills/<name>/SKILL.md` | One skill per directory. |
| `settings/<name>.md` | The five settings files. |
| `mcp.json` | The plugin's MCP server, `athenode`. |
| `docs/targets.md` | The per-tool metadata: tool names and the reason behind each block. |
| `plugins/claude-code/` | The plugin as a Claude Code plugin package, built from the skills, the agents and `mcp.json` by the generator of `@athenode/cli`. |
| `skills.sh.json` | How the repository's page on skills.sh shows the skills. |

A skill or agent file is YAML frontmatter followed by the prompt. The frontmatter holds `name`, equal to the file or directory name, and `description`, then one block per AI tool with the fields only that tool reads. A settings file has one frontmatter key, `summary`. The blank line after a frontmatter block is not part of the text.

```yaml
---
name: atn-apply
description: Use when a prepared specification (or subtree) should be planned, implemented, reviewed and committed leaf by leaf.
claudecode:
  argument-hint: "[spec_id_or_name]"
  allowed-tools: Agent, SendMessage, AskUserQuestion, Skill, Bash
copilot:
  argument-hint: "[spec_id_or_name]"
  allowed-tools:
    - agent
    - execute
---
```

### Claude Code plugin

`plugins/claude-code/` and `.claude-plugin/marketplace.json` are generated and are never edited by hand. They are built by the plugin generator of the Athenode CLI ([`@athenode/cli`](https://www.npmjs.com/package/@athenode/cli), its `@athenode/cli/plugin` entry), the same one the CLI uses to install a plugin as a plugin package, so the package here is what the CLI builds from a project's copy of this plugin. `scripts/build-plugin.mjs` reads the files, hands them to the generator and writes what comes back, with the additions listed below.

After a change to a skill, an agent or `mcp.json`, regenerate the plugin and commit the result with the change:

```bash
npm run build
```

What the generator does with the names:

- Claude Code puts the plugin's name in front of each skill and agent, so the plugin is named `atn` and a skill whose name starts with `atn-` loses that prefix: `/atn-mindmap` is `/atn:mindmap`, and the agent `spec-implementer` is `atn:spec-implementer`.
- In the texts, a name is rewritten only inside backticks or directly after a slash: `` `atn-apply` `` and `/atn-apply` become `` `atn:apply` `` and `/atn:apply`, and a name in plain prose stays as it is. Write the name of a skill or an agent in backticks wherever the text means the thing to invoke.
- The frontmatter is the one Claude Code reads, taken from the `claudecode` block.
- The plugin carries no rules and no settings files: the Athenode CLI writes the rules into the project's rules file.

What the build adds for [Anthropic's plugin directory](https://claude.com/docs/plugins/submit), which the standard plugin itself has nothing for:

- **README.** `plugins/claude-code/README.md` is a copy of `docs/plugin-readme.md`. It must describe everything the plugin runs, sends and fetches: update it with any change to that.
- **Version.** The plugin's `version` is the `version` of `package.json`. Raise it with each change to the plugin: Claude Code updates an installed plugin only when its version changes.
- **Listing fields.** The manifest gets `displayName` (`Athenode`; the commands keep the `atn:` prefix of `name`) and the fields Anthropic's directory shows on the plugin's page: `icon`, `documentationUrl`, `supportUrl`, `privacyPolicyUrl` and `termsOfServiceUrl`.
- **Icon.** `plugins/claude-code/.claude-plugin/icon.png` is a copy of `assets/icon.png`, a square PNG of 512 to 2048 px.
- **No unscoped `Bash`.** Each skill's `allowed-tools` loses the plain `Bash`, which pre-approves any shell command and holds the plugin for review: in the plugin, Claude Code asks before each shell command. The standard plugin itself, installed by the CLI, keeps it.
- **Internal for the `skills` CLI.** Each skill gets `metadata.internal: true`, so that `npx skills add` lists the skills of `skills/` only (see "skills.sh" below). Claude Code ignores the field.
- **The daemon's MCP server.** In the plugin, Athenode's MCP server is the local daemon's Streamable HTTP endpoint, `http://127.0.0.1:${ATHENODE_PORT:-3717}/api/mcp` (Claude Code expands the default port and lets `ATHENODE_PORT` override it), where `mcp.json` names the daemon's default address, `http://127.0.0.1:3717/api/mcp` (`athenode init` writes the daemon's project URL in each repository instead). The URL names no project: the daemon binds each session to the repository's project through Claude Code's MCP roots and the repository's `.athenode/config.json` (written by `athenode init`). It needs a running daemon (`npm i -g athenode`, then `athenode service install`). With both the plugin and a repository's `.mcp.json` entry, Claude Code lists two Athenode servers; both bind to the same project.

The build fails when the generator cannot package the standard plugin as it is, for example two skills that get one name once the prefix is dropped (`atn-review` beside `review`) or an MCP server whose command holds a `${VAR}`. A skill without the `atn-` prefix is not an error by itself: it keeps its name, as `/atn:review`.

**The generator's version is pinned** in `package.json`: `@athenode/cli` in `devDependencies`, an exact version, installed by `npm ci`. A generator of any other version is refused. Raise it by hand (`npm i -D -E @athenode/cli@<version>`, then `npm run build`); no hook raises it any more, since the plugin no longer runs the CLI.

`scripts/standard-plugin.mjs` (`loadStandardPlugin`) reads the standard plugin for the generator.

Check a change before you open a pull request:

```bash
npm ci
```

```bash
npm test
```

`npm test` validates the plugin, including that no text still uses a name from before the rename to plugins (`scripts/legacy-terms.mjs`), runs the tests of the build and fails when the committed plugin differs from what the generator builds, byte for byte. Commit the rebuilt plugin before you go on: Athenode's own build refuses a checkout with uncommitted changes.

### Smithery

The plugin's skills are listed on [Smithery](https://smithery.ai/skills/athenode/atn-mindmap) as `athenode/atn-<name>`. Each skill points at its directory in `plugins/claude-code/skills/` on `main`. The `Smithery skills` workflow (`.github/workflows/smithery-skills.yml`) runs on each push to `main` that changes those directories, and you can also start it by hand. It creates the new skills and refreshes the others. It needs the repository secret `SMITHERY_API_KEY`, a key of the owner of the Smithery namespace `athenode`. The workflow does not remove a skill that was taken out of the plugin: delete that skill on Smithery yourself.

### skills.sh

[skills.sh](https://skills.sh) has no submission step: it lists a skill once someone installs it with the `skills` CLI, which finds the skills of this repository in `skills/`:

```bash
npx skills add Athenode-SDD/athenode-plugin
```

That installs the skill files only, without the agents, the rules, the settings files and the Athenode MCP server the skills call. A skill installed this way works in a project where `athenode init` has run; "Install" above is the way to get the whole plugin.

`skills.sh.json` sets how the repository's page on skills.sh shows the skills: one group with a title and a description, which holds every skill in the order of the workflow. `npm test` fails when a skill of `skills/` is missing from it. skills.sh reads the file from `main` when someone installs a skill, and caches the page, so a change shows up after the next install.

The `skills` CLI also reads `.claude-plugin/marketplace.json`, so it would list each skill a second time from the plugin, without the `atn-` prefix. The build marks the plugin's skills as internal to keep one entry per skill.

### Plugin library

The plugin is also the pinned entry of Athenode's [plugin library](https://lib.athenode.com/athenode), and every push to `main` publishes it there as a new version when its content changed. Each library version is an immutable snapshot: a zip of `snapshot.json`, the plugin in Athenode's neutral export format inside an envelope with the entry's name, description and category, and one `blobs/<sha256>` entry per bundle file.

- `scripts/library-snapshot.mjs` builds that archive from the files of this repository: the skills with their bundle files, the subagents, the rules, the settings files with their `summary`, `mcp.json` and `description.md`. The entry is `Athenode` in the category `programming`, and the plugin is named `atn`. The output is the same bytes for the same files. `npm run library:snapshot` writes it to `library-snapshot.zip`.
- `scripts/publish-library.mjs` downloads the entry's current snapshot from the public library API and compares the content with the archive, leaving out what the server adds. When it is the same, nothing is uploaded. Otherwise the script gets a client-credentials token of the Keycloak client `athenode-library-publisher` and uploads the archive as the entry's next version, with the commit as the version note.
- The `Publish to the plugin library` workflow (`.github/workflows/publish-library.yml`) runs `npm ci`, `npm test` and the publish script on each push to `main`, and you can also start it by hand. It never runs for a pull request.

The workflow needs the repository secrets `ATHENODE_LIBRARY_CLIENT_ID` (`athenode-library-publisher`) and `ATHENODE_LIBRARY_CLIENT_SECRET`, the secret of that Keycloak client. The repository variables `ATHENODE_API_URL` (default `https://platform.athenode.com/api`), `ATHENODE_KEYCLOAK_URL` (default `https://auth.athenode.com`) and `ATHENODE_STANDARD_ENTRY_SLUG` (default `athenode`) override where it publishes.

On a database without the entry, such as a fresh local stack or staging, the first upload creates it: the backend makes the repository publisher's upload to the missing standard slug the pinned standard entry, owned by the Athenode system organisation and shown publicly, at version 1. Nothing has to be set up by hand in the database.

To publish into the local development stack (`docker compose up` in the root of the Athenode checkout, with this repository and `keycloak` next to each other), run `npm run library:publish:local`. It runs the publish script with the local defaults: the backend at `http://localhost:3001/api`, Keycloak at `http://localhost:8080` and the client `athenode-library-publisher` with its development secret, which it reads at run time from `../keycloak/realm-export.json` (or the file `ATHENODE_REALM_EXPORT` names) and fails with a clear message when that file is missing. Every variable you set yourself, such as `ATHENODE_API_URL` or `ATHENODE_LIBRARY_CLIENT_SECRET`, wins over its default. The realm export is imported only on the first boot of the Keycloak database, so an older local realm without the client needs the realm recreated (see the root `README.md`, Keycloak).

The publish script asks the public library API as the pinned `@athenode/cli` version (the `X-Athenode-Cli-Version` header, overridden by `ATHENODE_CLI_VERSION`). The backend refuses a CLI older than its minimum, 0.11.0 since the cut-over, with `426 CLI_UPGRADE_REQUIRED`, so the pin must be at least that version before a push to `main` publishes.

## Licence

The content of this repository is published under the [Apache-2.0 licence](LICENSE). Athenode runs as the free local `athenode` daemon or a self-hosted Athenode Pro server, and its CLI, [`@athenode/cli`](https://www.npmjs.com/package/@athenode/cli), is published under the same licence.
