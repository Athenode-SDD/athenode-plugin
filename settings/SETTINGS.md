---
summary: "Index of the project's workflow settings: initialization flag, category files and sub-project settings folders. Load it before starting work."
---

# Settings

## Parameters

- initialized: false

## Category files

Each category file has `## Parameters` (the chosen `key: value` lines), `## Rules` (ready-to-follow instructions in
fixed `###` subsections, written by the `atn-settings` skill) and `## Custom` (project-specific rules, never
overwritten). Agents load only the subsections their role needs; a missing file or subsection skips its step.

- [gitflow.md](gitflow.md) — `### Apply start`, `### Leaf done`, `### Review approved`, `### Apply end`, `### Implementation`: branches, commits, tags and pushes of apply runs.
- [testing.md](testing.md) — `### Planning`, `### Implementation`: test depth, e2e policy and failing-test fix attempts.
- [code-review.md](code-review.md) — `### Leaf done`, `### Apply end`, `### Review`, `### Findings`: review mode, check groups and auto-fix rounds.
- [methodology.md](methodology.md) — `### Spec authoring`, `### Planning`, `### Implementation`: development methodology and the project's non-negotiable rules.

## Sub-projects

A file follows the settings folder of the row whose repository path is the longest `path/` prefix of its path; every other file follows the root `settings/` files.

| repository path | settings folder |
|---|---|
