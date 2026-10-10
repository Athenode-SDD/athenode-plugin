# Athenode standard setup

The agent setup every new [Athenode](https://athenode.com) project starts with: the skills,
subagents, rules, settings files and MCP server of Athenode's spec-driven development workflow.

Athenode installs it into a project for Claude Code, Codex, Cursor and the other supported coding
agents with `npx @athenode/cli init`. This repository is the source of that setup; the files here
are in Athenode's source format, not in the format of any single coding agent.

## Layout

| Path | What it is |
|---|---|
| `description.md` | The setup's description, shown in Athenode. |
| `rules/athenode.md` | The rules text, installed into `CLAUDE.md`, `AGENTS.md` and their counterparts. |
| `subagents/<name>.md` | One subagent per file. |
| `skills/<name>/SKILL.md` | One skill per directory. |
| `settings/<name>.md` | The workflow settings files the skills and subagents load at runtime. |
| `mcp.json` | The setup's MCP servers. |
| `docs/targets.md` | Per-target metadata: tool names and the reasons behind each block. |

## Format

- A subagent or skill file is YAML frontmatter followed by the prompt. The frontmatter holds
  `name` (equal to the file or directory name) and `description`, then one block per target with
  the fields only that coding agent reads; see [docs/targets.md](docs/targets.md).
- A settings file has one frontmatter key, `summary`; the rest is the file as a project receives
  it.
- `description.md` and `rules/athenode.md` are plain Markdown without frontmatter.
- The blank line after a frontmatter block is not part of the text.

Check a change with:

```sh
npm ci
npm test
```

## How a change reaches projects

Athenode pins a commit of this repository and ships its content with a release of the service. A
project's own copy of the setup then receives the new version of every part the project has not
changed; parts a project changed keep the project's version. See
[the documentation](https://athenode.com/docs) for the details.

## License

[Apache-2.0](LICENSE).
