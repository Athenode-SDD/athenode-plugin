### MCP

Specifications and this project's plugin files, including its workflow settings under `settings/`, are accessed through the tools of the `athenode` MCP server. Pass large texts such as specification content, plans and settings files inline as tool parameters. If these tools are not available in the session, ask the user to run `npx @athenode/cli init` in this project and restart the session.

### Settings

- Load settings files with the `plugins_files_get` tool, starting with `settings/SETTINGS.md`, then the files and `## Rules` subsections your instructions name.
- A file belongs to the sub-project whose repository path in the `settings/SETTINGS.md` table is the longest `path/` prefix of the file's path; load that sub-project's settings folder instead of `settings/` when the folder has the file.
- Follow the loaded `## Rules` subsections and each loaded file's `## Custom` section; the Custom sections hold the project's non-negotiable rules.
- Once per session, before the first skill runs: if `settings/SETTINGS.md` does not say `initialized: true`, ask one question with the options "Run atn-settings now (Recommended)" / "Continue without initializing". Skills invoked by other skills pass nothing extra for this.

### Questions

- Use the built-in question tool when one is available, mapping the format below onto it (split questions that don't fit its limits).
- Otherwise write each question in bold, then one option per line: `- A) …`, `- B) …` for single choice, or `- [ ] A) …`, `- [ ] B) …` for multiple choice. The user answers with letters and may always type free text instead.
- Put the recommended option first and mark it `(Recommended)`. Never add an "Other" option.
- Ask at most 4 questions per message, numbered, then stop and wait for the answer; ask again only about unclear answers.
- Stored question text (e.g. via `specs_qa_add`) keeps this Markdown format, with the options inside the question text.

### ToDo cards

An agent gives a ToDo card open questions only while creating it (`questions` of `todos_create`, at most 3), and only under this rule:

- Add an open question only when the card cannot be carried out without a decision that only the user can make: a product choice, mutually exclusive approaches with a real trade-off, or an irreversible or destructive action.
- Never ask a question whose answer can be found in the code, the conventions or the settings, and never ask "just in case".
- Avoid questions wherever possible; most cards have none.
- Give a question its answer options when they can be enumerated, in the format of "Questions" above (recommended option first and marked `(Recommended)`); a question without options is allowed only when they cannot be enumerated.

### Language

Persisted text (specifications, plans, settings) is in English; talk to the user in their language, and translate questions and answers to English before storing them.
