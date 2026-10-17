# Athenode for Claude Code

[Athenode](https://athenode.com) is a spec-driven development platform. You grow a tree of specifications (specs), from the whole application down to a task an agent finishes in one go, and Claude Code builds from it. This plugin package, `atn`, is the standard Athenode plugin for Claude Code: 7 skills, 10 agents and the Athenode MCP server.

## Requirements

- An [Athenode account](https://platform.athenode.com) with a project, and a project token from the project's **Tokens** page.
- Node.js 22.12 or later, with `npx` on the `PATH`.
- The project initialized once: run `npx @athenode/cli init` in the root of your repository and enter the token. Until then the skills stop and ask you to run it.

## Install

In Claude Code:

```text
/plugin install atn --marketplace Athenode-SDD/athenode-plugin
```

On Claude Code before 2.1.275, add the marketplace first with `/plugin marketplace add Athenode-SDD/athenode-plugin`, then run `/plugin install atn@athenode`.

## Skills

| Skill | What it does |
|---|---|
| `/atn:settings` | Asks once per project how agents test, review and use git, and stores the answers as the project's settings files. |
| `/atn:mindmap` | Turns what you want to build into a spec through rounds of questions, after looking at your codebase and your existing specs. |
| `/atn:decompose` | Breaks a large spec into one level of stage specs, linked by blockers. |
| `/atn:apply` | Plans, implements, reviews and commits each leaf spec under a spec, in the order its blockers allow. |
| `/atn:todo-enqueue` | Adds a ToDo card: a follow-up, tech debt, a bug or an idea. |
| `/atn:todo-dequeue` | Works through the open ToDo cards one by one. |
| `/atn:manage` | Lists, creates, changes or deletes plugins and their skills, agents, rules, MCP servers and files, and imports external plugins. |

The 10 agents (`atn:spec-implementer`, `atn:spec-implementation-reviewer` and the others) are run by the skills; you do not run them yourself.

The skills pre-approve no shell commands: Claude Code asks before each one they run, such as `git status` or `git commit`. To let a long `/atn:apply` run go on by itself, allow the commands you trust in your [permission settings](https://code.claude.com/docs/en/permissions).

## Examples

1. `/atn:settings`, then answer the questions: the project's workflow settings are chosen and stored.
2. `/atn:mindmap Let users export their invoices as CSV`: a spec with the status Prepared, with the questions and answers behind it.
3. `/atn:decompose Invoice export`: the spec broken into stage specs, each with its questions answered.
4. `/atn:apply Invoice export`: the code written, tested, reviewed and committed spec by spec, with each spec's status updated in Athenode.

## What the plugin runs, sends and fetches

- **The MCP server.** Claude Code starts `npx -y @athenode/cli@<version> mcp`, a pinned version of the [Athenode CLI](https://www.npmjs.com/package/@athenode/cli), downloaded from the npm registry on first use. The CLI's source is public on npm.
- **Where it connects.** The server talks only to the Athenode API, `https://api.athenode.com`, authenticated with the project token that `init` stores in `.athenode/config.json` in your repository. Keep that file out of version control. The environment variables `ATHENODE_TOKEN` and `ATHENODE_API_URL` override the stored token and the API address.
- **What it sends.** What the skills write to your Athenode project: specs with their questions, answers, implementation plans, statuses and blockers, ToDo cards, and the plugin with its skills, agents, rules, MCP servers and settings files. It sends no source code by itself; a spec or a plan holds what Claude writes into it, which can quote your code.
- **What it fetches.** Your project's specs, ToDo cards and plugins. The skills read the project's settings files (`settings/*.md`) from Athenode and follow them: they hold the workflow choices you made with `/atn:settings` and the rules you added yourself, and you can read and edit them in the web app at any time.
- **The plugin library.** `/atn:manage` can browse plugins that other Athenode projects published, and add or merge one into your project, only when you ask for it. It imports an external plugin from a repository or a folder only when you name it. Publishing a plugin of yours to the library, which makes it public, is done only after you confirm it.
- **Nothing else.** No hooks, no telemetry, no other network calls. The plugin does not change Claude Code's permission settings.

## License

Apache-2.0. The source of the plugin is [Athenode-SDD/athenode-plugin](https://github.com/Athenode-SDD/athenode-plugin).
