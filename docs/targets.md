# Per-target metadata

The frontmatter of every subagent and skill holds the keys common to all tools (`name`,
`description`) at the root, and one block per target for what only that tool reads. A block is
keyed by the Athenode target id (`claudecode`, `codexcli`, `cursor`, `copilot`, `copilotcli`,
`opencode`, `antigravity-ide`, `antigravity-cli`, `devin`, `junie`, `kiro-ide`, `kiro-cli`, …).

Values keep each tool's own shape: `claudecode`, `codexcli` and `cursor` take lists such as `tools`
and `allowed-tools` as one comma-separated string, every other target takes a YAML list, and
OpenCode's subagent `tools` is a map.

## Tool names

The `claudecode` block holds Claude Code tool names. Every other target's `tools` /
`allowed-tools` value is passed to that tool verbatim, so it uses the tool's own documented
vocabulary (checked against each tool's documentation in September 2026):

| Claude Code | copilot, copilotcli | kiro-ide, kiro-cli | junie     | devin | antigravity-*        | opencode  |
|-------------|---------------------|--------------------|-----------|-------|----------------------|-----------|
| Bash        | execute             | shell              | Bash      | exec  | run_command          | bash      |
| Read        | read                | read               | Read      | read  | view_file            | read      |
| Grep        | search              | read               | Grep      | grep  | grep_search          | grep      |
| Glob        | search              | read               | Glob      | glob  | -                    | glob      |
| Edit        | edit                | write              | Edit      | edit  | replace_file_content | edit      |
| Write       | edit                | write              | Write     | write | -                    | write     |
| Agent       | agent               | subagent           | -         | -     | invoke_subagent      | task      |
| WebFetch    | web                 | web                | -         | -     | -                    | webfetch  |
| WebSearch   | web                 | web                | WebSearch | -     | -                    | websearch |
| Skill       | (dropped)           | (dropped)          | (dropped) | -     | -                    | skill     |

`-` means no documented name could be verified. `SendMessage` and `AskUserQuestion` exist in
Claude Code only and are never mapped.

- A subagent's `tools` list (antigravity-*, junie; devin's `allowed-tools`) restricts the subagent.
  A subagent that uses a tool without a verified name therefore gets no list for that target at
  all (all tools), not a list that would wrongly restrict it.
- OpenCode's subagent `tools` is a `{name: false}` map that disables the listed tools the Claude
  Code list lacks.
- A skill's `allowed-tools` only pre-approves tools, so skills keep the names that can be mapped.
- antigravity-*, junie and kiro-ide have no skill fields, and kiro-cli's
  (license / compatibility / metadata) have nothing to carry, so skills have no block for them.

## The athenode MCP server

Every subagent reaches specifications and setup files through the tools of the `athenode` MCP
server (see `mcp.json`).

- Claude Code accepts the server-level `mcp__athenode` entry in a subagent's `tools` (all of the
  server's tools), so `claudecode.tools` lists it.
- No other target's MCP tool naming in a subagent tool list could be verified, so every other
  subagent block carries no `tools` / `allowed-tools` list at all (all tools, MCP included).
  OpenCode keeps its deny map, which leaves MCP tools reachable.
- Skills never list athenode tools in `allowed-tools`: that field only pre-approves tools, and
  Athenode would read such an entry as an MCP server the skill requires.

## Targets without tool lists

None of these targets has a tools list that could be filled with verified names, so none gets a
`tools` / `allowed-tools` value (all tools):

| target       | subagent tool field           | skill tool field |
|--------------|-------------------------------|------------------|
| kilo         | permission (map)              | allowed-tools    |
| factorydroid | tools                         | allowed-tools    |
| grokcli      | -                             | -                |
| qoder        | tools, disallowedTools        | -                |
| commandcode  | tools, disallowedTools        | -                |
| codewhale    | -                             | -                |
| mimocode     | tools (map), permission (map) | allowed-tools    |
| zcode        | tools, disallowedTools        | -                |
| vibe         | enabled_tools, disabled_tools | allowed-tools    |
| rovodev      | -                             | allowed-tools    |
| zoocode      | groups, allowedMcpServers     | -                |
| pool         | -                             | -                |
| qwencode     | tools, disallowedTools        | allowedTools     |
| codebuddy    | -                             | -                |
| augmentcode  | tools, disabled_tools         | -                |
| goose        | -                             | -                |
| kimi-code    | tools, disallowedTools        | -                |
| deepagents   | -                             | allowed-tools    |
| omp          | -                             | allowed-tools    |
| reasonix     | allowed-tools                 | -                |
| bob          | groups                        | -                |

No subagent needs a block for these targets: none of their fields is required. The skills carry
one block, qwencode's `argument-hint`, next to the other targets' hints.
